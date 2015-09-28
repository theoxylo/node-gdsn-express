module.exports = function (config) {

  var Q = require('q')
  var Promise = Q.Promise
  var request = require('request')

  var log            = require('../lib/Logger.js')('prom_cin', config)
  var item_utils     = require('../lib/item_utils.js')(config)
  var trade_item_db  = require('../lib/db/trade_item.js')(config)

  return {

    get_item: function (query, callback) {
      query.archived_ts = { $exists : false }
      new Promise(function (resolve, reject) { // getTradeItemPromise(query)
        var start = Date.now()
        trade_item_db.getTradeItems(query, 0, 100, function (err, items) {
          log.debug('getTradeItems for provider ' + query.provider + ', gtin ' + query.gtin + ' took ' + (Date.now() - start) + ' ms')
          if (err) return reject(err)
          if (!items || !items.length) {
            query.msg = 'item not found for query'
            return reject(query)
          }
          if (Math.random() > 0.7) throw Error('random throw in resolver')
          if (items.length > 1) log.info('Duplicate items found (only newest will be included) for provider ' + query.provider + ', gtin ' + query.gtin + ', tm ' + query.tm + ', tm_sub ' + query.tm_sub)
          resolve(items[0]) // only use single newest root item
        }) // end getTradeItems
      }) // end new Promise
      .then(
        function then_success(item) {
          log.debug('then_success for item gtin: ' + item.gtin)
          callback(null, item) // all done for single item hierarchy
        }, 
        function then_failed(err) {
          log.debug('then_failed for item gtin: ' + item.gtin)
          callback(err)
        } // end then fail handler
      ) // end then call
    },

    get_hierarchy: function (query, callback) {
      query.archived_ts = { $exists : false }
      new Promise(function (resolve, reject) { // getTradeItemPromise(query)
        var start = Date.now()
        trade_item_db.getTradeItems(query, 0, 100, function (err, items) {
          log.debug('getTradeItems for provider ' + query.provider + ', gtin ' + query.gtin + ' took ' + (Date.now() - start) + ' ms')
          if (err) return reject(err)
          if (!items || !items.length) {
            query.msg = 'item not found for query'
            return reject(query)
          }
          if (items.length > 1) log.info('Duplicate items found (only newest will be included)')
          resolve(items[0]) // only use single newest root item
        }) // end getTradeItems
      }) // end new Promise
      .then(function (item) {
        log.debug('item gtin: ' + item.gtin)
        //return getFetchChildrenPromise(item)
        if (!item.child_count) return callback(null, [item]) // all done for single item hierarchy

        return new Promise(function (resolve, reject) {
          var start = Date.now()
          item_utils.fetch_all_children(item, 99, function (err, items) {
            log.debug('fetch_all_children took ' + (Date.now() - start) + ' ms')
            if (err || !items) return reject(err)
            items.unshift(item) // include original root item
            resolve(items)
          }) // end  fetch_all_children
          log.debug('fetching_all_children...')
        }) // end new Promise
      }) // end then
    },

    generate_cin: function (item_spec) { // eg /get_cin/provider/gtin/tm/tm_sub
      item_spec.archived_ts = { $exists : false }
      return getTradeItemPromise(item_spec)
      .then(function (item) {
        log.debug('promised item gtin: ' + item.gtin)
        return getFetchChildrenPromise(item)
      }) // end then
      .then(function (items) {
        var cin_xml = config.gdsn.create_cin_28(items, config.homeDataPoolGln, 'ADD', 'false', 'ORIGINAL', item_spec.provider)
        log.debug('cin_xml length: ' + cin_xml.length)
        return cin_xml
      }) // end then
    },

    validate_cin: function (item_spec) { // eg /validate/gln/gtin/tm/tm_sub
      item_spec.archived_ts = { $exists : false }
      return getTradeItemPromise(item_spec)
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
    }

  } // end api and return

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
        if (err || !items) return reject(err)
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
