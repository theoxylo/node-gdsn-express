module.exports = function (config) {

  var api = {}

  var log  = require('../lib/Logger')('routes_item', {debug: true})

  api.list_trade_items = function(req, res, next) {
    log.debug('list_items')
    config.database.listTradeItems(function (err, results) {
      if (err) return next(err)
      res.json(results);
    })
  }

  api.find_trade_item = function (req, res, next) {
    log.debug('find_trade_item')
    var gtin      = req.params.gtin
    var provider  = req.params.provider
    var tm        = req.params.tm
    var tmsub     = req.params.tmsub
    var recipient = req.params.recipient

    config.database.findTradeItem(gtin, provider, tm, tmsub, recipient, function (err, results) {
      if (err) return next(err)
      var item = results && results[0]

      if (!item) return next(new Error('item not found'))

      if (req.query.json || req.path.indexOf('json') > 0) { // json
        if (req.query.download) {
          res.set('Content-Disposition', 'attachment; filename="item_' + item.gtin + '.json"')
          res.json(item.json);
        }
        else {
          res.jsonp(item.json);
        }
      }
      else { // xml
        res.set('Content-Type', 'application/xml;charset=utf-8')
        if (req.query.download) {
          res.set('Content-Disposition', 'attachment; filename="item_' + item.gtin + '.xml"')
        }
        res.send(item.xml)
      }
    })
  }

  api.post_trade_items = function (req, res, next) {
    console.log('post_trade_items handler called')
    var items = []

    config.gdsn.getEachTradeItemFromStream(req, function (err, item) {
      if (err) return next(err)
      if (item) {
        convertToJson(item.xml, function (err, json) {
          if (err) return next(err)
          item.json = json
          config.database.saveTradeItem(item, function (err, gtin) {
            if (err) return next(err)
            items.push(gtin)
          })
        })
      }
      else res.end('Saved ' + items.length + ' items: ' + items.join(', '))
    })
  }

  var convertToJson = function (xml, cb) {
    var xml_digester = require("xml-digester");
    var digester = xml_digester.XmlDigester({});
    digester.digest(xml, cb)
  }
  

  return api;
}
