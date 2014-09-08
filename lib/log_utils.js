module.exports = function(config) {

	var winston = require('winston');

	/* winston-mongodb */
	require('winston-mongodb').MongoDB;
	var mongoOptions = {
		safe : false,
		//silent: true,
		dbUri : config.db_url,
	}

	var api = {}

	/* new instance */
	api.log = new (winston.Logger)({
		transports : [
		//new (winston.transports.Console)({ timestamp:true, level: 'info' }),
		//new (winston.transports.File)({ filename: './somefile.log', level: 'info' }),
		new (winston.transports.MongoDB)(mongoOptions), //info is default
		]
	});

	return api
}
