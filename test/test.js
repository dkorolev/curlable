'use strict';

const request = require('supertest');
const express = require('express');
const bodyParser = require('body-parser');

const curlable = require('../lib/curlable.js');

const app = express();
app.use(bodyParser.text({
  type: '*/*'
}));

describe('cat [ by lines ]', function() {
  const instance = new curlable.Curlable('cat');
  instance.registerRoutes(app, '/cat');
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
  it('DELETE tears down', function(done) {
    request(app)
      .del('/cat')
      .expect(200, 'Terminating.\n', done);
  });
});

describe('bc -l [ by lines ]', function() {
  const instance = new curlable.Curlable('bc -l');
  instance.registerRoutes(app, '/bc');
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

const cmd_with_welcome = 'echo INITIALIZING ; sleep 0.5 ; echo DONE ; ' +
  'while true; do echo WELCOME ; read line ; echo test ; echo $line ; echo passed ; done';

describe('echo "test\\n$input\\npassed" [ with a welcome prompt ]', function() {
  const instance = new curlable.Curlable(cmd_with_welcome, { prompt: 'WELCOME' });
  instance.registerRoutes(app, '/welcome');
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
