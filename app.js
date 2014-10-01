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

console.log('start app.js')

var config  = require('./config.js')
config.user_config     = {}
config.request_counter = 0

var express         = require('express')
var logger          = require('morgan')
var basic_auth      = require('basic-auth')
var compression     = require('compression')
var session         = require('cookie-session')

var fs      = require('fs')
var https   = require('https')

var Logger = require('./lib/Logger')
var log = Logger('gdsnApp', config)
log.debug('DEBUG logging enabled')
log.info('INFO logging enabled')
log.debug('config: ' + JSON.stringify(config))

var Gdsn = require('gdsn')
config.gdsn = new Gdsn(config)

require('./lib/db/Database')(config) // adds config.database

//var routes          = require(config.routes_dir + '/index')
//var routes_cin      = require(config.routes_dir + '/cin_form')(config)
var routes_subscr   = require(config.routes_dir + '/items_subscribed')(config)
var routes_login    = require(config.routes_dir + '/login')
var routes_archive  = require(config.routes_dir + '/msg_archive')(config)
var routes_parties  = require(config.routes_dir + '/parties')(config)
var routes_logs     = require(config.routes_dir + '/logs')(config)
var routes_item     = require(config.routes_dir + '/trade_item')(config)
var routes_profile  = require(config.routes_dir + '/profile')(config)

var app = express()

app.set('views', __dirname + '/views')
app.set('view engine', 'ejs')

app.use(logger('combined'))
app.use(express.static(__dirname + '/public'))

app.use(compression())

app.use(session({
  keys: ['secret135', 'secret258']
  , secureProxy: true
}))


// Passport auth: 
log.info('Loading ITN Passport...')
var passport = require('./lib/passport')
passport.init(app, Logger('pp_log', config))

var router = express.Router()
app.use(config.base_url, router)

console.log('setting up basic_auth')
router.use(function (req, res, next) {
  console.log('req.user: ' + JSON.stringify(req.user))

  var credentials = basic_auth(req)
  console.log('creds: ' + JSON.stringify(credentials))

  if (req.user && req.user.google_token) {
     req.user = 'ted'
     return next()
  }

  if (!credentials || (credentials.name + 'Admin' !== credentials.pass)) {
    res.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="Authorization Required"'
    })
    return res.end()
  }
  req.user = credentials.name
  console.log('req.user: ' + JSON.stringify(req.user))
  next()
})
console.log('done setting up basic_auth')

console.log('setting up profile loader and checker')
router.use(routes_profile.profileLoader)
router.use(routes_profile.profileChecker)
console.log('done setting up profile loader and checker')

console.log('setting up shutdown')
app.get('/shut_down', function (req, res, next) {
  if (req.query.pw === config.shut_down_pw) {
    console.log('Server is process is exiting down via shut_down endpoint...')
    process.exit(0)
  }
  next(new Error('incorrect shut_down parameter'))
})
console.log('done setting up shutdown')

router.post('/msg',     routes_archive.post_archive)
router.post('/items',   routes_item.post_trade_items)
router.post('/parties', routes_parties.post_parties)

router.get('/msg/:instance_id',                             routes_archive.find_archive)
router.get('/msg',                                          routes_archive.list_archive)

router.get('/subscribed/:gtin/:provider/:tm/:tm_sub',       routes_subscr.get_subscribed_item)
router.get('/subscribed/:gtin/:provider/:tm',               routes_subscr.get_subscribed_item)
router.get('/subscribed/:gtin/:provider',                   routes_subscr.get_subscribed_item)
router.get('/subscribed/:gtin',                             routes_subscr.get_subscribed_item)
router.get('/subscribed/',                                  routes_subscr.get_subscribed_item)
router.get('/subscribed', function (req, res, next) { res.render('subscribed_api_docs_10') })

router.get('/items-list',                                   routes_item.list_trade_items)
router.get('/items/migrate',                                routes_item.migrate_trade_items)
router.get('/items/:recipient/:gtin/:provider/:tm/:tm_sub', routes_item.get_trade_item) // return exact item with optional children
router.get('/items/:recipient/:gtin/:provider/:tm',         routes_item.find_trade_items)
router.get('/items/:recipient/:gtin/:provider',             routes_item.find_trade_items)
router.get('/items/:recipient/:gtin',                       routes_item.find_trade_items)
router.get('/items/:recipient',                             routes_item.find_trade_items)
router.get('/items',                                        routes_item.find_trade_items)

router.get('/party/:gln',                                   routes_parties.find_parties)
router.get('/parties/:gln',                                 routes_parties.find_parties)
router.get('/parties',                                      routes_parties.list_parties)

router.get('/info',                                         routes_item.post_get_item_info)
router.get('/logs',                                         routes_logs.list_logs)

router.get('/login',            require(config.routes_dir + '/login').getRequestHandler(config))
router.get('/lookup_allergens', require(config.routes_dir + '/lookup_allergens').getRequestHandler(config))
router.get('/lookup_countries', require(config.routes_dir + '/lookup_countries').getRequestHandler(config))
router.get('/lookup_nutrients', require(config.routes_dir + '/lookup_nutrients').getRequestHandler(config))

console.log('done setting up routes')

// shutdown processing
process.on('SIGINT', function () {
  console.log('Application shutting down...')
  setTimeout(function () {
    console.log('shutdown complete!')
    process.exit(0)
  }, 500) // simulate shutdown activities for .5 seconds
})
console.log('done setting up SIGINT')

// start the server using normal HTTP
if (config.http_port) {
  app.listen(config.http_port)
  log.info("Express GDSN server listening on HTTP port " + config.http_port)
}
console.log('done setting up http server')

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

