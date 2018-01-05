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
**Create REST handler:**
```javascript
// Create instance of REST handler
var restHandler = require('rest-handler').create();
```

**Add some middleware:**
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

**Add some listeners:**
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

**Add some routes:**
```javascript
restHandler.addRoute({
    // Route path (required)
    path: '/health/check',

    // Route method (optional, assumed to be all methods if not provided).
    // Allowed values:
    // - * (to match any method)
    // - Any legal HTTP method ("GET", "POST", "PUT", "PATCH", etc.)
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

**Route-specific "middleware":**
```javascript
restHandler.addRoute({
    path: '/top-secret',
    
    method: 'GET',
    
    // The before property can be a single function or an array of functions.
    // These function can allow the request to proceed by calling rest.next().
    before: [
        function(rest) {
            if (rest.url.query.secretCode === 'test') {
                // allow request to proceed
                rest.next();
            } else {
                // send back error
                rest.error(403, 'Access denied!');
            }
        }
    ],
    
    handler: function(rest) {
        rest.send({
            message: 'Congratulations! You have been allowed access.'
        });
    }
});
```

**Reading request body:**
```javascript
// Example of reading JSON from request body
restHandler.addRoute({
    path: '/order/:orderId',
    method: 'POST',
    // getParsedBody() will read all of the chunks of data and parse it as JSON
    handler: function(rest) {
        // NOTE: you can also use req.on('data', function(data) {}) to
        // read data chunks manually and parse the resultant string.
        rest.getParsedBody(function(err, body) {
            if (err) {
                // log the error
                console.error(err);
                return rest.send(500, 'Error reading request body');
            }

            // echo the body (body will be a JavaScript Object)
            rest.send(body);
        });
    }
});

// Example of reading raw text from request body
restHandler.addRoute({
    path: '/echo/body',
    method: 'POST',
    // getParsedBody() will read all of the chunks of data and parse it as JSON
    handler: function(rest) {
        // NOTE: you can also use req.on('data', function(data) {}) to
        // read data chunks manually
        rest.getBody(function(err, body) {
            if (err) {
                // log the error
                console.error(err);
                return rest.send(500, 'Error reading request body');
            }

            // echo the body (body will be a String Object)
            rest.send(body);
        });
    }
});
```

**Reading cookies:**
```javascript
// Example of reading raw text from request body
restHandler.addRoute({
    path: '/echo/cookies',
    // getParsedBody() will read all of the chunks of data and parse it as JSON
    handler: function(rest) {
        // rest.getCookies() will lazily parse the request cookies the first
        // time the method is called.
        var cookies = rest.getCookies();

        // cookies will be JavaScript object with cookie names as keys
        // and cookie values as corresponding value
        rest.send(cookies);
    }
});
```

**Reading basic auth header:**
```javascript
// Echo basic auth
restHandler.addRoute({
    path: '/echo/basic-auth',
    // getParsedBody() will read all of the chunks of data and parse it as JSON
    handler: function(rest) {
        // rest.getBasicAuth() will lazily parse the request "authorization" header
        // using the "basic-auth-parser" module
        // (see https://github.com/mmalecki/basic-auth-parser)
        var basicAuth = rest.getBasicAuth();
        rest.send(basicAuth);
    }
});
```

**Error handling:**
```javascript
// Add a route that will send an error
restHandler.addRoute({
    path: '/simulate-error',
    handler: function(rest) {
        rest.error(400, {
            code: 'INVALID_REQUEST'
        });
    }
});

// Add error handler
restHandler.errorHandler(function(rest, err) {
    if (err.code === 'INVALID_REQUEST') {
        // special handling for requests that were given code of "INVALID_REQUEST"
        rest.res.setHeader('Content-Type', 'text/html');
        rest.send('<html><body>Invalid request</body></html>');
    } else {
        // Log the error
        console.error(err);
        // Output generic error message to end-user
        rest.send(500, 'Unknown error occurred');
    }
});
```

**Override notFound handler:**
```javascript
// By default the notFound handler will send the status message as plaintext with a 404 status code.
// You can override this behavior using the `onRouteNotFound` option.
require('rest-handler').create({
    onRouteNotFound: function (message, req, res, socket) {
        if (typeof message !== "string") {
            // Message is optional.
            res = req;
            req = message;
        }

        // Respond however you would like.
        res.statusCode = 200;
        res.end("Hello World");
    }
})
```


**Start an http server and delegate handling of requests to REST handler:**
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
