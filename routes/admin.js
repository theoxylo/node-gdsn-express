(function () {

  var log  = require('../lib/Logger')('routes.admin', {debug: true})

  module.exports = function (req, res, next) {

    var cmd = req.query['req'] || req.query['cmd']

    log.debug('/admin/data.json command: ' + cmd)
    log.debug(JSON.stringify(req.query))

    if (cmd === 'login') {
      var user = req.query.Username
      var pass = req.query.Password
      log.info('login attempt for user: ' + user + ' (' + pass + ')')

      if (user === 'admin' && pass === 'devadmin') {
        res.json({
          authmask: "2097151",
          success: "true"
        })
        return
      }
      else {
        res.json({
          status: "403",
          success: "false"
        })
        return
      }
    }
    else if (cmd === 'gettip') {
      res.json({
        tip: 'Current server date/time: ' + Date()
      })
    }
    else if (cmd === 'getstatus') {
      res.json({
        state: 20, // server is up
        failed: false
      })
    }
    else {
      return next(new Error('command not recognized'))
    }
  }

})()
