# curlable

A simple wrapper to turn [stateless] command-line utilities into HTTP endpoints.

## Example

TL;DR:

```
$ node curlable.js                                                  # In one terminal.
$ curl -d '2 ^ 10' localhost:8000 && curl -x DELETE localhost:8000  # In another terminal.
```

You should see:

```
dima ~/github/dkorolev/curlable (dev) $ node curlable.js
Making `bc -l` curlable.
Service started, listening on port 8000.
UGKE-ECRX	-	2 ^ 10
UGKE-ECRX	1ms	1024
FREB-EZYC	-	2 ^ 10
FREB-EZYC	0ms	1024
DELETE request received. Stopping the external service.
External service stopped.
Quitting the binary due to an extenal DELETE request.
```

```
dima ~ $ curl -d '2 ^ 10' localhost:8000 && curl -X DELETE localhost:8000
1024
Terminating.
```

## Usage

The supported command line parameters are:

1. `-c`: The external command to `curl`-ify, defaults to `bc -l`.
2. `-p`: The port to spawn the tool on, defaults to 8000.
3. `-r`: The route to listen on, defaults to `/`.

## Running tests

```
$ npm i
$ npm run test  # or `make`
```
