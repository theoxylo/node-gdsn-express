module.exports = function (config) {

  var Q = require('q')
  var Promise = Q.Promise
  var request = require('request')

  var log            = require('../lib/Logger.js')('prom_cin', config)
  var item_utils     = require('../lib/item_utils.js')(config)
  var trade_item_db  = require('../lib/db/trade_item.js')(config)

  var api = {}

  api.get_item = function (query, callback) {
    get_item_promise(query)
    .then(function (item) { callback(null, item)})
    .catch(function (err) { callback(err)})
    .done()
  }

  api.get_item_hierarchy = function (query, callback) {
    get_item_promise(query)
    .then(function (item) { return get_item_hierarchy_promise(item)      })
    .then(function (items){ callback(null, items)                        })
    .catch(function (err) { callback(err)                                })
    .done()
  }

  api.get_item_hierarchy_cin = function (query, callback) {
    get_item_promise(query)
    .then(function (item)  { return get_item_hierarchy_promise(item)     })
    .then(function (items) { return get_item_hierarchy_cin_promise(items)})
    .then(function (xml)   { callback(null, xml)                         })
    .catch(function (err)  { callback(err)                               })
    .done()
  }

  api.item_hierarchy_cin_validate = function (query, callback) {
    var bms = query.validate_bms ? 'true' : 'false'
    get_item_promise(query)
    .then(function (item)  { return get_item_hierarchy_promise(item)     })
    .then(function (items) { return get_item_hierarchy_cin_promise(items)})
    .then(function (xml  ) { return get_validation_promise(xml, bms)     })
    .then(function (result){ callback(null, result)                      })
    .catch(function (err)  { callback(err)                               })
    .done()
  }

  return api

  function get_item_promise(query) {
    query = {recipient: query.recipient, gtin: query.gtin, provider: query.provider, tm: query.tm, tm_sub: query.tm_sub, archived_ts: { $exists : false }}
    return new Promise(function resolver(fulfill, reject) {
      var start = Date.now()
      trade_item_db.getTradeItems(query, 0, 100, function (err, items) {
        log.debug('getTradeItems for provider ' + query.provider + ', gtin ' + query.gtin + ' took ' + (Date.now() - start) + ' ms')
        log.debug('found count: ' + (items && items.length))
        if (err) reject(err)
        if (!items || !items.length) reject(Error('Item not found for provider ' + query.provider + ', gtin ' + query.gtin + ', tm ' + query.tm + ', tm_sub ' + query.tm_sub + ', recipient ' + query.recipient))
        fulfill(items[0]) // only return most recent
      })
    })
  }

  function get_item_hierarchy_promise(item) {
    return new Promise(function resolver(fulfill, reject) {
      var start = Date.now()
      item_utils.fetch_all_children(item, 99, function (err, items) {
        log.debug('fetch_all_children took ' + (Date.now() - start) + ' ms')
        if (err) reject(err)
        items.unshift(item) // include original root item
        fulfill(items)
      })
    })
  }

  function get_item_hierarchy_cin_promise(items) {
    return new Promise(function resolver(fulfill) {
      var cin_xml = config.gdsn.create_cin(items, config.homeDataPoolGln, 'ADD', 'false', 'ORIGINAL', items[0].provider)
      log.debug('promised cin_xml length: ' + (cin_xml && cin_xml.length))
      fulfill(cin_xml)
    })
  }

  function get_validation_promise(cin_xml, bms) {
    if (!cin_xml || !cin_xml.length) return Promise.reject()
    return new Promise(function resolver(fulfill, reject) {
      var start = Date.now()
      var gdsn_url = config.url_gdsn_api + '/xmlvalidation?bus_vld=' + bms
      request.post({
        url: gdsn_url
        , auth: {
            'user': 'admin'
            , 'pass': 'devadmin'
            , 'sendImmediately': true
          }
        , body: cin_xml
      }, 
      function (err, response, body) {
        log.debug('post to gdsn xmlvalidation with bus_vld took ' + (Date.now() - start) + ' ms with gdsn url ' + gdsn_url)
        if (err) reject(err)
        var result = {}
        try {
          result = JSON.parse(body) // parse error will reject promise
          log.debug('body parse result: ' + JSON.stringify(result))
        }
        catch (e) { 
          log.debug('rejecting with error: ' + e)
          return reject(e) 
        }
        // fulfilled with one of:
        // {"success":true,"ts":"Fri Oct 02 09:13:58 PDT 2015","errors":[]}
        // {"success":false,"ts":"Fri Oct 02 09:13:58 PDT 2015","errors":[{"error_msg":"error 1"},{"error_msg":"another msg","xPath":"test/","}]}
        fulfill({
          success: result.success
          ,ts    : result.timestamp
          ,errors: result.error || result.errors || []
          //,cin_xml: cin_xml
        })
      })
    })
  }
}
