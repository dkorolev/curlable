'use strict';

const request = require('supertest');
const express = require('express');
const bodyParser = require('body-parser');

const curlable = require('../lib/curlable.js');


describe('cat [ by lines ]', function() {
  let instance;
  let app;

  before(function() {
    instance = new curlable.Curlable('cat');
    app = express();
    app.use('/cat', curlable.makeCurlableExpressMiddleware(instance));
  });

  after(function() {
    instance.kill();
  });

  it('GET returns a hint to use POST', function(done) {
    request(app)
      .get('/cat')
      .expect(405)
      .expect('Need POST (`curl -d "..." $URL`) or DELETE (`curl -X DELETE ...`).\n', done);
  });
  it('POST `2 ^ 10` returns `2 ^ 10`', function(done) {
    request(app)
      .post('/cat')
      .send('2 ^ 10')
      .expect(200, '2 ^ 10\n', done);
  });
  it('POST ignores blank lines', function(done) {
    request(app)
      .post('/cat')
      .send('\ntest\n')
      .expect(200, 'test\n', done);
  });
  it('POST ignores lines full of whitespaces', function(done) {
    request(app)
      .post('/cat')
      .send('   \n\t\t\t\n \t \t \t\n\n\n\npassed\n   \n\t\t\t\n\t \t \t \n')
      .expect(200, 'passed\n', done);
  });
  it('POST does not accept an empty query', function(done) {
    request(app)
      .post('/cat')
      .send('')
      .expect(500, 'Need a nonempty query.\n', done);
  });
  it('POST does not accept a whitespace-only query', function(done) {
    request(app)
      .post('/cat')
      .send('  \n   \n\t\t\t\n   ')
      .expect(500, 'Need a nonempty query.\n', done);
  });
  it('POST does not accept a multiline query', function(done) {
    request(app)
      .post('/cat')
      .send('foo\nbar')
      .expect(500, 'Need a single-line query.\n', done);
  });
  it('DELETE tears down', function(done) {
    request(app)
      .del('/cat')
      .expect(200, 'Terminating.\n', done);
  });
});

describe('bc -l [ by lines ]', function() {
  let instance;
  let app;

  before(function() {
    instance = new curlable.Curlable('bc -l');
    app = express();
    app.use('/bc', curlable.makeCurlableExpressMiddleware(instance));
  });

  after(function() {
    instance.kill();
  });

  it('POST `2 ^ 10` returns `1024`', function(done) {
    request(app)
      .post('/bc')
      .send('2 ^ 10')
      .expect(200, '1024\n', done);
  });
  it('DELETE tears down', function(done) {
    request(app)
      .del('/bc')
      .expect(200, 'Terminating.\n', done);
  });
});

const cmdWithWelcome = 'echo INITIALIZING ; sleep 0.5 ; echo DONE ; ' +
  'while true; do echo WELCOME ; read line ; echo test ; echo $line ; echo passed ; done';

describe('echo "test\\n$input\\npassed" [ with a welcome prompt ]', function() {
  let instance;
  let app;

  before(function() {
    instance = new curlable.Curlable(cmdWithWelcome, { prompt: 'WELCOME' });
    app = express();
    app.use('/welcome', curlable.makeCurlableExpressMiddleware(instance));
  });

  after(function() {
    instance.kill();
  });

  it('an early POST returns `503 Service Unavailable`', function(done) {
    request(app)
      .post('/welcome')
      .send('meh')
      .expect(503, done);
  });
  it('becomes available within the next <0.5s', function(done) {
    const loopUntilAvailable = () => {
      request(app).post('/welcome').send('meh').end(function(err, res) {
        if (err || res.status === 503) {
          loopUntilAvailable();
        } else {
          done();
        }
      });
    };
    loopUntilAvailable();
  });
  it('POST `yay` returns `test\\nyay\\npassed`', function(done) {
    request(app)
      .post('/welcome')
      .send('yay')
      .expect(200, 'test\nyay\npassed\n', done);
  });
  it('DELETE tears down', function(done) {
    request(app)
      .del('/welcome')
      .expect(200)
      .expect('Terminating.\n', done);
  });
});
