var Router = require.resolve('amd-router/Router');
console.log('Router found: ' + !!Router);

var restHandler = require('../index');

var MockRequest = require('./MockRequest');
var MockResponse = require('./MockResponse');

describe('default GET method routing configuration', function() {
    
    (function() {
	        
	    var myRestHandler = restHandler.create({
            routes : [
                '/cars',
                '/cars/:carId',
                '/trucks',
                '/trucks/:truckId'
            ]
        });

        var router = myRestHandler.getMethodRouter('GET');
        
        it('should contain 4 routes', function() {
            expect(router.getRoutes().length).toEqual(4);
        });

        it('should contain routes that we expect', function() {
            expect(router.getRoutes()[0].toString()).toEqual('/cars');
            expect(router.getRoutes()[1].toString()).toEqual('/cars/:carId');
            expect(router.getRoutes()[2].toString()).toEqual('/trucks');
            expect(router.getRoutes()[3].toString()).toEqual('/trucks/:truckId');
        });

        it('should find match /cars', function() {
            var match = router.findRoute('/cars');
            expect(match).toNotEqual(null);
            expect(match.route.toString()).toEqual('/cars');
        });

        it('should find match /cars/123', function() {
            var match = router.findRoute('/cars/123');
            expect(match.params.carId).toEqual('123');
            expect(match.route.toString(match.params)).toEqual('/cars/123');
        });

        it('should not find match /cars/123/bad', function() {
            var match = router.findRoute('/cars/123/bad');
            expect(match).toEqual(null);
        });
        
        it('should support resetting of routing table', function() {
            router.reset();
            expect(router.getRoutes().length).toEqual(0);
        });

    })();
});

describe('route request', function() {
    
    (function() {
	    
	    var carsResponse = {
	    	cars: [
        		{
        			_id: 'car1'
        		},
        		{
        			_id: 'car2'
        		}
			]
	    };

	    var myRestHandler = restHandler.create({
            routes : [
                {
                	route: '/cars',
                	fn: function(rest) {
                		rest.send(carsResponse);
                	}
                },
                {
                	route: '/cars/:carId',
                	fn: function(rest) {

                		rest.send({
                			_id : rest.params.carId
                		})
                	}
                },
                {
                	route: '/cause/error',
                	fn: function(rest) {
                		rest.error('Danger! System overheating.');
                	}
                }
            ]
        });

        it('should send 404 for unrecognized route', function() {
        	var req = new MockRequest();
        	req.url = '/does/not/exist';

        	var res = new MockResponse();

        	myRestHandler.handle(req, res);

        	expect(res.statusCode).toEqual(404);
        });

    	it('should format response as application/json', function() {
        	var req = new MockRequest();
        	req.url = '/cars';

        	var res = new MockResponse();

        	myRestHandler.handle(req, res);

        	expect(res.getHeader('Content-Type')).toEqual('application/json');
        	expect(JSON.parse(res.mock_getWritten().join(''))).toEqual(carsResponse);

        });

        it('should handle parameters', function() {
        	var req = new MockRequest();
        	req.url = '/cars/123';

        	var res = new MockResponse();

        	var rest = myRestHandler.handle(req, res);
        	expect(res.getHeader('Content-Type')).toEqual('application/json');
        	expect(rest.params.carId).toEqual('123');
        	expect(JSON.parse(res.mock_getWritten().join(''))).toEqual({
        		_id : '123'
        	});
        });


    })();
});