node-rest-handler
=================

A module for creating a request handler that does REST style routing.

Unlike express, this request handler makes some simplifying assumptions:
- Routes have paths with simple placeholders or static paths (for anything more complicated, a different middleware can be added)
- Instead of passing around `req`, `res`, and `next`, these three properties are encapsulated in a single object (the `rest` object).
- Route matching happens before any request handling so that all middleware and final route handler know which route matched. Requests that do not match any routes are a special case and can be handled via a `routeNotFound` listener.

**NOTE:** The underlying router is https://github.com/philidem/path-based-router/

## Installation
```bash
npm install rest-handler --save
```

## Usage
Create REST handler:
```javascript
// Create instance of REST handler
var restHandler = require('rest-handler').create();
```

Add some middleware:
```javascript
// middleware is added via "before" method call
restHandler
// Authenticate
    .before(function(rest) {
        rest.session = {
            userId: 'john'
        };

        // go to next handler
        rest.next();
    })

    // Authorize
    .before(function(rest) {
        if (rest.session.userId === 'john') {
            // go to next handler
            rest.next();
        } else {
            rest.error(403, 'Unauthorized.');
        }
    });
```

Add some listeners:
```javascript
// Listen for each request (unlike middleware, listeners are non-sequential)
restHandler
    .on('beforeHandle', function(rest) {
        // simple request logger
        console.log(rest.req.method + ' ' + rest.req.url);
    })

    // Listener for not found
    .on('routeNotFound', function(req, res) {
        // just log missing route
        console.log('NOT FOUND: ' + req.method + ' ' + req.url);
    });
```

Add some routes:
```javascript
restHandler.addRoute({
    // Route path (required)
    path: '/health/check',

    // Route method (optional, assumed to be all methods if not provided).
    // Allowed values:
    // - * (to match any method)
    // - (any legal HTTP method -- GET, POST, PUT, PATCH, etc.)
    method: '*',

    description: 'Health check',
    
    // The "rest" argument will contains
    // - req: The raw incoming request as provided by NodeJS
    // - res: The raw outgoing response as provided by NodeJS
    // - url: The parsed URL object (see require('url').parse(...) NodeJS documentation)
    // - params: The parameters object
    // - route: The route that matched the request URL
    handler: function(rest) {
        rest.res.setHeader('content-type', 'text/plain');
        rest.send('Alive');
    }
});

// Add a route with parameter placeholder
restHandler.addRoute({
    // Route path (required)
    // Placeholders (identified by path parts that start with ":") will be
    // provided via rest.params
    path: '/orders/:orderId',

    // Route method (optional, assumed to be all methods if not provided)
    method: 'GET',

    description: 'Get order details',
    
    // The function that will be called for each request.
    // The "rest" argument will contains
    // - req: The raw incoming request as provided by NodeJS
    // - res: The raw outgoing response as provided by NodeJS
    // - url: The parsed URL object (see require('url').parse(...) NodeJS documentation)
    // - params: The parameters object
    // - route: The route that matched the request URL
    handler: function(rest) {
        if (!rest.params.orderId) {
            // send error with 400 code
            // Request that will cause error: "http://localhost:8080/orders/"
            //
            // NOTE: Status code is optional. Calling error with one argument will
            // use the default error status code of 500.
            return rest.error(400, '"orderId" is required');
        }

        // Request was something like "http://localhost:8080/orders/123"
        rest.send({
            id: rest.params.orderId,
            total: 123.55,
            items: [
                {
                    itemNumber: 123
                },
                {
                    itemNumber: 124
                }
            ]
        });
    }
});
```
Start an http server and delegate handling of requests to REST handler
```javascript
// Create standard HTTP server
var server = require('http').createServer();

server.on('request', function(req, res) {
    // Handle normal GET, POST, etc. requests
    restHandler.handle(req, res);
});

server.on('upgrade', function(req, socket, head) {
    // Handle web sockets
    restHandler.handleUpgrade(req, socket, head);
});

// Listen on port 8080
server.listen(8080, function() {
    
});
```
