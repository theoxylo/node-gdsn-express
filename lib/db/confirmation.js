module.exports = function (config) {

	var log   = require('../Logger')('db_cic', {debug: true})

  var options = { timeout: config.db_timeout }
	
	var api = {}

	api.save_cic = function (cic, callback) {

      var query = {
          recipient: cic.recipient
        , provider : cic.provider
        , gtin     : cic.gtin
        , tm       : cic.tm
        , tm_sub   : cic.tm_sub
        //, xml: {$ne: cic.xml} // slow?
      }

      cic.modified_ts = Date.now()

      try {
        config.database.confirmations.update(query, cic, {upsert: true})
        log.info('Persisted cic: ' + cic)
        return callback(null, cic)
      }
      catch (err) {
        log.error('Error persisting cic: ' + err)
        return callback(err)
      }
	}

	api.list_cic = function (page, perPage, callback) {
      config.database.confirmations
        .find({}, {_id: 0}, options) // include xml
        .sort({modified_ts: -1})
        .skip(page * perPage)
        .limit(perPage)
        .toArray(callback)
	}

	return api;
}
