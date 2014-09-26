module.exports = function (config) {

  var log   = require('../Logger')('db_items', {debug: true})
  
  var api = {}
  
  api.saveTradeItem = function (item, callback) {
    item.modified_ts = Date.now()
    if (!item.recipient) item.recipient = config.homeDataPoolGln
    if (!item.source_dp) item.source_dp = config.homeDataPoolGln
    if (!item.created_ts) item.created_ts = item.modified_ts
    this.archiveTradeItem(item, function (err, result) {
      //log.debug('archiveTradeItem result: ' + JSON.stringify(result))
      var start = Date.now()
      log.debug('db.trade_items.save started at ' + start)
      config.database.trade_items.save(item, function (err, result) {
        if (err) return callback(err)
        log.info('db.trade_items.save took ' + (Date.now() - start) + 'ms for item ' + (item && item.gtin))
        //log.debug('trade_items.save result: ' + JSON.stringify(result))
        callback(null, result.gtin)
      })
    })
  }

  api.getTradeItem = function (query, callback) {
    var page = 0
    var per_page = 2
    var includeXml = false
    this.getTradeItems(query, page, per_page, includeXml, callback)
  }

  api.getTradeItems = function (query, page, perPage, includeXml, callback, count_only) {
    var req_id = config.request_counter++
    query = query || {}

    var projection = {
      raw_xml: 0
      , _id  : 0
    }
    if (!includeXml) {
        projection.xml = 0
        //projection.tradeItem = 0 // we need tradeItem, but adds a lot of size per result to the response
    }
    log.debug('getTradeItems projection: ' + JSON.stringify(projection))

    var slow_warn = config.slow_warn_ms || 1000
    var max_count = config.total_item_count_limit || 500

    var start = Date.now()
    log.debug(req_id + ' db.trade_items.find( ' + JSON.stringify(query) + ' ) started at ' + start + (count_only ? ' (counting ' + max_count + ')' : ''))

    if (count_only) {
//        var self = this
      config.database.trade_items
      .find(query, {})
      .sort({modified_ts: -1})
      .skip(max_count)
      .limit(1)
      .toArray(function (err, result) {
        var time = Date.now() - start
        log.info(req_id + ' query ' + JSON.stringify(query) + ' found count over ' + max_count + ': ' + (result && result.length) +  ' in ' + time + 'ms' + (time > slow_warn ? ' SLOW' : ''))

        if (err) return callback(err)
        if (result && result.length) return callback(null, max_count + '+')

        // if max_count or less, get actual total count (slow)
        var start2 = Date.now()
        log.debug(req_id + ' db.trade_items.find.count( ' + JSON.stringify(query) + ' ) started at ' + start2)
        config.database.trade_items
        .find(query, {})
        .sort({modified_ts: -1})
        .count(function (err, result) { // very very slow!
          var time = Date.now() - start2
          log.info(req_id + ' query ' + JSON.stringify(query) + ' found count ' + result +  ' in ' + time + 'ms' + (time > slow_warn ? ' SLOW' : ''))
          callback(err, result)
        })
      })
    }
    else {
      config.database.trade_items
        .find(query, projection)
        .sort({modified_ts: -1})
        .skip(page * perPage)
        .limit(perPage)
        .toArray(function (err, items) {
          var time = Date.now() - start
          log.info(req_id + ' query ' + JSON.stringify(query) + ' found ' + (items && items.length) +  ' items in ' + time + 'ms' + (time > slow_warn ? ' SLOW' : ''))
          callback(err, items)
        })
    }
  }

  api.archiveTradeItem = function (item, callback) {
    log.info('trade item archive called for GTIN: ' + item.gtin)

    var start = Date.now()
    log.debug('db.trade_items.update started at ' + start)

    config.database.trade_items.update( { 
          recipient : item.recipient
        , gtin    : item.gtin
        , provider: item.provider
        , tm      : item.tm
        , tm_sub  : item.tm_sub
        , archived_ts : { $exists : false }
      }
      , { $set : {archived_ts: Date.now()} }
      , { multi: true }
      , function (err, result) {
          var time = Date.now() - start
          log.info('db.trade_items.update took ' + time + 'ms for result ' + (result && JSON.stringify(result)))
          callback(err, result)
        }
    )
  }

  return api;
}
