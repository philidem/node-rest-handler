function MockRequest(options) {
	options = options || {};

	this.headers = options.headers || {};
	this.data = options.data || [];
	this.method = options.method || 'GET';

	this._endEmitted = false;
}

MockRequest.prototype.on = function(event, func) {
	if (event === 'data') {
		var data = this.data;
		if (data) {
			
			if (Array.isArray(data)) {
				for (var i = 0; i < data.length; i++) {
					func(data[i]);
				}
			} else {
				func(data);
			}

			if (this._endListener) {
				this._endListener();
			}
			this._dataSent = true;
		}
	} else if (event === 'end') {
		if (this._dataSent) {
			func();
		} else {
			this._endListener = func;
		}
	}
};

module.exports = MockRequest;