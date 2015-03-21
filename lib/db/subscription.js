module.exports = function (config) {

	var log   = require('../Logger')('db_sub', {debug: true})
	
	var api = {}

	api.save_sub = function (sub_info, callback) {

      var query = {
        recipient: sub_info.recipient
        , xml: {$ne: sub_info.xml} // slow?
      }

      // optional subscription criteria, but at least one should be present:
      query.provider = sub_info.provider || ''
      query.gpc      = sub_info.gpc      || ''
      query.gtin     = sub_info.gtin     || ''
      query.tm       = sub_info.tm       || ''

      config.database.subscriptions.findOne(query, {}, function (err, existing_sub) {
	    if (err) return callback(err)

	    if (existing_sub) {
	      //if (existing_sub.xml == sub_info.xml) {
            log.debug('sub xml unchanged, skipping update for gln ' + sub_info)
	        return callback(null, sub_info.gln) 
	      //}
	      sub_info.created_ts = existing_sub_info.created_ts // carry over original create timestamp
	    }

	    sub_info.modified_ts = Date.now()

	    try {
	      config.database.subscriptions.update(query, sub_info, {upsert: true})
	      log.info('Persisted sub with GLN ' + sub_info)
	      return callback(null, sub_info)
	    }
	    catch (err) {
	      log.error('Error persisting sub with GLN ' + sub_info + ': ' + err)
	      return callback(err)
	    }
	  })
	}

	api.list_subs = function (page, perPage, callback) {
      config.database.subscriptions
        .find({}, {_id: 0}) // include xml
        .sort({modified_ts: -1})
        .skip(page * perPage)
        .limit(perPage)
        .toArray(callback)
	}

	api.find_sub = function (sub_info, callback) {
      log.info('Database#find_sub gln ' + sub_info)
	}
	
	return api;
}
