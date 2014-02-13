(function () {

  var express = require('express')

  var log = require('./lib/Logger.js')('gdsnApp', {debug: true})
  log.debug('DEBUG logging enabled')
  log.info('INFO logging enabled')

  var routes = require('./routes')
  for (var key in routes) {
    if (routes.hasOwnProperty(key)) log.info("Loaded route handler function: " + key)
  }

  var app = express()


  app.set('port', process.env.PORT || 9080)
  app.set('views', __dirname + '/views')
  app.set('view engine', 'ejs')

  // App Setup
  app.configure(function () {
    app.use(express.favicon(__dirname + '/public/favicon.ico'))
    app.use(express.logger('dev'))
    app.use(express.basicAuth(function (user, pass) {
      return 'admin' == user & 'devadmin' == pass
    }))
    //app.use(getCinPostHandler({ test: true }))
    //app.use(express.bodyParser())
    app.use(express.methodOverride())
    app.use(express.cookieParser('your secret here'))
    app.use(express.session())
    app.use(app.router)
    app.use(express.static(__dirname + '/public'))
    app.use(express.directory(__dirname + '/public'))
    app.use(customErrorHandler)
  })

  app.configure('development', function () {
    log.info('Configuring development environment...')
    app.use(express.errorHandler({showStack: true, dumpExceptions: true}))
  })

  app.get('/err', function (req, res, next) {
    next(new Error('this is a test error'))
  })

  app.get('/api', function (req, res) {
    res.json({ 
      gdsn_rest_api_version: "0.0.3"
      , ts: Date.now()
      , api_docs: {
          endpoints: [
                '/api'
              , '/err'
              , '/snoop'
              , '/api/msg_out'
              , '/api/msg_out/:msg_id'
          ]
      }
    })
  })

  // admin ui api route and default auth response test
  app.get('/admin/data.json', function (req, res, next) {

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
  })

  // list sent messages
  app.get('/api/msg_out', routes.list_messages)
  // get xml for specific sent message
  app.get('/api/msg_out/:msg_id', routes.find_message)

  // CIN upload form
  app.get('/cin', routes.view_cin_upload_form)
  // CIN upload POST submit processing
  app.post('/cin', routes.post_cin_upload_form)

  // view archive item details 
  app.get('/api/archive/:archive_id', routes.find_archive)
  // view list of all archived items
  app.get('/api/archive', routes.list_archive)
  // archive arbitrary POST auto-detecting type
  app.post('/api/archive', routes.post_archive)

  // default snoop home page
  app.get('/snoop', routes.getSnoopHandler())

  app.post('/post-cin', getCinPostHandler({ test: true }))

  // example of simple handler with embedded routing
  function getCinPostHandler(options) {
    options = options || {}
    return function (req, res, next) {
      if ('/post-cin' != req.url) {
        return next()
      }
      var buf = ''
      req.setEncoding('utf8')
      req.on('data', function (chunk) {
        buf += chunk
      })
      req.on('end', function () {
        log.info('Received POST content: ' + buf)
      })
      res.end('Received POST content: ' + buf)
    }
  }

  function customErrorHandler(err, req, res, next) {
    if (!err) next()
    log.error(err.stack)
    res.send(500, '<h2>Application Error</h2><pre>' + err.stack + '</pre>')
  }

  process.on('SIGINT', function () {
    console.log('Application shutting down...')
    setTimeout(function () {
      console.log('shutdown complete!')
      process.exit(0)
    }, 1500) // simulate shutdown activities for 1.5 seconds
  })

  app.listen(app.get('port'), process.env.IP)
  log.info("Express GDSN server listening on port " + app.get('port'))

  // Proof-of-concept: Inbox filesystem watcher
  //  var inboxDir = __dirname + '/msg/inbox/'
  //  var fs = require('fs')
  //  log.info("Inbox dir: " + inboxDir)
  //  fs.watch(
  //      inboxDir, 
  //      function (event, filename) {
  //          log.info('event is: ' + event + ' for filename ' + filename)
  //          if (filename && event == 'change')
  //          {
  //              fs.stat(filename, function (err, stats) {
  //                  if (err) return
  //                  log.info('stats: ' + JSON.stringify(stats))
  //              })
  //          }
  //      }
  //  )

})()
