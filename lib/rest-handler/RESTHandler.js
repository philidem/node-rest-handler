'use strict';

var events = require('events');
var util = require('util');
var url = require('url');
var pathBasedRouter = require('path-based-router');

var REST = require('./REST');

function RESTHandler(options) {
	events.EventEmitter.call(this);
	this._routerByMethod = {};
    this.ALL_ROUTES_METHOD = 'AllRoutes';
    this.routeInfoByPath = {};

	// array of functions that will be invoked prior to request being dispatched to final route function
	this._before = [];

	if (options) {
		this._onRouteNotFound = options.onRouteNotFound;

		if (options.routes) {
			for (var i = 0; i < options.routes.length; i++) {
				this.addRoute(options.routes[i]);
			}
		}
	}

	this.serializers = [];
	this.errorHandlers = [];
}

util.inherits(RESTHandler, events.EventEmitter);

var Route_addBefore = function(handler) {
	var route = this;
	var before = route._before || (route._before = []);
	before.push(handler);
};

RESTHandler.prototype._registerRoute = function(method, route) {
	var path = route.path;
	var routeInfo = this.routeInfoByPath[path] || (this.routeInfoByPath[path] = {
		methods: []
	});

	routeInfo.methods.push(method);
};

RESTHandler.prototype._getMethodsForPath = function(path) {
	var routeInfo = this.routeInfoByPath[path];
	return (routeInfo) ? routeInfo.methods : null;
};

RESTHandler.prototype._addRoute = function(method, routeConfig) {
	var route = this.createRoute(routeConfig);

	this.getMethodRouter(method).addRoute(route);
	this.getMethodRouter(this.ALL_ROUTES_METHOD).addRoute(route);

	this._registerRoute(method, route);

	route.restHandler = this;

	// notify listeners that route was added
	this.emit('route', {
		method: method,
		route: route
	});
};

function _findRoute(restHandler, method, reqUrl) {
	var router = restHandler._routerByMethod[method];
	if (!router) {
		return null;
	}

	return router.findRoute(reqUrl.pathname);
}

function _notFound(restHandler, reqUrlObj, req, res, socket) {
	// Check if the route exists regardless of method
    var match = _findRoute(restHandler, restHandler.ALL_ROUTES_METHOD, reqUrlObj);
    if (match) {
		var route = match.route;
        restHandler.emit('methodNotAllowed', req, res, socket);
        restHandler.methodNotAllowed('Method Not Allowed', req, res, socket, restHandler._getMethodsForPath(route.path));
    } else {
        restHandler.emit('routeNotFound', req, res, socket);
        restHandler.notFound('Not found', req, res, socket);
    }
}

function _rest(restHandler, req, res, socket, domain) {
	var reqUrlObj = url.parse(req.url, true);

	// find route by exact method match or by wildcard method
	var match = _findRoute(restHandler, req.method, reqUrlObj) || _findRoute(restHandler, '*', reqUrlObj);
	if (!match) {
        _notFound(restHandler, reqUrlObj, req, res, socket);
		return null;
	}

	// Instantiate a REST object that will encapsulate
	// req and res and contain helper methods
	var rest = new REST(restHandler, domain);
	rest.req = req;
	rest.res = res;
	rest.socket = socket;
	rest.params = match.params;
	rest.route = match.route;
	rest.url = reqUrlObj;

	return rest;
}

RESTHandler.prototype.createRoute = function(routeConfig) {
	var route = pathBasedRouter.createRoute(routeConfig);

	if (route.before && (route._before === undefined)) {
		route._before = Array.isArray(route.before) ? route.before : [route.before];
	}

	if (!route.addBefore) {
		// add a mixin
		route.addBefore = Route_addBefore;
	}

	return route;
};

RESTHandler.prototype.getAllRoutes = function() {
	return this.getMethodRouter(this.ALL_ROUTES_METHOD).getRoutes();
};

RESTHandler.prototype.addRoute = function(routeConfig) {
	if (!routeConfig.method) {
		// No method so hook to any method
		this._addRoute('*', routeConfig);
	} else if (Array.isArray(routeConfig.method)) {
		// Route will be bound to multiple methods
		for (var m = 0; m < routeConfig.method.length; m++) {
			var method = routeConfig.method[m];
			this._addRoute(method.toUpperCase(), routeConfig);
		}
	} else {
		// Route will be bound to a single method
		this._addRoute(routeConfig.method.toUpperCase(), routeConfig);
	}
};

RESTHandler.prototype.handle = function(req, res, domain) {
	var rest = _rest(this, req, res, null, domain);
	if (rest !== null) {
		this.emit('beforeHandle', rest);
		rest.handle();
		return rest;
	}
};

RESTHandler.prototype.forwardTo = function(rest, route) {
	var forwardFrom = rest.forwardFrom || (rest.forwardFrom = []);
	forwardFrom.push(rest.url);

	rest.req.url = route;
	rest.url = url.parse(route, true);

	// find route by exact method match or by wildcard method
	var match = _findRoute(this, rest.req.method, rest.url) || _findRoute(this, '*', rest.url);
	if (!match) {
        _notFound(this, rest.url, rest.req, rest.res, rest.socket);
		return null;
	}

	rest.params = match.params;
	rest.route = match.route;

	this.emit('beforeHandle', rest);
	rest.handle();
	return rest;
};

RESTHandler.prototype.handleUpgrade = function(req, socket, head, domain) {

	var rest = _rest(this, req, null, socket, domain);

	if (rest !== null) {
		// store the socket and head in the REST object and also set "upgrade" to true
		rest.upgrade = true;
		rest.head = head;

		// notify listeners that route was added
		this.emit('beforeHandle', rest);

		rest.handle();

		return rest;
	}
};

RESTHandler.prototype.notFound = function(message, req, res, socket) {
	if (this._onRouteNotFound) {
		this._onRouteNotFound(message. req, res, socket);
		return;
	}

	if (arguments.length === 2) {
		req = arguments[0];
		res = arguments[1];
		message = 'Not Found';
	}

	if (res) {
		res.setHeader('Content-Type', 'text/plain');
		res.statusCode = 404;
		res.end(message);
	} else if (socket) {
		socket.end();
	}
};

RESTHandler.prototype.methodNotAllowed = function(message, req, res, socket, methods) {

    if (arguments.length === 2) {
        req = arguments[0];
        res = arguments[1];
        message = 'Method Not Allowed';
    }

    if (res) {
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Allow', methods.join());
        res.statusCode = 405;
        res.end(message);
    } else if (socket) {
        socket.end();
    }
};

RESTHandler.prototype.middleware = RESTHandler.prototype.before = function(middleware) {
	var handler = [];
	if (middleware.constructor === Function) {
		handler = middleware;
	} else {
		handler = middleware.handler;
		if (middleware.init && (middleware.__restHandler !== this)) {
			// record that we initialized it
			middleware.__restHandler = this;

			// middleware has an init function and we haven't initialized it yet
			middleware.init(this);
		}
	}

	if (handler) {
		this._before.push(handler);
	}

	return this;
};

RESTHandler.prototype.getBefore = function() {
	return this._before;
};

RESTHandler.prototype.getMethodRouter = function(method) {
	var router = this._routerByMethod[method];
	if (!router) {

		this._routerByMethod[method] = router = pathBasedRouter.create();
	}
	return router;
};

RESTHandler.prototype.defaultSerializer = function(rest, message) {

	var res = rest.res;
	res.statusCode = res.statusCode || 200;

	if (!message) {
		rest.res.end();
		return;
	}

	var contentType;
	if (message.constructor === String) {
		contentType = res.getHeader('Content-Type') || 'text/plain';
	} else {
		try {
			message = JSON.stringify(message, null, ' ');
			contentType = 'application/json';
		} catch (e) {
			message = message.toString();
			contentType = 'text/plain';
		}
	}

	res.setHeader('Content-Type', contentType);
	res.write(message);
	res.end();
};

RESTHandler.prototype.defaultErrorHandler = function(rest, message) {

	var res = rest.res;

	// remove statusCode if it is not an error code
	if ((res.statusCode < 400) || (res.statusCode >= 600)) {
		res.statusCode = null;
	}

	if (!message) {
		res.statusCode = res.statusCode || 500;
		rest.res.end();
		return;
	}

	if (rest.res.headersSent) {
		if (message instanceof Error) {
			message = message.toString();
		} else if (message) {
			try {
				message = JSON.stringify(message);
			} catch(e) {
				message = message.toString();
			}
		}

		console.error('Error while handling request.', message);
		rest.res.end();
		return;
	}

	var contentType;
	if (message instanceof Error) {
		message = message.toString();
		contentType = 'text/plain';
	} else if (message.constructor === String) {
		contentType = res.getHeader('Content-Type') || 'text/plain';
	} else {
		try {
			message = JSON.stringify(message, null, ' ');
			contentType = 'application/json';
		} catch (e) {
			message = message.toString();
			contentType = 'text/plain';
		}
	}

	if (res.statusCode == null) {
		res.statusCode = 500;
	}

	res.setHeader('Content-Type', contentType);
	if (message != null) {
		res.write(message);
	}
	res.end();
};

RESTHandler.prototype.addSerializer = function(serializer) {
	this.serializers.push(serializer);
	return this;
};

RESTHandler.prototype.errorHandler = RESTHandler.prototype.addErrorSerializer = function(handler) {
	this.errorHandlers.push(handler);
	return this;
};

RESTHandler.prototype.send = function(rest, message) {

	this.emit('beforeSend', rest, message);

	for (var i = 0; i < this.serializers.length; i++) {
		var serializer = this.serializers[i];
		if (serializer(rest, message) || rest.isClosed()) {
			return;
		}
	}

	this.defaultSerializer(rest, message);
};

RESTHandler.prototype.error = function(rest, message) {

	this.emit('requestError', rest, message);
	if (rest.isClosed()) {
		return;
	}

	for (var i = 0; i < this.errorHandlers.length; i++) {
		var serializer = this.errorHandlers[i];
		serializer(rest, message);
		if (rest.isClosed()) {
			return;
		}
	}

	this.defaultErrorHandler(rest, message);
};

/**
 * The default route invoker
 */
RESTHandler.prototype.invokeRoute = function(rest) {
	// invoke the route handler function
    var result = rest.route.handler(rest);
	if (result !== undefined) {
		if (result !== null) {
			if (result.then) {
				// message is a Promise
				return result.then(
					function(result) {
						rest.send(result);
					},
					function(err) {
						rest.error(err);
					});
			}
		}

		rest.send(result);
	}
};

/**
 * Replace the default route invoker with the given function.
 * The given function will be given a single argument of type
 * REST.
 */
RESTHandler.prototype.setRouteInvoker = function (func) {
    this.invokeRoute = func;
};

module.exports = RESTHandler;
