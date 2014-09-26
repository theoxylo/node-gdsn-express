// passport google authentication
module.exports = {
    
  init: function (app, log) {

    var passport = require('passport')
    var google   = require('passport-google')

    log.debug('init passport')
    app.use(passport.initialize())

    app.use(passport.session())

    passport.serializeUser(function (user, done) {
      log.info('serializeUser ', user)
      done(null, user.identifier)
    })

    passport.deserializeUser(function (id, done) {
      log.info('deserializeUser ', id)
      var user = {
          test: 'hello',
          id: id,
          google_token: id
      }
      done(null, user) // req.user will be set to user
      //done(null, { identifier: id })
    })

    passport.use(new google.Strategy({
        returnURL: 'http://localhost:8080/auth/google/return'
        , realm: 'http://localhost:8080'
      },
      function (identifier, profile, done) {
        log.info('profile identifier: ' + identifier)
        profile = profile || {}
        profile.identifier = identifier
        done(null, profile)
      })
    )

    log.debug('setting passport routes')

    var passport_auth = passport.authenticate('google', { successRedirect: '/login-success.html' , failureRedirect: '/login-err.html' })
    app.get('/auth/google/:return?', function (req, res) {
      req.session.google_email = req.param('openid.ext1.value.email')
      log.info('google return with email ' + req.param('openid.ext1.value.email'))
      passport_auth(req, res)
    })

    app.get('/auth/logout', function (req, res) {
      log.info('passport logout: ' + req.path)
      req.logout()
      res.redirect('/logged-out.html')
    })

    log.info('ITN passport config finished')
  }
}

