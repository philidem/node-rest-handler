var RESTHandler = require('./lib/rest-handler/RESTHandler');

module.exports = {
	create: function(options) {
		return new RESTHandler(options);
	},
	
	createRoute: RESTHandler.prototype.createRoute,

	RESTHandler: RESTHandler
};
