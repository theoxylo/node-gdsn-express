module.exports = function (config) {
  
  var api = {}

  var log           = require('../lib/Logger')('rt_parties', {debug: true}, config)
  var digester      = require("xml-digester").XmlDigester({});
  var trade_partyDb = require('../lib/trade_partyDb.js')(config)

  api.find_parties = function(req, res, next) {
    log.debug('find_parties')
    var gln = req.params.gln
    var start = Date.now()
    trade_partyDb.findParty(gln, function (err, results) {
      if (err) return next(err)
      res.json(results);
      log.db(req.url, req.user, (Date.now() - start) )
    })
  }

  api.list_parties = function(req, res, next) {
    log.debug('list_parties')
    var page = parseInt(req.param('page'))
    log.info('page ' + page)
    if (!page || page < 0) page = 0
    var start = Date.now()
    trade_partyDb.listParties(page, config.per_page_count, function (err, results) {
      if (err) return next(err)
      res.json(results);
      log.db(req.url, req.user, (Date.now() - start) )
    })
  }

  api.post_parties = function (req, res, next) {
    console.log('post_parties handler called')

    var parties = []

    config.gdsn.parties.getEachPartyFromStream(req, function (err, party) {
      if (err) return next(err)

      if (party) {
        digester.digest(party.xml, function (err, json) {
          if (err) return next(err)
          party.json = json

          trade_partyDb.saveParty(party, function (err, gln) {
            if (err) return next(err)
            parties.push(gln)
          })
        })
      }
      else res.end('Saved ' + parties.length + ' parties: ' + parties.join(', '))
    })

  }

  return api;
}
