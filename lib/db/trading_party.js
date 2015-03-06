module.exports = function (config) {

	var log   = require('../Logger')('db_party', {debug: true})
	
	var api = {}

	api.saveParty = function (party, callback) {
	  this.findParty(party.gln, function (err, existing_party) {
	    if (err) return callback(err)

	    if (existing_party) {
	      if (existing_party.xml === party.xml) {
            log.debug('party xml unchanged, skipping update for gln ' + party.gln)
	        return callback(null, party.gln) 
	      }
	      party.created_ts = existing_party.created_ts // carry over original create timestamp
	    }

	    party.modified_ts = Date.now()

	    try {
	      config.database.parties.update({gln: party.gln, xml: {$ne: party.xml} }, party, {upsert: true})
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
        .find({}, {xml: 0, raw_xml: 0}) // raw_xml is deprecated, but might still be present on some records
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
