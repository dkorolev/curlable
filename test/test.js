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
  const instance = new curlable.Curlable('cat');  // , () => {});
  instance.registerRoutes(app, '/cat');  //, 8000, '/');
  it('GET should return a prompt', function(done) {
    request(app)
      .get('/cat')
      .expect(405)
      .expect('Need POST (`curl -d ... $URL`) or DELETE (`curl -X DELETE ...`).\n', done);
  });
  it('POST `2 ^ 10` should return `2 ^ 10`', function(done) {
    request(app)
      .post('/cat')
      .send('2 ^ 10')
      .expect(200)
      .expect('2 ^ 10\n', done);
  });
  it('DELETE tears down', function(done) {
    request(app)
      .del('/cat')
      .expect(200)
      .expect('Terminating.\n', done);
  });
});

describe('bc -l [ by lines ]', function() {
  const instance = new curlable.Curlable('bc -l', () => {});
  instance.registerRoutes(app, '/bc');  //, 8000, '/');
  it('GET should return a prompt', function(done) {
    request(app)
      .get('/bc')
      .expect(405)
      .expect('Need POST (`curl -d ... $URL`) or DELETE (`curl -X DELETE ...`).\n', done);
  });
  it('POST `2 ^ 10` should return `1024`', function(done) {
    request(app)
      .post('/bc')
      .send('2 ^ 10')
      .expect(200)
      .expect('1024\n', done);
  });
  it('DELETE tears down', function(done) {
    request(app)
      .del('/bc')
      .expect(200)
      .expect('Terminating.\n', done);
  });
});
