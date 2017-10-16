'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const child_process = require('child_process');
const kill = require('tree-kill');


/**
 * Reads a `ReadableStream` by lines.
 *
 * @param  {ReadableStream}  stream  The stream to read.
 * @param  {function(string)}  lineCallback  Called with each line of the stream data.
 * @param  {function()}  endCallback  Called when the stream signals end.
 */
function readStreamByLines(stream, lineCallback, endCallback) {
  let chunk = '';
  stream.on('data', (data) => {
    chunk += data.toString();
    let i;
    while ((i = chunk.indexOf('\n')) != -1) {
      if (i > 0) {
        const line = chunk.substr(0, i);
        if (line.trim().length > 0) {
          if (lineCallback) {
            lineCallback(line);
          }
        }
      }
      chunk = chunk.substr(i + 1);
    }
  });
  stream.on('end', () => {
    if (endCallback) {
      endCallback();
    }
  });
}

function generateRandomQueryId() {
  let s = '';
  for (let i = 0; i < 8; ++i) {
    s += String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A..Z.
    if (i == 3) {
      s += '-';
    }
  }
  return s;
}

class Curlable {
  constructor(cmdline, options) {
    this.options = options;
    this.logger = options && options.logger || (() => {});
    this.terminationCallback = options && options.terminationCallback;
    this.errorCallback = options && options.errorCallback;
    this.prompt = options && options.prompt;

    this.startTime = Date.now();
    this.spawnedProcess = child_process.spawn('/bin/bash', [ '-c', cmdline ]);

    this.queriesQueue = null;
    this.currentQueueItem = null;

    this.ready = true;

    if (options && options.prompt) {
      this.ready = false;
      this.logger('Waiting for the external tool to be ready.\n');
    }

    this.spawnedProcess.on('close', (code) => {
      if (!this.spawnedProcess) {
        return;
      }

      this.spawnedProcess = null;
      this._onSpawnedProcessEnd(new Error('The external tool exited with code ' + code));
    });

    readStreamByLines(
      this.spawnedProcess.stdout,
      (line) => {
        this._onSpawnedProcessLine(line);
      },
      () => {
        this._onSpawnedProcessEnd(new Error('The external tool output stream has ended.'));
      }
    );
  }

  _finishQueueItem(queueItem, error) {
    const resultTimestamp = Date.now();
    const result = queueItem.accumulatedOutput;

    // If the result is not empty, it has a '\n' already.
    this.logger(queueItem.id + '\t' + (resultTimestamp - queueItem.writeTimestamp) + 'ms\t' +
      (error ? 'ERROR: ' + error.message + '\n' : (result || '\n'))
    );

    const callback = queueItem.callback;
    callback(null, result);

    this._processQueue();
  }

  _onSpawnedProcessEnd(reason) {
    this.ready = false;

    const pid = this.spawnedProcess && this.spawnedProcess.pid;
    this.spawnedProcess = null;

    if (pid) {
      this.logger('Sending SIGTERM to the external tool process.\n');
      kill(pid, 'SIGTERM');
    }

    this.logger('The external tool was stopped.' + (reason ? ' ' + reason.message : '') + '\n');

    const terminationCallback = this.terminationCallback;
    if (terminationCallback) {
      terminationCallback();
    }
  }

  _onSpawnedProcessLine(line) {
    if (!this.spawnedProcess || !this.ready) {
      if (this.prompt) {
        if (line === this.prompt) {
          this.ready = true;
          this.logger('Ready after ' + (Date.now() - this.startTime) + 'ms.\n');
        } else {
          // Ignore spawned process output before prompt.
        }
      } else {
        // Ignore spawned process output after kill.
      }
    } else if (this.currentQueueItem) {
      const queueItem = this.currentQueueItem;

      // Accumulate output lines except the prompt, if configured.
      if (!this.prompt || line !== this.prompt) {
        if (queueItem.accumulatedOutput) {
          queueItem.accumulatedOutput += line + '\n';
        } else {
          queueItem.accumulatedOutput = line + '\n';
        }
      }

      if (!this.prompt || line === this.prompt) {
        this.currentQueueItem = null;
        this._finishQueueItem(queueItem);
      } else {
        // Wait for prompt.
      }
    } else {
      const error = new Error('The tool is generating output when it is not expected:\n' + line);
      const errorCallback = this.errorCallback;
      if (errorCallback) {
        errorCallback(error);
      }
    }
  }

  _processQueue() {
    // Ignore the call if killed, currently processing, or no more items.
    if (!this.spawnedProcess || this.currentQueueItem || !this.queriesQueue) {
      return;
    }

    this.currentQueueItem = this.queriesQueue;
    this.queriesQueue = this.queriesQueue.next;

    this.currentQueueItem.writeTimestamp = Date.now();
    this.logger(this.currentQueueItem.id + '\t-\t' + JSON.stringify(this.currentQueueItem.query) + '\n');
    this.spawnedProcess.stdin.write(this.currentQueueItem.query + '\n');
  }

  /**
   * Queues a query to be processed by the underlying tool.
   *
   * @param  {string}   query     The query input.
   * @param  {function(Error, string)}  callback  Called with the result as a string or with an error.
   */
  runQuery(query, callback) {
    const cancelQueryNoop = () => {};

    if (!this.spawnedProcess) {
      callback(new Error('Stopped.'), '');
      return cancelQueryNoop;
    }

    const queryLines = query.split('\n');
    const queryLinesNonEmpty = [];
    for (let i = 0; i < queryLines.length; ++i) {
      const queryLine = queryLines[i].trim();
      if (queryLine) {
        queryLinesNonEmpty.push(queryLine);
      }
    }

    if (queryLinesNonEmpty.length === 0) {
      callback(new Error('Need a nonempty query.'), '');
      return cancelQueryNoop;
    }

    if (queryLinesNonEmpty.length !== 1) {
      callback(new Error('Need a single-line query.'), '');
      return cancelQueryNoop;
    }

    const queueItem = {
      query: queryLinesNonEmpty[0],
      id: generateRandomQueryId(),
      accumulatedOutput: '',
      queueTimestamp: Date.now(),
      writeTimestamp: 0,
      callback: callback,
      next: null
    };

    if (!this.queriesQueue) {
      // No open queue. Start one, and kick off `_processQueue()`.
      this.queriesQueue = queueItem;
      this._processQueue();
    } else {
      // Query in progress. Chain the call and don't invoke `_processQueue()`.
      let it = this.queriesQueue;
      while (it.next) {
        it = it.next;
      }
      it.next = queueItem;
    }

    const cancelQuery = (reason) => {
      if (this.currentQueueItem === queueItem) {
        this.currentQueueItem = null;
        // TODO: Tell the external tool to stop processing and reset itself.
        this._finishQueueItem(queueItem, new Error('Canceled.' + (reason ? ' ' + reason.message : '')));
      }
    };

    return cancelQuery;
  }

  /**
   * Stop the service and kill the underlying external tool.
   *
   * @return  {boolean}  `true` if started to stop; `false` if already stopping or stopped.
   */
  kill() {
    this.logger('Stop requested via `kill` API.\n');

    if (!this.spawnedProcess) {
      this.logger('Already stopping or stopped.\n');
      return false;
    }

    this.logger('Stopping the external tool.\n');

    this._onSpawnedProcessEnd(new Error('Stopped via `kill` API.'));

    return true;
  }
}


/**
 * Usage: `app.use('/tool', makeCurlableExpressMiddleware(curlableInstance, 'http://localhost:8000/tool'));`
 *
 * @param  {Curlable}  curlableInstance  The service.
 * @param  {string}  [publicUrl]  Optional URL to print when the service request is malformed.
 * @return  {function(express.Request,express.Response,express.NextFunction)}  An `express` middleware.
 */
function makeCurlableExpressMiddleware(curlableInstance, publicUrl) {
  const textParserMiddleware = bodyParser.text({
    type: '*/*',
  });

  const curlableMiddleware = (req, res) => {
    if (req.method === 'POST') {
      if (curlableInstance.ready) {
        const cancelQuery = curlableInstance.runQuery(req.body, (error, result) => {
          if (error) {
            res.header('Access-Control-Allow-Origin', '*').status(500).end(error.message + '\n');
          } else {
            res.header('Access-Control-Allow-Origin', '*').end(result);
          }
        });
        req.connection.on('close', () => {
          cancelQuery(new Error('Connection closed.'));
        });
      } else {
        res.status(503).end('Not available yet.\n');
      }
    } else if (req.method === 'DELETE') {
      if (curlableInstance.kill()) {
        res.end('Terminating.\n');
      } else {
        res.end('Already terminated.\n');
      }
    } else {
      const url = (publicUrl ? '\'' + publicUrl + '\'' : '$URL');
      res
        .status(405) // Method not allowed.
        .end('Need POST (`curl -d \'...\' ' + url + '`) or DELETE (`curl -X DELETE ...`).\n');
    }
  };

  return (req, res, next) => { textParserMiddleware(req, res, () => { curlableMiddleware(req, res, next) }); };
}


module.exports = {
  Curlable,
  readStreamByLines,
  makeCurlableExpressMiddleware,
};
