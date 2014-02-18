(function () {

  var opts = require('./options.json')
  var express = require('express')

  var log = require('./lib/Logger.js')('gdsnApp', {debug: true})
  log.debug('DEBUG logging enabled')
  log.info('INFO logging enabled')

  var Gdsn = require('gdsn')
  var gdsn = new Gdsn(opts)

  var Database = require('./lib/Database')
  var database = new Database(opts)
  //config.url = 'gdsn'
  //config.url = 'data_pool_user:data_pool@plt-elas01.itradenetwork.com'
  //config.url = 'toneill:toneill@plt-elas01.itradenetwork.com'
  // works!:
  //var database = require('./lib/Database')({ db_url: 'mongodb://plt-elas01.itradenetwork.com'})

  var routes = require('./routes')

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
    //app.use(express.bodyParser()) // this breaks direct POSTing by reading the body but is needed for multipart file upload
    app.use(express.cookieParser('secret cookie salt 12345'))
    app.use(express.session())
    app.use('/', function (req, res, next) {
      if (req.path != '/') return next()
      res.redirect('/index.html')
    })
    app.use('/api/1.0', app.router)
    app.use(app.router)
    app.use('/snoop', routes.getSnoopHandler(10))
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

  app.get('/', function (req, res) {
    res.json({ 
      gdsn_rest_api_version: "1.0"
      , ts: Date.now()
      , api_docs: {
          endpoints: [
                '/api/1.0'
              , '/api/1.0/err'
              , '/api/1.0/msg_out'
              , '/api/1.0/msg_out/:msg_id'
          ]
      }
    })
  })

  // admin ui api route and default auth response test
  app.get('/admin/data.json', require('./routes/admin.js'))

  app.get('/archive/:archive_id', routes.find_archive(gdsn, database))
  app.get('/archive', routes.list_archive(gdsn, database))
  app.post('/archive', routes.post_archive(gdsn, database))

  app.get('/items/:item_id', routes.find_trade_item(gdsn, database))
  app.get('/items', routes.list_trade_items(gdsn, database))
  app.post('/items', routes.post_trade_items(gdsn, database))

  // CIN upload form and submit POST submit processing
  var cin_form_routes = require('./routes/cin_form')
  app.get('/cin_from_other_dp', cin_form_routes.view_cin_from_other_dp_upload_form)
  // not working without bodyParser:
  app.post('/cin_from_other_dp', cin_form_routes.post_cin_from_other_dp_upload_form(gdsn, database))

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
    }, 500) // simulate shutdown activities for .5 seconds
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
