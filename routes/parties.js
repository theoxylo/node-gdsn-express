// GDSN Server DP API example usage:
//
//GLN lookup: http://plt-gdsn01.itradenetwork.com:8080/gdsn-server/bpr-update.mvc?mode=query&gln=1100001011483&submit=Find+Party+by+GLN&name=MDS+Test+Publisher&partyRole=SUPPLIER&address1=123+Main+St&address2=Suite+1&city=Pleasanton&state=CA&zip=94588&contactName=JB&contactEmail=mds%40itradenetwork.com&contactPhone=9256601100&_addNew=on
//
//Party name search: http://plt-gdsn01.itradenetwork.com:8080/gdsn-server/bpr-update.mvc?mode=search&gln=1100001011483&name=MDS+Test+Publisher&submit=Find+Parties+by+Name&partyRole=SUPPLIER&address1=123+Main+St&address2=Suite+1&city=Pleasanton&state=CA&zip=94588&contactName=JB&contactEmail=mds%40itradenetwork.com&contactPhone=9256601100&_addNew=on


module.exports = function (config) {
  
  var api = {}

  var log           = require('../lib/Logger')('rt_parties', config)
  var digester      = require("xml-digester").XmlDigester({});
  var party_db = require('../lib/db/trading_party.js')(config)

  api.find_parties = function(req, res, next) {
    log.debug('find_parties')
    var gln = req.params.gln
    var start = Date.now()
    party_db.findParty(gln, function (err, results) {
      if (err) return next(err)
      res.jsonp(results);
      log.db(req.url, req.user, (Date.now() - start) )
    })
  }

  api.list_parties = function(req, res, next) {
    log.debug('list_parties')
    var page = parseInt(req.param('page'))
    log.info('page ' + page)
    if (!page || page < 0) page = 0
    var start = Date.now()
    party_db.listParties(page, config.per_page_count, function (err, results) {
      if (err) return next(err)
      res.jsonp(results);
      log.db(req.url, req.user, (Date.now() - start) )
    })
  }

  api.post_parties = function (req, res, next) {
    //console.log('post_parties handler called')

    var parties = []

    config.gdsn.getEachPartyFromStream(req, function (err, party) {
      if (err) return next(err)

      if (party) {
        digester.digest(party.xml, function (err, json) {
          if (err) return next(err)
          party.json = json

          party_db.saveParty(party, function (err, gln) {
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
