var events = require('events');
var util = require('util');
var url = require('url');
var Router = require('amd-router').Router;

var REST = require('./REST');

function RESTHandler(options) {
	events.EventEmitter.call(this);
	this._routerByMethod = {};

	// array of functions that will be invoked prior to request being dispatched to final route function
	this._before = [];

	if (options) {
		if (options.routes) {
			for (var i = 0; i < options.routes.length; i++) {
				this.addRoute(options.routes[i]);
			}
		}
	}

	this.serializers = [];
	this.errorSerializers = [];
}

util.inherits(RESTHandler, events.EventEmitter);

RESTHandler.prototype._addRoute = function(method, routeConfig) {
	var route = this.getMethodRouter(method).addRoute(routeConfig);
	route.restHandler = this;

	// notify listeners that route was added
	this.emit('route', {
		method: method,
		route: route
	});
}

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
}

RESTHandler.prototype._findRoute = function(method, reqUrl) {
	var router = this._routerByMethod[method];
	if (!router) {
		return null;
	}

	return router.findRoute(reqUrl.pathname);
}

RESTHandler.prototype._rest = function(req, method, domain) {
	var reqUrl = url.parse(req.url, true),
		// find route by exact method match or by wildcard method
		match = this._findRoute(req.method, reqUrl) || this._findRoute('*', reqUrl);

	if (!match) {
		this.emit('routeNotFound', req, res);
		this.notFound(req, res);
		return;
	}

	// Instantiate a REST object that will encapsulate
	// req and res and contain helper methods
	var rest = new REST(this, domain);
	rest.req = req;
	rest.params = match.params;
	rest.route = match.route;
	rest.url = reqUrl;

	return rest;
};

RESTHandler.prototype.handle = function(req, res, domain) {
	var rest = this._rest(req, domain);

	// store "res" object in request
	rest.res = res;

	// notify listeners that route was added
	this.emit('beforeHandle', rest);

	rest.handle();

	return rest;
};

RESTHandler.prototype.handleUpgrade = function(req, socket, head, domain) {

	var rest = this._rest(req, domain);

	// store the socket and head in the REST object and also set "upgrade" to true
	rest.upgrade = true;
	rest.socket = socket;
	rest.head = head;

	// notify listeners that route was added
	this.emit('beforeHandle', rest);

	rest.handle();
	
	return rest;
};

RESTHandler.prototype.notFound = function(message, req, res) {

	if (arguments.length === 2) {
		res = arguments[1];
		req = arguments[0];
		message = 'Not Found';
	}

	res.setHeader('Content-Type', 'text/plain');
	res.statusCode = 404;
	res.end(message);
}

RESTHandler.prototype.before = function(fn, thisObj) {
	this._before.push({
		fn: fn,
		thisObj: thisObj
	});
}

RESTHandler.prototype.getBefore = function() {
	return this._before;
},

RESTHandler.prototype.getMethodRouter = function(method) {
	var router = this._routerByMethod[method];
	if (!router) {

		this._routerByMethod[method] = router = new Router();
	}
	return router;
}

RESTHandler.prototype.defaultSerializer = function(rest, message) {

	var res = rest.res;
	res.statusCode = res.statusCode || 200;

	if (!message) {
		rest.res.end();
		return;
	}

	if (message.constructor === String) {
		contentType = res.getHeader('Content-Type') || 'text/plain';
	} else {
		try {
			message = JSON.stringify(message, null, ' ');
			contentType = 'application/json';
		} catch (e) {
			message = message.toString();
			contentType = 'text/plain'
		}
	}

	res.setHeader('Content-Type', contentType);
	res.write(message);
	res.end();
}

RESTHandler.prototype.defaultErrorSerializer = function(rest, message) {

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

	if (message instanceof Error) {
		res.statusCode = res.statusCode || 500;
		message = message.toString();
		contentType = 'text/plain';
	} else if (message.constructor === String) {
		res.statusCode = res.statusCode || 400;
		contentType = res.getHeader('Content-Type') || 'text/plain';
	} else {
		res.statusCode = res.statusCode || 500;
		try {
			message = JSON.stringify(message, null, ' ');
			contentType = 'application/json';
		} catch (e) {
			message = message.toString();
			contentType = 'text/plain'
		}
	}

	res.setHeader('Content-Type', contentType);
	res.write(message);
	res.end();
}

RESTHandler.prototype.addSerializer = function(serializer) {
	this.serializers.push(serializer);
}

RESTHandler.prototype.addErrorSerializer = function(serializer) {
	this.errorSerializers.push(serializer);
}

RESTHandler.prototype.send = function(rest, message) {

	for (var i = 0; i < this.serializers.length; i++) {
		var serializer = this.serializers[i];
		serializer(rest, message);
		if (rest.isClosed()) {
			return;
		}
	}

	this.defaultSerializer(rest, message);
}

RESTHandler.prototype.error = function(rest, message) {

	for (var i = 0; i < this.errorSerializers.length; i++) {
		var serializer = this.errorSerializers[i];
		serializer(rest, message);
		if (rest.isClosed()) {
			return;
		}
	}

	this.defaultErrorSerializer(rest, message);
}

module.exports = RESTHandler;