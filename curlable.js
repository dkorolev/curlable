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

console.error('Making `' + cmdline + '` curlable.');

const instance = new curlable.curlable(cmdline, console.warn);

curlable.readStreamByLines(process.stdin, (line) => {
  instance.runQuery(line, (result) => {
    console.log(result);
  });
});

var app = express();
app.use(bodyParser.text({
  type: '*/*'
}));

instance.registerRoutes(app, route, port, () => {
  console.error('Quitting the binary due to an extenal DELETE request.');
  server.close();
  process.exit(0);
});

let server = app.listen(port);
console.warn('Service started, listening on port ' + port + '.');
