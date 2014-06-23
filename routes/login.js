exports.getRequestHandler = function (config) {

  var log  = require('../lib/Logger')('login', config)

  return function(req, res, next) {
    try {
      if (req.url.indexOf('?') < 0) {
        return res.render('login_api_docs_10')
      }
      log.debug('login req.url: ' + req.url)
      log.debug('login user: ' + req.query['user'])
      var user = req.query['user']
      var pass = req.query['pass']

      var token = new Buffer(user + ":" + pass, 'utf8').toString('base64')
      log.info('token for user ' + user + ', pass ' + pass + ': ' + token)

      res.jsonp({token: token, timestamp: Date.now()})
    }
    catch (err) {
      next(err)
    }
  }

}
