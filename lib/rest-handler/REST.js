// intercepter for res.end
function end() {
	this.closed = true;
	this._intercepted_end.apply(this, arguments);
}

function REST(handler, req, res) {

	var self = this;

	this.handler = handler;
	this.req = req;
	this.res = res;

	// inherit the before functions from the RESTHandler
	this._before = handler.getBefore();

	res._intercepted_end = res.end;
	res.end = end;
}

REST.prototype = {

	handle : function() {
		if (this._before && this._before.length > 0) {

			var before = this._before;
			var self = this;
			var i = 0;

			this._next = function() {
				if (!self.closed) {
					i++;
					if (i < before.length) {
						before[i](this);
					} else {
						self.invokeRoute();
					}
				}
			};

			this._before[0](this);
		} else {
			this.invokeRoute();
		}
	},

	next : function() {
		if (this._next) {
			this._next();
		}
	},

	invokeRoute : function() {
		// reached the end of the chain so delete next
		delete this._next;

		// invoke the route handler function
		this.route.fn(this);
	},

	isClosed : function() {
		return this.closed;
	},

	send : function(statusCode, obj) {
		var res = this.res;

		if (arguments.length === 1) {
			obj = statusCode;
			statusCode = res.statusCode || 200;
		}

		res.statusCode = statusCode;
		if (obj) {
			if (obj.constructor !== String) {
				var contentType = this.getResponseHeader('Content-Type');
				if (!contentType) {
					// no content type found so use JSON by default
					this.setResponseHeader('Content-Type', 'application/json');
				}
				obj = JSON.stringify(obj, null, ' ');
			}
			res.write(obj);
		}

		res.end();
	},

	error : function(statusCode, error) {
		this.res.statusCode = this.res.statusCode || 500;
		this.send.apply(this, arguments);
	},

	getCookies : function() {
		if (!this._cookies) {
			var req = this.req;
			var cookies;
			this._cookies = cookies = {};
			req.headers.cookie && req.headers.cookie.split(';').forEach(function(cookie) {
				var parts = cookie.split('=');
				cookies[parts[0].trim()] = (parts[1] || '').trim();
			});
		}

		return this._cookies;
	},

	getCookie : function(name) {
		return this.getCookies()[name];
	},

	getBasicAuth : function() {

		if (this._basicAuth === undefined) {
			var req = this.req;
			if (req.headers.authorization) {
				var basicAuthParser = require('basic-auth-parser');
				this._basicAuth = basicAuthParser(req.headers.authorization);
			} else {
				this._basicAuth = null;
			}
		}

		return this._basicAuth;
	},

	getBody : function(callback, limit) {

		if (this._body) {
			callback(null, this._body);
			return;
		}

		var len = 0;
		var req = this.req;
		var body = [];

        req.on('data', function (data) {
        	len += data.length;
        	if (!limit || (len <= limit)) {
            	body.push(data);
            } else {
            	callback('Limit exceeded. Reached ' + len + ' characters. Limit = ' + limit);
            	callback = null;
            }
        });

        req.on('end', function () {
        	if (callback) {
        		this._body = body.join('');
	            callback(null, this._body);
	        }
        });
	},

	getParsedBody : function(callback, limit) {

		if (this._parsedBody) {
			callback(null, this._parsedBody);
			return;
		}

		this.getBody(function(err, body) {
			try {
				this._parsedBody = JSON.parse(body);
				callback(null, this._parsedBody);
			} catch(err) {
				callback(err);
			}
		});
	},

	setResponseHeader : function() {
		this.res.setHeader.apply(this.res, arguments);
	},

	getResponseHeader : function() {
		this.res.getHeader.apply(this.res, arguments);
	}
};

module.exports = REST;
