module.exports = function (config) {

  var Q = require('q')
  var Promise = Q.Promise

  var log            = require('../lib/Logger')('rt_pr_test', config)

  var get_test_promise = function (num) {
    num = num || Date.now()
    log.debug('calling get_test_promise with effective num: ' + num)
    return new Promise(function (fulfill) {
      log.debug('0. synchronous resolver ends with throw or fulfill')
      if   (num > 5) throw  num + ' >>> resolver throw '   // fail - goto 1then err
      else          fulfill(num + ' >>> resolver fulfill') // pass - goto 1then val
    })
    .then(function (val) {
        log.debug('1. 1st then val: ' + val)
        if (num % 2)       return val + ' >>> 1then val return'  // pass - goto 2then val
        else                throw val + ' >>> 1then val throw '  // fail - goto 2then err
    },function(err) {
        log.debug('1. 1st then err: ' + err)
        if (num % 2 == 0)  return err + ' >>> 1then err return'  // pass - goto 2then val
        else                throw err + ' >>> 1then err throw '  // fail - goto 2then err
    }) // then returns a new pending promise
    .then(function (val) {
        log.debug('2. 2nd then val: ' + val)
        if (num == 5)      return val + ' >>> 2then val return'  // pass - goto 3then val
        else                throw val + ' >>> 2then val throw'   // fail - goto .catch since next then has no err handler
    },function(err) {
        log.debug('2. 2nd then err: ' + err)
        if (num % 2 == 0)  return err + ' >>> 2then err return'  // pass - goto 3then val
        else                throw err + ' >>> 2then err throw '  // fail - goto .catch since next then has no err handler
    })
    .then(function(val) {
        log.debug('3. 3rd then val: ' + val)
        if (num == 5)      return val + ' >>> 3then val return RESOLVED' // pass, all done 
        else                throw val + ' >>> 3then val throw'           // fail - goto .catch
    }) // no 3then failure handler, err goes straight to .catch
    .catch (function (err) {
        log.debug('4. catch err from 3then or resolver: ' + err)
        if (Math.random() > 0.7) return err + ' >>> catch return RESOLVED'
        else                      throw err + ' >>> catch random rethrow REJECTED'
    }) // catch returns a new pending promise
    
  } // end get_test_promise

  return {
    do_get : function (req, res, next) { // eg router.get('/test_promise'
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
  }
}
