var Q = require('q')
var Promise = Q.Promise
var request = require('request')
var config

module.exports = function (x_config) {

  config = x_config
  var log            = require('../lib/Logger')('rt_pr_val', config)
  var item_utils     = require('../lib/item_utils.js')(config)
  var trade_item_db  = require('../lib/db/trade_item.js')(config)

  var api =  {}

  api.validate_hierarchies = function (req, res, next) {

      var provider = req.params.provider
      if (!provider) {
        return next(Error('provider gln is required'))
      }

      var content = ''
      req.setEncoding('utf8')
      req.on('data', function (chunk) {
        log.debug('mds_post_chunk length: ' + (chunk && chunk.length))
        content += chunk
        if (content.length > 10 * 1024 * 1024 && !res.finished) res.end('content too big - larger than 10 MB')
      })

      req.on('end', function () {

        var req_body
        var promises = []
        try {
          log.info('Received content of length ' + (content && content.length || '0'))
          console.log('request body:' + content)

          req_body = JSON.parse(content)

          console.log('parsed:')
          console.dir(req_body)

          req_body.items.forEach(function (item_spec) { // TODO: create new array with map and copy

            item_spec.recipient = config.homeDataPoolGln
            item_spec.provider  = provider
            item_spec.tm        = item_spec.tm || '840'
            item_spec.tm_sub    = item_spec.tm_sub || item_spec.tmSub || 'na'

            promises.push(getPromiseChain(item_spec))
          })
        }
        catch (err) {
          log.error('Error parsing json request content: ' + content)
          log.error(err)
          req_body = { items: [], validate: false, err: err }
        }
        if (!req_body.items.length) return next(Error('no item definitions found in request'))

        Q.allSettled(promises)
        .then(function (results) {

          console.log('==================== Q.allsettled ==================')
          console.dir(results)

          var summary = {success: true, ts: Date.now(), results: []}

          results.forEach(function (result) {
            console.log(result.state + ': ' + (result.value || result.reason))
            summary.results.push(result.state)
          })

          return summary
        })
        .then(function (data) {
          if (!res.finished) res.jsonp(data)
        })
        .catch(function (err) {
          log.debug('catch err: ' + err)
          if (!res.finished) res.jsonp(err)
        })
        .done()

      }) // end req.on('end')
    }

  
  api.validate_hierarchy = function (req, res, next) { // GET

    log.debug('>>> validate_hierarchy PROMISE called with path ' + req.path)

    var provider = req.param('provider')
    var gtin = req.param('gtin')
    if (!provider || !gtin) { // provider and root item gtin are always required
      return next(Error('missing provider or gtin'))
    }

    var tm = req.param('tm') || '840' // default
    var tm_sub = req.param('tm_sub') || 'na' // default

    // generate TP CIN to home DP for registration-oriented validation
    var item_spec = {
      recipient : config.homeDataPoolGln
      ,provider  : provider
      ,gtin      : gtin
      ,tm        : tm
      ,tm_sub    : tm_sub
    }

    getPromiseChain(item_spec)
    .then(function (valid_cin_xml) {
      if (!res.finished) {
        res.set('Content-Type', 'application/xml;charset=utf-8')
        res.end(valid_cin_xml)
      }
    }) // end then
    .catch(function (err) {
      log.debug('catch err: ' + err)
      if (!res.finished) res.jsonp(err)
    })
    .done()

  }

  return api

  function getPromiseChain(item_spec) {
    item_spec.archived_ts = { $exists : false }
    return getTradeItemPromise(item_spec)
    .then(function (item) {
      log.debug('promised item gtin: ' + item.gtin)
      return getFetchChildrenPromise(item, item_spec.provider)
    }) // end then
    .then(function (cin_xml) {
      log.debug('cin_xml length: ' + cin_xml.length)
      return getValidationPromise(cin_xml)
    }) // end then
  }

  function getTradeItemPromise(query) {
    return Promise(function (resolve, reject) {
      var start = Date.now()
      trade_item_db.getTradeItems(query, 0, 100, function (err, items) {
        log.debug('getTradeItems for provider ' + query.provider + ', gtin ' + query.gtin + ' took ' + (Date.now() - start) + ' ms')
        if (err) return reject(err)
        if (!items || !items.length) return reject('Item not found for provider ' + query.provider + ', gtin ' + query.gtin + ', tm ' + query.tm + ', tm_sub ' + query.tm_sub)
        if (items.length > 1) return reject('Multiple items found for provider ' + query.provider + ', gtin ' + query.gtin + ', tm ' + query.tm + ', tm_sub ' + query.tm_sub)
        resolve(items[0])
      }) // end getTradeItems
    }) // end Promise
  } // end getTradeItemPromise

  function getFetchChildrenPromise(item, provider) {
    return Promise(function (resolve, reject) {
      var start = Date.now()
      item_utils.fetch_all_children(item, 99, function (err, items) {
        log.debug('fetch_all_children took ' + (Date.now() - start) + ' ms')
        if (err || !items) return reject(err)
        try {
          var cin_xml = config.gdsn.create_cin_28(items, config.homeDataPoolGln, 'ADD', 'false', 'ORIGINAL', provider)
          resolve(cin_xml)
        }
        catch (err) {
          log.info('failed to create 28 cin to dp ' + err)
          reject(err)
        }
      }) // end  fetch_all_children
    }) // end Promise
  } // end getFetchChildrenPromise

  function getValidationPromise(cin_xml) {
    return Promise(function (resolve, reject) {
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
    }) // end Promise
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

} // end module.exports function
