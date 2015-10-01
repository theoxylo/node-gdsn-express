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
    return new Promise(function (fulfill) {
      log.debug('0. synchronous resolver ends with fulfill, return, or throw')
      if      (num > 7) fulfill(num + ' >>> resolver fulfill') // pass goto 23
      else if (num > 4) return  num + ' >>> resolver return'   // pass goto 23
      else               throw  num + ' >>> resolver throw '   // fail goto 27
    })
    .then(function (val) {
        log.debug('1. 1st then val: ' + val)
        if (num % 2)       return val + ' >>> 1then val return'  // pass goto 32
        else                throw val + ' >>> 1then val throw '  // fail goto 36
    },function(err) {
        log.debug('1. 1st then err: ' + err)
        if (num % 2 == 0)  return err + ' >>> 1then err return'  // pass goto 32
        else                throw err + ' >>> 1then err throw '  // fail goto 36
    }) // then returns a new pending promise
    .then(function (val) {
        log.debug('2. 2nd then val: ' + val)
        if (num == 5)      return val + ' >>> 2then val return'  // pass goto 41
        else                throw val + ' >>> 2then val throw'   // fail goto 46 goes to .catch since next then has no failure handler
    },function(err) {
        log.debug('2. 2nd then err: ' + err)
        if (num % 2 == 0)  return err + ' >>> 2then err return'  // pass goto 41
        else                throw err + ' >>> 2then err throw '  // fail goto 46
    })
    .then(function(val) {
        log.debug('3. 3rd then val: ' + val)
        if (num == 5)      return val + ' >>> 3then val return RESOLVED' // pass, all done 
        else                throw val + ' >>> 3then val throw'           // fail goto 46
    }, null /* no 3then failure handler */) // goes straight to .catch
    .catch (function (err) {
        log.debug('4. catch err from 3then or resolver: ' + err)
        if (Math.random() > 0.7) return err + ' >>> catch return RESOLVED'
        else                      throw err + ' >>> catch random rethrow REJECTED'
    }) // catch returns a new pending promise
    
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
    .then(function (xml) {
      log.debug('cin_promise.validate_cin.then xml length: ' + (xml && xml.length))
      res.set('Content-Type', 'application/xml;charset=utf-8')
      res.end(xml)
    })
    .catch(function (err) {
      log.debug('cin_promise.validate_cin.catch err: ' + err)
      res.set('Content-Type', 'application/json;charset=utf-8')
      res.end(err)
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
