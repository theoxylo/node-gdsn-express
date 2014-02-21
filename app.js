var config = require('./config.js')
var express = require('express')

var log = require('./lib/Logger.js')('gdsnApp', config)
log.debug('DEBUG logging enabled')
log.info('INFO logging enabled')

var Gdsn = require('gdsn')
config.gdsn = new Gdsn(config)

var Database = require('./lib/Database')
config.database = new Database(config)

var routes         = require('./routes')
var routes_admin   = require('./routes/admin')
var routes_cin     = require('./routes/cin_form')(config)
var routes_archive = require('./routes/msg_archive')(config)
var routes_item    = require('./routes/trade_item')(config)

var app = express()

app.set('port', process.env.PORT || 9080)
app.set('views', __dirname + '/views')
app.set('view engine', 'ejs')

// App Setup
app.configure(function () {
  app.use(express.favicon(__dirname + '/public/favicon.ico'))
  app.use(express.logger('dev'))
  app.use(express.basicAuth(function (user, pass) {
    if ('admin' == user & 'devadmin' == pass) return true
    if (user == pass + 'Admin') return true
    return false
  }))
  app.use(express.urlencoded())
  app.use(express.cookieParser('secret cookie salt 12345'))
  app.use(express.session())
  app.use('/', function (req, res, next) {
    if (req.path != '/') return next()
    res.redirect('/index.html')
  })
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

// test error
app.get('/err', function (req, res, next) {
  next(new Error('this is a test error'))
})

app.get('/admin/data.json', routes_admin.data) // used by /admin UI only

app.get( '/api/1.0/archive/:instance_id', routes_archive.find_archive)
app.get( '/api/1.0/archive',              routes_archive.list_archive)
app.post('/api/1.0/archive',              routes_archive.post_archive)

app.get( '/api/1.0/items/:gtin/:provider/:tm/:recipient/:tmsub', routes_item.find_trade_item)
app.get( '/api/1.0/items/:gtin/:provider/:tm/:recipient',        routes_item.find_trade_item)
app.get( '/api/1.0/items/:gtin/:provider/:tm',                   routes_item.find_trade_item)
app.get( '/api/1.0/items/:gtin/:provider',                       routes_item.find_trade_item)
app.get( '/api/1.0/items/:gtin',                                 routes_item.find_trade_item)

app.get( '/api/1.0/json/items/:gtin',                            routes_item.find_trade_item)

app.get( '/api/1.0/items',                                       routes_item.list_trade_items)
app.post('/api/1.0/items',                                       routes_item.post_trade_items)

// full-page CIN upload form and submit POST submit processing
app.get('/cin_from_other_dp', routes_cin.view_cin_from_other_dp_upload_form)
app.post('/cin_from_other_dp', express.multipart(), routes_cin.post_cin_from_other_dp_upload_form)

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
