'use strict';

var querystring = require('querystring');
var AsyncValue = require('raptor-async/AsyncValue');

// intercepter for res.end
function end() {
    // this function is always called in scope of response object
    /* jshint validthis:true */
    this._closed = true;
    this._intercepted_end.apply(this, arguments);
}

function Accept(accept) {
    var pos = accept.indexOf(';');
    if (pos !== -1) {
        this.params = accept.substring(pos+1);
        accept = accept.substring(0, pos);
    }

    pos = accept.indexOf('/');
    if (pos === -1) {
        this.type = accept;
    } else {
        this.type = accept.substring(0, pos);
        this.subtype = accept.substring(pos+1);
    }

    this.mimeType = (this.subtype ? this.type + '/' + this.subtype : this.type).toLowerCase();
}

Accept.prototype.getType = function() {
    return this.type;
};

Accept.prototype.getSubtype = function() {
    return this.subtype;
};

Accept.prototype.getMimeType = function() {
    return this.mimeType;
};

function REST(handler, domain) {
    this.handler = handler;
    this.upgrade = false;
    this.domain = domain;
}

function _jsonParser(str, callback) {
    str = str.trim();

    var body;
    if (str.length > 0) {
        try {
            body = JSON.parse(str);
        } catch(e) {
            return callback('Invalid JSON: ' + e);
        }
    } else {
        body = undefined;
    }

    callback(null, body);
}

var PARSERS = {
    'application/x-www-form-urlencoded': function(str, callback) {
        callback(null, querystring.parse(str));
    },

    'application/json': _jsonParser,

    'text/plain': _jsonParser
};

REST.prototype = {

    forwardTo: function(route) {
        this.handler.forwardTo(this, route);
    },

    handle: function() {

        var self = this;

        // inherit the before functions from the RESTHandler
        var allBefore = this.handler.getBefore();
        var routeBefore = this.route._before;

        var res = this.res;

        if (res && !res._intercepted_end) {
            res._intercepted_end = res.end;
            res.end = end;
        }

        var i = -1;

        // calculate the index where the general-purpose middleware ends
        var allBeforeEnd = allBefore.length;

        // calculate the index where the route-specific middleware ends
        var routeBeforeEnd = 0;
        if (routeBefore) {
            routeBeforeEnd = allBefore.length + routeBefore.length;
        }

        var routeInvoked = false;

        var next = function() {
            var beforeHandler;

            if (!self.isClosed()) {
                i++;
                if (i < allBeforeEnd) {
                    // We are in the range of overall middleware...

                    beforeHandler = allBefore[i];
                    // call the all middleware in the scope of the route
                    beforeHandler.call(self.route, self);
                } else if (routeBeforeEnd && (i < routeBeforeEnd)) {
                    // We are in the range of route-specific middleware...
                    beforeHandler = routeBefore[i - allBefore.length];
                    // call the route-specific middleware in the scope of the route
                    beforeHandler.call(self.route, self);
                } else if (routeInvoked === false) {
                    // set flag to indicate that we invoked the main route
                    routeInvoked = true;

                    // always delegate invocation to RESTHandler because this allows
                    // centralization of all route invocation
                    self.handler.invokeRoute(self);
                } else {
                    // we already invoked the route but response is still not closed
                    // so interpret this as not found
                    self.notFound();
                }
            }
        };

        this._next = (this.domain) ? this.domain.bind(next) : next;
        this._next();
    },

    isUpgrade: function() {
        return this.upgrade === true;
    },

    next: function() {
        if (this._next) {
            this._next();
        }
    },

    isClosed: function() {
        return (this.upgrade !== true) && this.res._closed;
    },

    send: function(statusCode, obj) {

        if (arguments.length === 1) {
            obj = statusCode;
        } else {
            this.res.statusCode = statusCode;
        }

        this.handler.send(this, obj);
    },

    error: function(statusCode, error) {

        if (arguments.length === 1) {
            error = statusCode;
        } else {
            this.res.statusCode = statusCode;
        }

        this.handler.error(this, error);
    },

    getCookies: function() {
        if (this._cookies === undefined) {
            var req = this.req;
            var cookies;
            this._cookies = cookies = {};
            if (req.headers.cookie) {
                req.headers.cookie.split(';').forEach(function(cookie) {
                    var parts = cookie.split('=');
                    cookies[parts[0].trim()] = decodeURIComponent((parts[1] || '').trim());
                });
            }
        }

        return this._cookies;
    },

    getCookie: function(name) {
        return this.getCookies()[name];
    },

    getBasicAuth: function() {

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

    getBodyBuffer: function(callback, limit) {
        var self = this;

        if (!self._bodyBuffer) {
            self._bodyBuffer = new AsyncValue({
                loader: function(callback) {
                    var len = 0;
                    var req = self.req;
                    var chunks = [];
                    var err;
                    req.on('data', function (data) {
                        len += data.length;
                        if (!limit || (len <= limit)) {
                            chunks.push(data);
                        } else {
                            err = new Error('Limit exceeded. Reached ' + len + ' characters. Limit = ' + limit);

                            // end the request
                            var res = self.res;
                            res.writeHead(413, {'Content-Type': 'text/plain'});
                            res.end('Limit of ' + limit +' bytes exceeded');
                        }
                    });

                    req.on('end', function () {
                        if (callback) {
                            if (err || (chunks.length === 0)) {
                                return callback(err);
                            }
                            callback(null, Buffer.concat(chunks, len));
                        }
                    });
                }
            });
        }

        self._bodyBuffer.done(callback);
    },

    getBody: function(callback, limit) {
        var self = this;

        if (!self._body) {
            self._body = new AsyncValue({
                loader: function(callback) {
                    self.getBodyBuffer(function(err, buffer) {
                        if (err) {
                            return callback(err);
                        }

                        if (!buffer) {
                            return callback();
                        }

                        return callback(null, buffer.toString('utf8'));
                    }, limit);
                }
            });
        }

        self._body.done(callback);
    },

    getParsedBody: function(callback, limit) {
        var self = this;
        if (!self._parsedBody) {
            self._parsedBody = new AsyncValue({
                loader: function(callback) {
                    self.getBody(function(err, body) {
                        if (err) {
                            return callback(err);
                        }

                        if (!body) {
                            return callback();
                        }

                        var contentType = self.req.headers['content-type'];
                        if (!contentType) {
                            contentType = 'application/json';
                        } else {
                            var pos = contentType.indexOf(';');
                            if (pos !== -1) {
                                contentType = contentType.substring(0, pos);
                            }
                        }

                        var parser = PARSERS[contentType];
                        if (!parser) {
                            return callback(new Error('Unrecognized content type for parsing: ' + contentType));
                        }

                        parser(body, callback);
                    }, limit);
                }
            });
        }

        self._parsedBody.done(callback);

        if (limit && self._body) {
            self._body.limit = Math.max(limit, self._body.limit);
        }
    },

    setResponseHeader: function() {
        this.res.setHeader.apply(this.res, arguments);
    },

    getResponseHeader: function() {
        this.res.getHeader.apply(this.res, arguments);
    },

    getRequestHeaders: function() {
        return this.req.headers;
    },

    getRequestHeader: function(name) {
        return this.req.headers[name.toLowerCase()];
    },

    getAccepts: function() {
        if (!this._accepts) {
            var accepts = this.getRequestHeader('accept').split(',');

            this._accepts = new Array(accepts.length);
            this._acceptsMap = {};

            for (var i = 0; i < accepts.length; i++) {
                var accept = new Accept(accepts[i]);
                this._accepts[i] = accept;
                this._acceptsMap[accept.getMimeType()] = accept;
            }
        }

        return this._accepts;
    },

    getPreferredContentType: function(candidates) {
        var accepts = this.getAccepts();
        if (accepts.length === 0) {
            return null;
        }

        if (candidates) {
            var supported = {};
            var i;

            if (Array.isArray(candidates)) {
                for (i = 0; i < candidates.length; i++) {
                    var candidate = candidates[i];
                    supported[candidate.toLowerCase()] = candidate;
                }
            } else {
                supported[candidates.toLowerCase()] = candidates;
            }

            for (i = 0; i < accepts.length; i++) {
                var accept = accepts[i];
                var match = supported[accept.getMimeType()];
                if (match) {
                    return match;
                }
            }

            return null;
        } else {
            return accepts[0];
        }
    },

    notFound: function(message) {
        if (arguments.length === 0) {
            this.handler.notFound(this.req, this.res);
        } else {
            this.handler.notFound(message, this.req, this.res);
        }
    }
};

module.exports = REST;
