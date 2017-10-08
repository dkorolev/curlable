#!/usr/bin/env node

'use strict';

const program = require('commander');
const express = require('express');
const bodyParser = require('body-parser');

const curlable = require('./lib/curlable.js');

program
  .version('0.0.1')
  .option('-c, --cmdline <cmdline>', 'The command to run.')
  .option('-p, --port <port>', 'Post to listen on.', parseInt)
  .option('-r, --route <route>', 'The route to serve the command on.')
  .parse(process.argv);

let cmdline = program.cmdline || 'bc -l'; // `bc -l` is a good default. -- D.K.
let port = program.port || 8000;
let route = program.route || '/';

process.stderr.write('Making `' + cmdline + '` curlable.\n');

const instance = new curlable.Curlable(cmdline, (msg) => { process.stderr.write(msg + '\n'); });

curlable.readStreamByLines(process.stdin, (line) => {
  instance.runQuery(line, (result) => {
    process.stdout.write(result + '\n');
  });
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
