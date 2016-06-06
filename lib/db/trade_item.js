module.exports = function (config) {

  var log        = require('../Logger')('db_items', config)
  var xml_digest = require('../xml_to_json.js')(config)
  
  var options = { timeout: config.db_timeout }

  var api = {}

  api.saveTradeItem = function (item, callback) {

    // refresh tradeItem JS object graph from xml
    try {
      if (item.xml) {
        var clean_xml = config.gdsn.clean_xml(item.xml)
        item.tradeItem = xml_digest.digest(clean_xml).tradeItem
      }
    }
    catch (err) {
      log.info('err generating digest from tradeItem xml: ' + err)
    }
  
    item.modified_ts = Date.now()
    if (!item.recipient) item.recipient = item.provider
    if (!item.recipient) item.recipient = config.homeDataPoolGln
    //if (!item.source_dp) item.source_dp = config.homeDataPoolGln
    if (!item.created_ts) item.created_ts = item.modified_ts

    // remove old raw_xml field
    if (item.raw_xml) {
      if (!item.xml) item.xml = item.raw_xml
      delete item.raw_xml
    }

    var start = Date.now()
    log.debug('db.trade_items.archive started at ' + start)
    config.database.trade_items.update( { 
          recipient  : item.recipient
        , gtin       : item.gtin
        , provider   : item.provider
        , tm         : item.tm
        , tm_sub     : item.tm_sub
        , archived_ts: { $exists : false }
      }
      , { $set : {archived_ts: start} }
      , { multi: true , w: 0 }
      , function (err) {
          log.info('db.trade_items.update took ' + (Date.now() - start) + ' ms for item ' + (item && item.gtin))
          if (err) return callback(err)
          var start2 = Date.now()
          log.debug('db.trade_items.save started at ' + start2)
          config.database.trade_items.save(item, {w:0}, function (err) {
            log.info('db.trade_items.save took ' + (Date.now() - start2) + ' ms for item ' + (item && item.gtin))
            if (err) return callback(err)
            callback(null, item.gtin)
          }) // end nested save
        }
    ) // end update
  }

  api.getTradeItems = function (query, page, perPage, callback) {

    var req_id = config.request_counter++
    query = query || {}

    var slow_warn = config.slow_warn_ms || 1000

    var start = Date.now()
    log.debug(req_id + ' db.trade_items.find( ' + JSON.stringify(query) + ' ) started at ' + start)

    config.database.trade_items
      .find(query, {_id: 0}, options)
      .sort({modified_ts: -1})
      .skip(page * perPage)
      .limit(perPage)
      .toArray(function (err, items) {
        var time = Date.now() - start
        log.info(req_id + ' query ' + JSON.stringify(query) + ' found ' + (items && items.length) +  ' items in ' + (Date.now() - start) + ' ms' + (time > slow_warn ? ' SLOW' : ''))
        callback(err, items)
      })
  }

  // find single newest trade item with xml
  api.findTradeItemFromItem = function (item, callback) {
    api.findTradeItem(item.recipient, item.gtin, item.provider, item.tm , item.tm_sub, callback)
  }

  api.findTradeItem = function (recipient, gtin, provider, tm , tm_sub, callback) {
    var start = Date.now()
    var slow_warn = config.slow_warn_ms || 1000
    var query = {
        recipient: recipient
        ,gtin    : gtin
        ,provider: provider
        ,tm      : tm
        ,tm_sub  : tm_sub
    }
    config.database.trade_items
    .find(query, {}, options)
    .sort({modified_ts: -1})
    .limit(1)
    .toArray(function (err, items) {
      var time = Date.now() - start
      log.info('query ' + JSON.stringify(query) + ' found ' + (items && items.length) +  ' items in ' + (Date.now() - start) + ' ms' + (time > slow_warn ? ' SLOW' : ''))
      if (err) return callback(err)
      if (items && items[0]) return callback(null, items[0])
      callback(Error('item not found for query ' + JSON.stringify(query)))
    })
  }

  return api;
}
