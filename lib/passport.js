// passport google authentication
module.exports = {
    
  init: function (config) {

    var passport = require('passport')
    var google   = require('passport-google')

    var log = require('./Logger')('passport', config)
    var app = config.app

    log.debug('init passport for google')
    app.use(passport.initialize())
    //app.use(passport.session())

    passport.serializeUser(function (user_info, done) {
      log.info('>>>> serializeUser: ' + JSON.stringify(user_info))
      var user_email = user_info.emails && user_info.emails[0] && user_info.emails[0].value
      log.info('passing user_email to done callback: ' + user_email)
      done(null, user_email)
    })

    passport.deserializeUser(function (id, done) {
      log.info('<<<< deserializeUser id: ' + JSON.stringify(id))
      var user_info = {
          user: 'passport_user',
          test: 'hello',
          id: id,
          google_token: id
      }
      done(null, 'TESTING_REQ.USER') // req.user will be set to user
      //done(null, user_info.user) // req.user will be set to user
      //done(null, { identifier: id })
    })

    passport.use(new google.Strategy({

        returnURL: 'http://' + config.http_host + ':' + config.http_port + '/auth/login/return'
        , realm  : 'http://' + config.http_host + ':' + config.http_port
      },
      function (identifier, profile, done) {
        log.info('profile identifier: ' + identifier)
        profile = profile || {}
        profile.identifier = identifier
        done(null, profile)
      })
    )

    log.debug('setting passport routes')

    var login_ok = '/cs_api/1.0/items/history/1100001011292/10024951191010/4243444546475/840/na'
    //var login_ok = '/login-success.html'
    //var login_ok = '/index.html?logged_in'
    var login_fail = '/index.html?login_fail'
    var passport_auth = passport.authenticate('google', { successRedirect: login_ok , failureRedirect: login_fail})

    app.get('/auth/login/return', function (req, res, next) {

      log.info('return passport req.url: ' + req.url)
      log.info('return passport req.user: ' + req.user)
      log.info('return passport req.params: ' + JSON.stringify(req.params))
      log.info('return passport req.query: ' + JSON.stringify(req.query))

      if (log.is_debug()) {
        for (var prop in req) {
          if (req.hasOwnProperty(prop) && typeof req[prop] != 'function') {
            log.debug('return passport req.' + prop + ': ' + req[prop])
          }
        }
      }

      //req.session.google_email = req.param('openid.ext1.value.email')

      var email_param = req.param('openid.ext1.value.email')
      log.info('return passport 302 query string user_email ' + email_param)

      passport_auth(req, res)
      log.info('after RETURN passport_auth, req.user: ' + req.user)
    })

    app.get('/auth/login', function (req, res, next) {

      log.info('passport req.url: ' + req.url)
      log.info('passport req.user: ' + req.user)
      log.info('passport req.params: ' + JSON.stringify(req.params))
      log.info('passport req.query: ' + JSON.stringify(req.query))

      if (log.is_debug()) {
        for (var prop in req) {
          if (req.hasOwnProperty(prop) && typeof req[prop] != 'function') {
            log.debug('passport req.' + prop + ': ' + req[prop])
          }
        }
      }

      passport_auth(req, res)
      log.info('after passport_auth, req.user: ' + req.user)
    })

    app.get('/auth/logout', function (req, res, next) {
      log.info('passport logout: ' + req.path)
      req.logout()
      res.redirect('/index.html?logged_out')
    })

    log.info('ITN passport config finished')
  }
}

