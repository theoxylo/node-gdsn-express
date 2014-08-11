module.exports = function (config) {
  
  var fs = require('fs')
  var log  = require('../lib/Logger')('rt_profile', {debug: true})

  return {

    profileLoader: function (req, res, next) { // load profile
      if (!req.user) return next(new Error('must be logged in'))
      if (config.user_config[req.user]) {
        log.debug('found existing user_config for user ' + req.user)
        return next()
      }
      var filename = __dirname + '/../profiles/' + req.user + '.js'
      log.info('loading user_config for user \'' + req.user + '\', file: ' + filename)

      fs.readFile(filename, function (err, data) {
        if (config.user_config[req.user]) return next() // in case it got loaded since above check
        config.user_config[req.user] = {}
        if (!err) {
          try {
            var module = { exports: {}}
            var code = '(function (module) {' + data + '})(module)';
            eval(code);
            config.user_config[req.user] = module.exports
            log.info('loaded profile from file \'' + filename + '\': ' + config.user_config[req.user].client_name)
          }
          catch (e) {
            log.warn('error parsing profile \'' + filename + '\': ' + e)
          }
        }
        else console.log(err)
        config.user_config[req.user].user = req.user
        next()
      })
    },

    profileChecker: function (req, res, next) {
      var path = config.base_url + req.path
      log.info('checking user \'' + req.user + '\' config for requested url: ' + req.url)
      var urls = config.user_config[req.user] && config.user_config[req.user].urls
      for (var i = 0; urls && i < urls.length; i++) {
        if (path.indexOf(urls[i]) == 0) {
          log.info('path \'' + path + '\' allowed by config \'' + urls[i] + '\' for user ' + req.user)
          return next()
        }
      }
      res.statusCode = 403
      res.end('path ' + path + ' not configured for user ' + req.user)
    }

  }
}
