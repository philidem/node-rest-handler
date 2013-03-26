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
},

RESTHandler.prototype.addRoute = function(routeConfig) {
	if (!routeConfig.method) {
		// GET method is hte default
		this._addRoute('GET', routeConfig);
	} else if (Array.isArray(routeConfig.method)) {
		// Route will be bound to multiple methods
		for (var m = 0; m < routeConfig.method.length; m++) {
			this._addRoute(routeConfig.method[m], routeConfig);
		}
	} else {
		// Route will be bound to a single method
		this._addRoute(routeConfig.method, routeConfig);
	}
},

RESTHandler.prototype.handle = function(req, res) {

	var reqUrl = url.parse(req.url, true);

	var router = this._routerByMethod[req.method];
	if (!router) {
		this.notFound(req, res);
		return null;
	}

	var match = router.findRoute(reqUrl.pathname);
	if (!match) {
		this.notFound(req, res);
		return null;
	}

	// Instantiate a REST object that will encapsulate
	// req and res and contain helper methods
	var rest = new REST(this, req, res);
	rest.params = match.params;
	rest.route = match.route;
	rest.url = reqUrl;
	rest.handle();
	return rest;
},

RESTHandler.prototype.notFound = function(req, res) {
	res.setHeader('Content-Type', 'text/plain')
	res.statusCode = 404;
	res.end('Not Found');
},

RESTHandler.prototype.before = function(fn) {
	this._before.push(fn);
},

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

module.exports = RESTHandler;