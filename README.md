# curlable

A simple wrapper to turn stateless command-line utilities into HTTP endpoints.

## Example

TL;DR:

```
$ ./curlable.js -c 'bc -l'                                          # In one terminal.
$ curl -d '2 ^ 10' localhost:8000 && curl -x DELETE localhost:8000  # In another terminal.
```

You should see:

```
$ ./curlable.js -c 'bc -l'
Making `bc -l` curlable at http://localhost:8000/
Service started.
UGKE-ECRX	-	2 ^ 10
UGKE-ECRX	1ms	1024
DELETE request received. Stopping the external service.
External service stopped.
Quitting the binary due to an extenal DELETE request.
```

```
$ curl -d '2 ^ 10' localhost:8000 && curl -X DELETE localhost:8000
1024
Terminating.
```

## Usage

The supported command line parameters are:

1. `-c`: The external command to `curl`-ify.
2. `-p`: The port to spawn the tool on, defaults to `8000`.
3. `-r`: The route to listen on, defaults to `/`.

## Running the Tests

```
$ npm install
$ npm test  # or `make`
```
