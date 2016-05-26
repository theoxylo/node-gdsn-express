module.exports = function (config) {

	var log   = require('../Logger')('db_pub', config)

  var options = { timeout: config.db_timeout }
	
	var api = {}

	api.save_pub = function (pub_info, callback) {

      var query = {
        recipient: pub_info.recipient
        , provider: pub_info.provider
        , gtin: pub_info.gtin
        , tm: pub_info.tm
        , tm_sub: pub_info.tm_sub
        //, xml: {$ne: pub_info.xml} // slow?
      }

      try {
        config.database.publications.update(query, pub_info, {upsert: true})
        log.info('Persisted pub: ' + pub_info)
        return callback(null, pub_info)
      }
      catch (err) {
        log.error('Error persisting pub_info: ' + err)
        return callback(err)
      }
	}

	api.list_pubs = function (page, perPage, callback) {
      config.database.publications
        .find({}, {_id: 0}, options) // include xml
        .sort({modified_ts: -1})
        .skip(page * perPage)
        .limit(perPage)
        .toArray(callback)
	}

	return api;
}
