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
    get_item_promise(query)
    .then(function (item)  { return get_item_hierarchy_promise(item)     })
    .then(function (items) { return get_item_hierarchy_cin_promise(items)})
    .then(function (xml  ) { return get_validation_promise(xml)          })
    .then(function (result){ callback(null, result)                      })
    .catch(function (err)  { callback(err)                               })
    .done()
  }

  return api

  function get_item_promise(query) {
    query.archived_ts = { $exists : false }
    return new Promise(function resolver(fulfill) {
      var start = Date.now()
      trade_item_db.getTradeItems(query, 0, 100, function (err, items) {
        log.debug('getTradeItems for provider ' + query.provider + ', gtin ' + query.gtin + ' took ' + (Date.now() - start) + ' ms')
        if (err) throw err
        if (!items || !items.length) throw Error('Item not found for provider ' + query.provider + ', gtin ' + query.gtin + ', tm ' + query.tm + ', tm_sub ' + query.tm_sub)
        fulfill(items[0]) // only return most recent
      })
    })
  }

  function get_item_hierarchy_promise(item) {
    return new Promise(function resolver(fulfill) {
      var start = Date.now()
      item_utils.fetch_all_children(item, 99, function (err, items) {
        log.debug('fetch_all_children took ' + (Date.now() - start) + ' ms')
        if (err) throw err
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

  function get_validation_promise(cin_xml) {
    if (!cin_xml || !cin_xml.length) return Promise.reject()
    return new Promise(function resolver(fulfill) {
      var start = Date.now()
      var gdsn_url = config.url_gdsn_api + '/xmlvalidation?bus_vld=true'
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
        if (err) throw err
        var result = JSON.parse(body) // parse error will reject promise
        log.debug('body parse result: ' + JSON.stringify(result))
        // fulfilled with one of:
        // {"success":true,"ts":"Fri Oct 02 09:13:58 PDT 2015","errors":[]}
        // {"success":false,"ts":"Fri Oct 02 09:14:47 PDT 2015","errors":["(line:1,col:12647): cvc-enumeration-valid: Value 'EACH' is not facet-valid with respect to enumeration '[BASE_UNIT_OR_EACH, CASE, DISPLAY_SHIPPER, MIXED_MODULE, MULTIPACK, PACK_OR_INNER_PACK, PALLET, PREPACK, PREPACK_ASSORTMENT, SETPACK, TRANSPORT_LOAD]'. It must be a value from the enumeration.","(line:1,col:12647): cvc-type.3.1.3: The value 'EACH' of element 'tradeItemUnitDescriptor' is not valid.","(line:1,col:13250): cvc-complex-type.2.4.b: The content of element 'tradeItemInformation' is not complete. One of '{tradeItemDescriptionInformation}' is expected."]}
        fulfill({
          success: result.success
          ,ts    : result.timestamp
          ,errors: splitError(result.error)
        })
      })
    })
  }

  function splitError(error) {
    if (!error || !error.length) return []
    var errors = error.split('\n')
    .filter(function(item) {
      //if (!item) return null;
      return !!item
    })
    return errors || [error]
  }
}
