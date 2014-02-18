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
      if (results && results[0] && results[0].xml) {
        res.set('Content-Type', 'application/xml');
        res.send(results[0].xml);
      }
    })
  }

  api.post_trade_items = function (req, res, next) {
    console.log('post_trade_items handler called')
    var items = []

    config.gdsn.getEachTradeItemFromStream(req, function (err, item) {
      if (err) return next(err)
      if (item) {
        config.database.saveTradeItem(item, function (err, gtin) {
          if (err) return next(err)
          items.push(gtin)
        })
      }
      else res.end('Saved ' + items.length + ' items: ' + items.join(', '))
    })
  }

  return api;
}
