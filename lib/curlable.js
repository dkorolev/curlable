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
      callback(chunk.substr(0, i));
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

const curlable = function(cmdline, inputLogger) {
  this.logger = inputLogger || (() => {});
  this.spawnedProcess = child_process.spawn('/bin/bash', ['-c', cmdline]);

  this.queriesQueue = null;

  this.nextLineHandler = null;

  const self = this;
  readStreamByLines(this.spawnedProcess.stdout, (line) => {
    if (!self.nextLineHandler) {
      console.error('FATAL: No `nextLineHandler`, the tool' +
        ' is generating output when it is not expected.');
      console.error('ERROR: ' + line);
      process.exit(-1);
    } else {
      self.nextLineHandler(line);
    }
  });
};

// Either `queriesQueue` is `null`, and `runQueries()` is not running, or
// `queriesQueue` is not `null`, `runQueries()` is running, and it's currently
// processing the head of this queue.
// This invariant is held across function calls, taking advantage
// of JavaScript uninterrupted function execution property. -- D.K.
curlable.prototype.runQueries = function() {
  const id = generateRandomQueryId();
  this.logger(id + '\t-\t' + this.queriesQueue.query);
  const begin = Date.now();
  const self = this;
  this.nextLineHandler = (result) => {
    const end = Date.now();
    self.nextLineHandler = null;
    self.logger(id + '\t' + (end - begin) + 'ms\t' + result);
    self.queriesQueue.callback(result);
    self.queriesQueue = self.queriesQueue.next;
    if (self.queriesQueue) {
      self.runQueries();
    }
  };
  this.spawnedProcess.stdin.write(this.queriesQueue.query + '\n');
};

curlable.prototype.runQuery = function(query, callback) {
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

curlable.prototype.kill = function() {
  if (this.spawnedProcess) {
    kill(this.spawnedProcess.pid);
  }
};

// Runs the service, `app` is an `express` instance of the app.
// Prerequisite: `app.use(bodyParser.text({ type: '*/*' }));` was called.
curlable.prototype.registerRoutes = function(app, route, port, terminationCallback) {
  const self = this;

  app.get(route, function(req, res) {
    const url = port ? ('`http://localhost:' + port + route + '`') : '$URL';
    res
      .status(405) // Method not allowed.
      .send('Need POST (`curl -d ... ' + url + '`) or' +
        ' DELETE (`curl -X DELETE ...`).\n');
  });

  app.post(route, function(req, res) {
    self.runQuery(req.body, (result) => {
      res.header('Access-Control-Allow-Origin', '*').send(result + '\n');
    });
  });

  app.delete(route, function(req, res) {
    res.send('Terminating.\n');
    self.logger('DELETE request received. Stopping the external service.');
    self.kill();
    self.logger('External service stopped.');
    if (terminationCallback) {
      terminationCallback();
    }
  });
};

module.exports = {
  curlable,
  readStreamByLines
};
