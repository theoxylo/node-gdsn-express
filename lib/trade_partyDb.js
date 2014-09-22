module.exports = function (config) {

	var log   = require('./Logger')('trparty_db', {debug: true})
	
	var api = {}

	api.saveParty = function (party, callback) {
//	  var self = this

	  this.findParty(party.gln, function (err, existing_party) {

	    if (err) return callback(err)

	    if (existing_party) {
	      if (existing_party.raw_xml === party.raw_xml) {
	        // no update needed for this party
	        return callback(null, '^' + party.gln)
	      }
	      party.created_ts = existing_party.created_ts // carry over original create timestamp
	    }

	    party.modified_ts = Date.now()

	    try {
	      config.database.mdb.parties.update({gln: party.gln, raw_xml: {$ne: party.raw_xml} }, party, {upsert: true})
	      log.info('Persisted party with GLN ' + party.gln)
	      return callback(null, party.gln)
	    }
	    catch (err) {
	      log.error('Error persisting party with GLN ' + party.gln + ': ' + err)
	      return callback(err)
	    }
	  })
	}

	api.listParties = function (page, perPage, callback) {
	  try {
	    config.database.mdb.parties
	      .find({}, {xml: 0, raw_xml: 0})
	      .sort({modified_ts: -1})
	      .skip(page * perPage)
	      .limit(perPage)
	      .toArray(callback)
	  }
	  catch (err) {
	    setImmediate(function () {
	      callback(err)
	    })
	  }
	}

	api.findParty = function (gln, callback) {
	  try {
	    log.info('Database#findParty gln ' + gln)
	    config.database.mdb.parties.findOne({gln: gln}, {}, callback)
	  }
	  catch (err) {
	    setImmediate(function () {
	      callback(err)
	    })
	  }
	}
	
	return api;
}
