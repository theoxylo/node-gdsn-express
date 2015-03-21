module.exports = function (config) {

	var log   = require('../Logger')('db_pub', {debug: true})
	
	var api = {}

	api.save_pub = function (pub_info, callback) {

      var query = {
        recipient: pub_info.recipient
        , provider: pub_info.provider
        , gtin: pub_info.gtin
        , tm: pub_info.tm
        , tm_sub: pub_info.tm_sub
        , xml: {$ne: pub_info.xml} // slow?
      }

      config.database.publications.findOne(query, {}, function (err, existing_pub) {
	    if (err) return callback(err)

	    if (existing_pub) {
	      //if (existing_pub.xml == pub_info.xml) {
            log.debug('pub xml unchanged, skipping update for gln ' + pub_info)
	        return callback(null, pub_info) 
	      //}
	      pub_info.created_ts = existing_pub_info.created_ts // carry over original create timestamp
	    }

	    pub_info.modified_ts = Date.now()

	    try {
	      config.database.publications.update(query, pub_info, {upsert: true})
	      log.info('Persisted pub: ' + pub_info)
	      return callback(null, pub_info)
	    }
	    catch (err) {
	      log.error('Error persisting pub_info: ' + err)
	      return callback(err)
	    }
	  })
	}

	api.list_pubs = function (page, perPage, callback) {
      config.database.publications
        .find({}, {_id: 0}) // include xml
        .sort({modified_ts: -1})
        .skip(page * perPage)
        .limit(perPage)
        .toArray(callback)
	}

	api.find_pub = function (pub_info, callback) {
      log.info('Database#find_pub gln ' + gln)
	}
	
	return api;
}
