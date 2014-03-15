/*
 * Welcome to gdsn server devlopment on node.js!
 *
 * The project has the following source locations:
 *
 *  app.js (this file)
 *  lib/
 *  routes/
 *  node_modules/gdsn/
 *
 *  SVN: $URL: $
 */
var config  = require('./config.js')

var express = require('express')
var fs      = require('fs');
var https   = require('https');

var log = require('./lib/Logger')('gdsnApp', config)
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
var routes_parties = require('./routes/parties')(config)

var app = express()

//app.set('port', config.http_port)
app.set('views', __dirname + '/views')
app.set('view engine', 'ejs')

// App Setup
app.locals({test: true})

app.use(express.favicon(__dirname + '/public/favicon.ico'))
app.use(express.logger('dev'))
app.use(express.basicAuth(function (user, pass) {
  if ('admin' == user & 'devadmin' == pass) return true
  if (pass == user + 'Admin') return true
  return false
}))
app.use(express.urlencoded())
app.use(express.cookieParser('secret cookie salt 12345'))
app.use(express.session())
app.use('/', function (req, res, next) {
  if (req.path != '/') return next()
  res.redirect('/index.html')
})
app.get('/err', function (req, res, next) {
  next(new Error('this is a test error'))
})
app.use('/snoop', routes.getSnoopHandler(10))
app.use(express.static(__dirname + '/public'))
app.use(express.directory(__dirname + '/public'))

// custom error handler
app.use(function (err, req, res, next) {
  if (!err) next()
  log.error(err.stack)
  res.status(500).format({
    html: function () {
      res.send('<h2>Application Error</h2><pre>' + err.stack + '</pre>')
    }
    , xml: function () {
      res.send('<errorStack>' + err.stack + '</errorStack>')
    }
    , json: function () {
      res.send(err.stack)
    }
  })
})


// testing xml canonicalization...
app.post('/c14', routes.getXmlC14Handler(config))

app.get('/admin/data.json', routes_admin.data) // used by /admin UI only

// full-page CIN upload form and submit POST submit processing
app.get('/cin_from_other_dp', routes_cin.view_cin_from_other_dp_upload_form)
app.post('/cin_from_other_dp', express.multipart(), routes_cin.post_cin_from_other_dp_upload_form)

// documented 1.0 api endpoints
app.use( '/api/1.0', app.router)
app.get( '/', function (req, res, next) { res.render('api_docs_10') })

app.get( '/msg/:instance_id',                            routes_archive.find_archive)
app.get( '/msg',                                         routes_archive.list_archive)
app.post('/msg',                                         routes_archive.post_archive)

app.get( '/items/:gtin/:provider/:tm/:recipient/:tmsub', routes_item.find_trade_item)
app.get( '/items/:gtin/:provider/:tm/:recipient',        routes_item.find_trade_item)
app.get( '/items/:gtin/:provider/:tm',                   routes_item.find_trade_item)
app.get( '/items/:gtin/:provider',                       routes_item.find_trade_item)
app.get( '/items/:gtin',                                 routes_item.find_trade_item)
app.get( '/json/items/:gtin',                            routes_item.find_trade_item)

app.get( '/items',                                       routes_item.list_trade_items)
app.post('/items',                                       routes_item.post_trade_items)

app.get( '/party/:gln',                                  routes_parties.find_parties)
app.get( '/parties',                                     routes_parties.list_parties)
app.post('/parties',                                     routes_parties.post_parties)

process.on('SIGINT', function () {
  console.log('Application shutting down...')
  setTimeout(function () {
    console.log('shutdown complete!')
    process.exit(0)
  }, 500) // simulate shutdown activities for .5 seconds
})

// start the server using normal HTTP
//app.listen(config.http_port) // non SSL

// start the server using SSL
var https_options = {
  key   : fs.readFileSync(config.key_file),
  cert  : fs.readFileSync(config.cert_file)
};
var server = https.createServer(https_options, app)
server.listen(config.https_port)

log.info("Express GDSN server listening on port " + config.https_port)

// Inbox filesystem watcher
log.info("Inbox dir: " + config.inbox_dir)
fs.watch(config.inbox_dir, function (event, filename) {
  log.info('event is: ' + event + ' for filename ' + filename)
  if (filename && event == 'change') {
    fs.stat(filename, function (err, stats) {
      if (err) return console.log('err: ' + err)
      log.info('stats: ' + JSON.stringify(stats))
    })
  }
})
