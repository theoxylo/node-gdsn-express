module.exports = function (config) {

  var Q = require('q')
  var Promise = Q.Promise

  var log            = require('../lib/Logger')('rt_pr_val', config)
  var item_utils     = require('../lib/item_utils.js')(config)
  var trade_item_db  = require('../lib/db/trade_item.js')(config)

  var cin_promise   = require('../lib/validate_cin.js')(config)


  var get_test_promise = function (num) {
    num = num || Date.now()
    log.debug('calling get_test_promise with effective num: ' + num)
    return new Promise(function (res, rej) {
        log.debug('1. synchronous resolve can end in 1 of 3 ways:')
        if (Math.random() > 0.7) throw('1. resolver throw ' + num)
        if (Math.random() > 0.7) rej('2. resolver reject ' + num)
        else res('3. resolved ' + num)
    })
    .then(function (val) {
        log.debug('4. then val: ' + val)
        if (num % 2) throw val + ' >>> then success throw odd'// odd values resolved by catch below
        return val + ' >>> then success return even RESOLVED'
    }, function (err) {
        log.debug('4. then err: ' + err)
        if (Math.random() > 0.7) throw(err + ' >>> then fail random throw')
        return err + ' >>> then fail return err RESOLVED'  // from throw or rejct in resolver fn
    })
    .catch (function (err) {
        log.debug('4. catch err: ' + err)
        if (Math.random() > 0.7) throw err + ' >>> catch random rethrow REJECTED'
        return err + ' >>> catch return RESOLVED'
    }) // catch returns a new pending promise that mp will return
  } // end get_test_promise

  // api object for return
  var api =  {}
  
  api.test_promise = function (req, res, next) { // eg GET /test_promise
    log.debug('>>> test_promise called with path ' + req.path)
    get_test_promise(Math.floor(Math.random() * 10))
    .then(function (result) {
      log.debug('.then result: ' + result)
      res.jsonp({ success: true, result: result})
    })
    .catch(function (err) {
      log.debug('.catch err: ' + err)
      res.jsonp({ success: false, result: err})
    })
    .done() // Q
  }

  api.get_cin = function (req, res, next) { // GET for single hierarchy, no validation

    log.debug('>>> get_cin PROMISE called with path ' + req.path)

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

    cin_promise.generate_cin(item_spec)
    .then(function (cin_xml) {
      res.set('Content-Type', 'application/xml;charset=utf-8')
      res.end(cin_xml)
    })
    .catch(function (err) {
      log.debug('.catch err: ' + err)
      res.jsonp(err)
    })
    .done() // Q
  }

  api.validate_hierarchy = function (req, res, next) { // GET for single hierarchy with known root item

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

    cin_promise.validate_cin(item_spec)
    .then(function (valid_cin_xml) {
      //res.set('Content-Type', 'application/xml;charset=utf-8')
      res.end(valid_cin_xml)
    })
    .catch(function (err) {
      log.debug('.catch err: ' + err)
      res.jsonp(err)
    })
    .done() // Q
  }

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

      var promises = []
      try {
        log.info('Received content of length ' + (content && content.length || '0'))
        log.debug('request body:' + content)

        var req_body = JSON.parse(content)

        if (!req_body.items.length) return next(Error('no [items] data found in request'))

        req_body.items.forEach(function (item_spec) {
          item_spec.recipient = config.homeDataPoolGln
          item_spec.provider  = provider
          item_spec.tm        = item_spec.tm || '840'
          item_spec.tm_sub    = item_spec.tm_sub || item_spec.tmSub || 'na'
          promises.push(cin_promise.validate_cin(item_spec))
        })
      }
      catch (err) {
        log.error('Error parsing json request content: ' + content)
        log.error(err)
        return next(err)
      }

      Q.allSettled(promises)
      .then(function (results) {

        console.log('==================== Q.allsettled ==================')
        console.dir(results)

        var summary = {success: true, ts: Date.now(), results: []}
        results.forEach(function (result) {
          console.log(result.state + ': ' + (result.value || result.reason))
          //summary.results.push(result.state)
          summary.results.push(result.value || result.reason)
        })
        return summary
      })
      .then(function (data) {
        res.jsonp(data)
        //return data
        console.log('data.state: ' + data.state)   // treat data param like a promise?
        return ('wrote ' + data.length + ' bytes') // treat data param like array/string?
      })
      .catch(function (err) {
        log.debug('catch err: ' + err)
        res.jsonp(err)
      })
      .done()

    }) // end req.on('end')
  }

  return api
}
