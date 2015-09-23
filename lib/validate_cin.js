module.exports = function (config) {

  var Q = require('q')
  var Promise = Q.Promise
  var request = require('request')

  var log            = require('../lib/Logger.js')('prom_cin', config)
  var item_utils     = require('../lib/item_utils.js')(config)
  var trade_item_db  = require('../lib/db/trade_item.js')(config)

  return {

    validate_cin: function (item_spec) {
      item_spec.archived_ts = { $exists : false }
      var result = getTradeItemPromise(item_spec)
      .then(function (item) {
        log.debug('promised item gtin: ' + item.gtin)
        return getFetchChildrenPromise(item)
      }) // end then
      .then(function (items) {
        var cin_xml = config.gdsn.create_cin_28(items, config.homeDataPoolGln, 'ADD', 'false', 'ORIGINAL', item_spec.provider)
        return Promise.resolve(cin_xml)
      })
      .then(function (cin_xml) {
        log.debug('cin_xml length: ' + cin_xml.length)
        return getValidationPromise(cin_xml)
      }) // end then
      return result // cin xml OR error report
    }

  } // end return

  function getTradeItemPromise(query) {
    return new Promise(function (resolve, reject) {
      var start = Date.now()
      trade_item_db.getTradeItems(query, 0, 100, function (err, items) {
        log.debug('getTradeItems for provider ' + query.provider + ', gtin ' + query.gtin + ' took ' + (Date.now() - start) + ' ms')
        if (err) return reject(err)
        if (!items || !items.length) return reject('Item not found for provider ' + query.provider + ', gtin ' + query.gtin + ', tm ' + query.tm + ', tm_sub ' + query.tm_sub)
        if (items.length > 1) return reject('Multiple items found for provider ' + query.provider + ', gtin ' + query.gtin + ', tm ' + query.tm + ', tm_sub ' + query.tm_sub)
        resolve(items[0])
      }) // end getTradeItems
    }) // end new Promise
  } // end getTradeItemPromise

  function getFetchChildrenPromise(item) {
    return new Promise(function (resolve, reject) {
      var start = Date.now()
      item_utils.fetch_all_children(item, 99, function (err, items) {
        log.debug('fetch_all_children took ' + (Date.now() - start) + ' ms')
        if (err || !items || !items.length) return reject(err)
        items.unshift(item) // include original root item
        resolve(items)
      }) // end  fetch_all_children
    }) // end new Promise
  } // end getFetchChildrenPromise

  function getValidationPromise(cin_xml) {
    return new Promise(function (resolve, reject) {
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
        if (err) return reject(err)
        if (!getSuccess(body)) return reject(body)
        resolve(cin_xml)
      }) // end request.post
    }) // end new Promise
  } // end getValidationPromise

  function getSuccess(body) {
    try {
      var success = JSON.parse(body).success
      console.log('success value from body: ' + success)
      return success && success != 'false' && success != 'FALSE'
    }
    catch (err) {
      console.log('json parse error: ' + err)
    }
    return false
  }
}
