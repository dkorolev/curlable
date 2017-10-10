'use strict';

const express = require('express');
const bodyParser = require('body-parser');
const child_process = require('child_process');
const kill = require('tree-kill');

const readStreamByLines = (stream, callback) => {
  var chunk = '';
  stream.on('data', (data) => {
    chunk += data.toString();
    var i;
    while ((i = chunk.indexOf('\n')) != -1) {
      if (i > 0) {
        const s = chunk.substr(0, i);
        if (s.trim().length > 0) {
          callback(s);
        }
      }
      chunk = chunk.substr(i + 1);
    }
  });
};

const generateRandomQueryId = () => {
  var s = '';
  for (var i = 0; i < 8; ++i) {
    s += String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A..Z.
    if (i == 3) {
      s += '-';
    }
  }
  return s;
};

const Curlable = function(cmdline, options, optionalLogger) {
  this.options = options;
  this.logger = optionalLogger || (() => {});
  this.startTime = Date.now();
  this.spawnedProcess = child_process.spawn('/bin/bash', ['-c', cmdline]);

  this.queriesQueue = null;

  this.nextLineHandler = null;
  this.ready = true;

  if (options && options.prompt) {
    this.ready = false;
    this.logger('Waiting for the external tool to be ready.\n');
    this.nextLineHandler = (line) => {
      if (line === options.prompt) {
        this.ready = true;
        this.logger('Ready after ' + (Date.now() - this.startTime) + 'ms.\n');
        this.nextLineHandler = null;
      }
    };
  }

  readStreamByLines(this.spawnedProcess.stdout, (line) => {
    if (!this.nextLineHandler) {
      process.stderr.write('FATAL: No `nextLineHandler`, the tool' +
        ' is generating output when it is not expected.\n');
      process.stderr.write('ERROR: ' + line + '\n');
      process.exit(-1);
    } else if (line) {
      this.nextLineHandler(line);
    }
  });
};

// Either `queriesQueue` is `null`, and `runQueries()` is not running, or
// `queriesQueue` is not `null`, `runQueries()` is running, and it's currently
// processing the head of this queue.
// This invariant is held across function calls, taking advantage
// of JavaScript uninterrupted function execution property. -- D.K.
Curlable.prototype.runQueries = function() {
  const id = generateRandomQueryId();
  this.logger(id + '\t-\t' + this.queriesQueue.query + '\n');
  const begin = Date.now();
  this.nextLineHandler = (line) => {
    const serveResult = (result) => {
      const end = Date.now();
      this.nextLineHandler = null;
      this.logger(id + '\t' + (end - begin) + 'ms\t' + result);  // Has a '\n' already.
      this.queriesQueue.callback(result);
      this.queriesQueue = this.queriesQueue.next;
      if (this.queriesQueue) {
        this.runQueries();
      }
    };

    if (this.options && this.options.prompt) {
      if (line === this.options.prompt) {
        serveResult(this.accumulatedOutput);
      } else {
        this.accumulatedOutput += line + '\n';
      }
    } else {
      serveResult(line + '\n');
    }
  };
  this.accumulatedOutput = '';
  this.spawnedProcess.stdin.write(this.queriesQueue.query + '\n');
};

Curlable.prototype.runQuery = function(query, callback) {
  var lines = query.split('\n');
  var realQuery = [];
  for (var i = 0; i < lines.length; ++i) {
    lines[i] = lines[i].trim();
    if (lines[i].length) {
      realQuery.push(lines[i]);
    }
  }
  if (realQuery.length === 0) {
    callback('Need a nonempty query.\n');
    return;
  }
  if (realQuery.length !== 1) {
    callback('Need a single-line query.\n');
    return;
  }
  query = realQuery[0];
  if (!this.queriesQueue) {
    // No open queue. Start one, and kick off `runQueries()`.
    this.queriesQueue = {
      query,
      callback,
      next: null
    };
    this.runQueries();
  } else {
    // Query in progress. Chain the call and don't invoke `runQueries()`.
    var it = this.queriesQueue;
    while (it.next) {
      it = it.next;
    }
    it.next = {
      query,
      callback,
      next: null
    };
  }
};

Curlable.prototype.kill = function() {
  if (this.spawnedProcess) {
    kill(this.spawnedProcess.pid);
  }
};

// Runs the service, `app` is an `express` instance of the app.
// Prerequisite: `app.use(bodyParser.text({ type: '*/*' }));` was called.
Curlable.prototype.registerRoutes = function(app, route, port, terminationCallback) {
  app.get(route, function(req, res) {
    const url = port ? ('http://localhost:' + port + route) : '$URL';
    res
      .status(405) // Method not allowed.
      .send('Need POST (`curl -d "..." ' + url + '`) or DELETE (`curl -X DELETE ...`).\n');
  });

  app.post(route, (req, res) => {
    if (this.ready) {
      this.runQuery(req.body, (result) => {
        res.header('Access-Control-Allow-Origin', '*').send(result);
      });
    } else {
      res.status(503).send('Not available yet.\n');
    }
  });

  app.delete(route, (req, res) => {
    res.send('Terminating.\n');
    this.logger('DELETE request received. Stopping the external service.\n');
    this.kill();
    this.logger('External service stopped.\n');
    if (terminationCallback) {
      terminationCallback();
    }
  });
};

module.exports = {
  Curlable,
  readStreamByLines
};
