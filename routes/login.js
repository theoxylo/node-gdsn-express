module.exports = function (config) {

  var log = require('../lib/Logger')('login', config)

  var api = {}

  api.authenticate = function(req, res, next) {
    try {
      log.debug('login req.url: ' + req.url)
      log.debug('login req.originalUrl: ' + req.originalUrl)
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

  return api
}
