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
      done(null, { identifier: id })
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

    app.get('/auth/google/:return?',
      passport.authenticate('google', { 
        successRedirect: '/index.html' 
        , failureRedirect: '/login-err.html' 
      })
    )
    app.get('/auth/logout', function (req, res) {
      log.info('passport logout: ' + req.path)
      req.logout()
      res.redirect('/logged-out.html')
    })

    log.info('ITN passport config finished')
  }
}

