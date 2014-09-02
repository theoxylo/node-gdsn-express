/*
 * Welcome to Catalog Services API development on Node.js!
 *
 * The project has the following source locations:
 *  app.js (this file)
 *  lib/
 *  profiles/
 *  routes/
 *  node_modules/gdsn/
 *
 * Client-side code and files are found here:
 *  public/
 *  public/js
 *
 * SVN Tag: $URL: $
 */

var config  = require('./config.js')
config.user_config = {}

var express = require('express')
var fs      = require('fs')
var https   = require('https')

var log = require('./lib/Logger')('gdsnApp', config)
log.debug('DEBUG logging enabled')
log.info('INFO logging enabled')

log.debug('config: ' + JSON.stringify(config))

var Gdsn = require('./lib/gdsn')
config.gdsn = new Gdsn(config)

var Database = require('./lib/Database')
config.database = new Database(config)

//var routes          = require(config.routes_dir + '/index')
//var routes_cin      = require(config.routes_dir + '/cin_form')(config)
var routes_subscr   = require(config.routes_dir + '/items_subscribed')(config)
var routes_login    = require(config.routes_dir + '/login')
//var routes_allergen = require(config.routes_dir + '/lookup_allergen')
//var routes_country  = require(config.routes_dir + '/lookup_country')
//var routes_nutrient = require(config.routes_dir + '/lookup_nutrient')
var routes_archive  = require(config.routes_dir + '/msg_archive')(config)
var routes_parties  = require(config.routes_dir + '/parties')(config)
var routes_logs     = require(config.routes_dir + '/logs')(config)
var routes_item     = require(config.routes_dir + '/trade_item')(config)
var routes_profile  = require(config.routes_dir + '/profile')(config)

var app = express()

app.set('views', __dirname + '/views')
app.set('view engine', 'ejs')

// App Setup
app.locals({test: true})

app.use(express.favicon(__dirname + '/public/favicon.ico'))
app.use(express.logger())

// redirect to home page start
app.use('/', function (req, res, next) {

  log.info(
    'user ' 
    + req.user ? req.user : 'n/a'
    + ' passed profile loading and checking for req ' 
    + req.query && req.query.req_id ? req.query.req_id : 'n/a'
  )

  if (req.path == '/') return res.redirect('/index.html#start')
  next()

})

app.get(config.base_url + '/login',           routes_login.getRequestHandler(config))

app.use(config.base_url, express.basicAuth(function (user, pass) {
  log.info('_CHECKING AUTH INFO_ for user: ' + user)
  if ('admin' == user & 'devadmin' == pass) return true
  if (pass == user + 'Admin') {
    return true
  }
  return false
}))

//app.use(express.urlencoded())

//app.use(express.cookieParser('secret cookie salt 12345'))

app.use(config.base_url, routes_profile.profileLoader)

app.use(config.base_url, routes_profile.profileChecker)

app.get('/shut_down', function (req, res, next) {
  if (req.query.pw === config.shut_down_pw) {
    console.log('Server is process is exiting down via shut_down endpoint...')
    process.exit(0)
  }
  next(new Error('incorrect shut_down parameter'))
})

app.use(express.static(__dirname + '/public'))

//app.use(express.directory(__dirname + '/public'))

// documented 1.0 api endpoints
app.use(config.base_url, app.router)

app.get( '/msg/:instance_id',                             routes_archive.find_archive)
app.get( '/msg',                                          routes_archive.list_archive)
app.post('/msg',                                          routes_archive.post_archive)

app.get( '/subscribed/:gtin/:provider/:tm/:tm_sub',       routes_subscr.get_subscribed_item)
app.get( '/subscribed/:gtin/:provider/:tm',               routes_subscr.get_subscribed_item)
app.get( '/subscribed/:gtin/:provider',                   routes_subscr.get_subscribed_item)
app.get( '/subscribed/:gtin',                             routes_subscr.get_subscribed_item)
app.get( '/subscribed/',                                  routes_subscr.get_subscribed_item)
app.get( '/subscribed', function (req, res, next) { res.render('subscribed_api_docs_10') })

app.get( '/items-list',                                   routes_item.list_trade_items)
app.get( '/items/migrate',                                routes_item.migrate_trade_items)
app.get( '/items/:recipient/:gtin/:provider/:tm/:tm_sub', routes_item.get_trade_item) // return exact item with optional children
app.get( '/items/:recipient/:gtin/:provider/:tm',         routes_item.find_trade_items)
app.get( '/items/:recipient/:gtin/:provider',             routes_item.find_trade_items)
app.get( '/items/:recipient/:gtin',                       routes_item.find_trade_items)
app.get( '/items/:recipient',                             routes_item.find_trade_items)
app.get( '/items',                                        routes_item.find_trade_items)
app.post('/items',                                        routes_item.post_trade_items)

app.get( '/party/:gln',                                   routes_parties.find_parties)
app.get( '/parties/:gln',                                 routes_parties.find_parties)
app.get( '/parties',                                      routes_parties.list_parties)
app.post('/parties',                                      routes_parties.post_parties)

app.get( '/logs',                                         routes_logs.list_logs)

process.on('SIGINT', function () {
  console.log('Application shutting down...')
  setTimeout(function () {
    console.log('shutdown complete!')
    process.exit(0)
  }, 500) // simulate shutdown activities for .5 seconds
})

// start the server using normal HTTP
if (config.http_port) {
  app.listen(config.http_port)
  log.info("Express GDSN server listening on HTTP port " + config.http_port)
}

// start the server using SSL
if (config.https_port) {
  var https_options = {
    key   : fs.readFileSync(config.key_file),
    cert  : fs.readFileSync(config.cert_file)
  }
  var server = https.createServer(https_options, app)
  server.listen(config.https_port)
  log.info("Express GDSN server listening on HTTPS port " + config.https_port)
}

