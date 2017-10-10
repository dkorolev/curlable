#!/usr/bin/env node

'use strict';

const program = require('commander');
const express = require('express');
const bodyParser = require('body-parser');

const curlable = require('./lib/curlable.js');

program
  .version('0.0.6')
  .option('-c, --cmdline <cmdline>', 'The command to run.')
  .option('-p, --port <port>', 'Post to listen on.', parseInt)
  .option('-r, --route <route>', 'The route to serve the command on.')
  .option('-q, --prompt <prompt>', 'The ready-to-process prompt, for multiline outputs.')
  .parse(process.argv);

let cmdline = program.cmdline || 'bc -l'; // `bc -l` is a good default. -- D.K.
let port = program.port || 8000;
let route = program.route || '/';
let options = {
  prompt: program.prompt || null,
};

process.stderr.write('Making `' + cmdline + '` curlable.\n');
if (options.prompt) {
  process.stderr.write('Multiline output mode, prompt: `' + options.prompt + '`.\n');
}

const instance = new curlable.Curlable(cmdline, options, (s) => { process.stderr.write(s); });

curlable.readStreamByLines(process.stdin, (line) => {
  if (instance.ready) {
    instance.runQuery(line, (result) => {
      process.stdout.write(result);
    });
  } else {
    process.stdout.write('Not yet available, waiting for the welcome prompt.\n');
  }
});

var app = express();
app.use(bodyParser.text({
  type: '*/*'
}));

instance.registerRoutes(app, route, port, () => {
  process.stderr.write('Quitting the binary due to an extenal DELETE request.\n');
  server.close();
  process.exit(0);
});

let server = app.listen(port);
process.stderr.write('Service started, listening on port ' + port + '.\n');
