#!/usr/bin/env node

'use strict';

process.on('uncaughtException', (error) => {
  process.stderr.write('FATAL: ' + error.stack + '\n');
  process.exit(-1);
});

const program = require('commander');
const http = require('http');
const express = require('express');

const curlable = require('./lib/curlable.js');

const defaults = {
  port: 8000,
  route: '/',
};

program
  .version('0.0.7')
  .option('-c, --cmdline <cmdline>', 'The command to run.')
  .option('-p, --port <port>', 'Port to listen on. Default: ' + JSON.stringify(defaults.port) + '.', parseInt)
  .option('-r, --route <route>', 'The route to serve the command on. Default: ' + JSON.stringify(defaults.route) + '.')
  .option('-q, --prompt <prompt>', 'The ready-to-process prompt, for multiline outputs.')
  .parse(process.argv);

const cmdline = program.cmdline;
const port = program.port || defaults.port;
const route = program.route || defaults.route;

if (!cmdline || !isFinite(port) || !/^\//.test(route)) {
  program.outputHelp();
  process.exit(1);
}

let server;
const options = {
  prompt: program.prompt || null,
  logger: (s) => { process.stderr.write(s); },
  baseUrl: 'http://localhost:' + port,
  terminationCallback: () => {
    // Exit on next tick to let the middleware to respond to the DELETE request.
    process.nextTick(() => {
      process.stderr.write('Service stopped, exiting with 0.\n');
      if (server) {
        server.close();
      }
      process.exit(0);
    });
  },
};

process.stderr.write('Making `' + cmdline + '` curlable.\n');
if (options.prompt) {
  process.stderr.write('Multiline output mode, prompt: `' + options.prompt + '`.\n');
}

const instance = new curlable.Curlable(cmdline, options);

curlable.readStreamByLines(
  process.stdin,
  (line) => {
    if (instance.ready) {
      instance.runQuery(line, (error, result) => {
        if (error) {
          process.stderr.write('ERROR: ' + error.stack + '\n');
        } else {
          process.stdout.write(result);
        }
      });
    } else {
      process.stderr.write('Not yet available, waiting for the welcome prompt.\n');
    }
  }
);

const app = express();

app.use(route, curlable.makeCurlableExpressMiddleware(instance, 'http://localhost:' + port));

server = http.createServer(app);
const onListeningError = () => {
  process.stderr.write('Failed to listen on port ' + port + '.\n');
  process.exit(2);
};
server.on('error', onListeningError);
server.on('listening', () => {
  server.removeListener('error', onListeningError);
  process.stderr.write('Service started, listening on port ' + port + '.\n');
});
server.listen(port);
