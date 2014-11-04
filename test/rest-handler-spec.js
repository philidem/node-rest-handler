var chai = require('chai');
chai.Assertion.includeStack = true;
require('chai').should();

var MockRequest = require('./MockRequest');
var MockResponse = require('./MockResponse');

var expect = require('chai').expect;

describe('default GET method routing configuration', function() {
    var myRestHandler = require('..').create({
        routes: [
            '/cars',
            '/cars/:carId',
            '/trucks',
            '/trucks/:truckId'
        ]
    });

    var router = myRestHandler.getMethodRouter('*');
    
    it('should contain 4 routes', function() {
        expect(router.getRoutes().length).to.equal(4);
    });

    it('should contain routes that we expect', function() {
        expect(router.getRoutes()[0].toString()).to.equal('/cars');
        expect(router.getRoutes()[1].toString()).to.equal('/cars/:carId');
        expect(router.getRoutes()[2].toString()).to.equal('/trucks');
        expect(router.getRoutes()[3].toString()).to.equal('/trucks/:truckId');
    });

    it('should find match /cars', function() {
        var match = router.findRoute('/cars');
        expect(match).to.not.equal(null);
        expect(match.route.toString()).to.equal('/cars');
    });

    it('should find match /cars/123', function() {
        var match = router.findRoute('/cars/123');
        expect(match.params.carId).to.equal('123');
        expect(match.route.toString(match.params)).to.equal('/cars/123');
    });

    it('should not find match /cars/123/bad', function() {
        var match = router.findRoute('/cars/123/bad');
        expect(match).to.equal(null);
    });
    
    it('should support resetting of routing table', function() {
        router.reset();
        expect(router.getRoutes().length).to.equal(0);
    });
});

describe('route request', function() {
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

    var myRestHandler = require('..').create({
        routes: [
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
                        _id: rest.params.carId
                    });
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

        expect(res.statusCode).to.equal(404);
    });

    it('should format response as application/json', function() {
        var req = new MockRequest();
        req.url = '/cars';

        var res = new MockResponse();

        myRestHandler.handle(req, res);

        expect(res.getHeader('Content-Type')).to.equal('application/json');
        expect(JSON.parse(res.mock_getWritten())).to.deep.equal(carsResponse);

    });

    it('should handle parameters', function() {
        var req = new MockRequest();
        req.url = '/cars/123';

        var res = new MockResponse();

        var rest = myRestHandler.handle(req, res);
        expect(res.getHeader('Content-Type')).to.equal('application/json');
        expect(rest.params.carId).to.equal('123');
        expect(JSON.parse(res.mock_getWritten())).to.deep.equal({
            _id: '123'
        });
    });
});