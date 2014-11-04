function MockResponse() {
	this._written = [];
	this.headers = {};
	this._closed = false;
}

// function _logMethodCall(name, args) {
// 	var argsArray = new Array(args.length);
// 	for (var i = 0; i < args.length; i++) {
// 		argsArray[i] = args[i];
// 	}
// 	console.log('[MockResponse] ' + name + ': ' + JSON.stringify(argsArray));
// }

MockResponse.prototype.write = function(data) {
	// _logMethodCall('write', arguments);
	if (this._closed) {
		throw new Error('Response is closed');
	}
	this._written.push(data);
};

MockResponse.prototype.end = function(data, encoding) {
	// _logMethodCall('end', arguments);
	if (data) {
		this._written.push(data);
	}
	this._closed = true;
};

MockResponse.prototype.setHeader = function(name, value) {
	// _logMethodCall('setHeader', arguments);
	if (this._closed) {
		throw new Error('Response is closed');
	}
	this.headers[name.toLowerCase()] = value;
};

MockResponse.prototype.getHeader = function(name) {
	// _logMethodCall('getHeader', arguments);
	return this.headers[name.toLowerCase()];
};

MockResponse.prototype.mock_getWritten = function() {
	return this._written.join('');
};

module.exports = MockResponse;