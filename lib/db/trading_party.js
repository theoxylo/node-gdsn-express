module.exports = function (config) {

	var log   = require('../Logger')('db_party', {debug: true})
	
	var api = {}

	api.saveParty = function (party, callback) {
	  this.findParty(party.gln, function (err, existing_party) {
	    if (err) return callback(err)

	    if (existing_party) {
	      if (existing_party.raw_xml === party.raw_xml) {
	        return callback(null, '^' + party.gln) // no update needed
	      }
	      party.created_ts = existing_party.created_ts // carry over original create timestamp
	    }

	    party.modified_ts = Date.now()

	    try {
	      config.database.parties.update({gln: party.gln, raw_xml: {$ne: party.raw_xml} }, party, {upsert: true})
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
      config.database.parties
        .find({}, {xml: 0, raw_xml: 0})
        .sort({modified_ts: -1})
        .skip(page * perPage)
        .limit(perPage)
        .toArray(callback)
	}

	api.findParty = function (gln, callback) {
      log.info('Database#findParty gln ' + gln)
      config.database.parties.findOne({gln: gln}, {}, callback)
	}
	
	return api;
}
