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
var routes_subscr  = require('./routes/items_subscribed')(config)
var routes_parties = require('./routes/parties')(config)

var app = express()

app.set('views', __dirname + '/views')
app.set('view engine', 'ejs')

// App Setup
app.locals({test: true})

app.use(express.favicon(__dirname + '/public/favicon.ico'))
app.use(express.logger('dev'))
app.use(config.base_url, express.basicAuth(function (user, pass) {
  console.log('********************************************************************************** checking auth info for user: ' + user)
  if ('admin' == user & 'devadmin' == pass) return true
  if (pass == user + 'Admin') {
    return true
  }
  return false
}))
app.use(express.urlencoded())
app.use(express.cookieParser('secret cookie salt 12345'))
//app.use(express.session())
app.use('/', function logout(req, res, next) {
  if (req.param.logout) {
    req.user = ''
  }
  next()
})
app.use(config.base_url, profileLoader)

app.use(config.base_url, function (req, res, next) {
  var path = config.base_url + req.path
  log.debug('checking path for config: ' + path)
  try {
    var configured = false
    var urls = config.user_config[req.user].urls
    urls.forEach(function (url) {
      if (!configured) {
        log.debug('checking path against configured url prefix: ' + url)
        configured = (path.indexOf(url) == 0)
      }
    })
    if (configured) return next()
    res.end({msg: 'path ' + path + ' not configured for client ' + req.user})
  }
  catch (e) {
    log.warn('skipping path configuration check: ' + e)
  }
  next()
})
app.use(config.base_url + '/profile', function (req, res, next) { // echo server client profile for current user
  res.json(config.user_config[req.user] || {})
})
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

// testing async utilties for batching functions
var async = require('./lib/async')

app.get('/async-parallel-test', function (req, res, next) {
  async.test('p', function(err, result) {
    var combined = {
      err: err && err.length ? err.map(function (e) { return { message: e.message }}) : null,
      result: result
    }
    res.json(combined)
    res.end()
  })
})

app.get('/async-serial-test', function (req, res, next) {
  async.test('s', function(err, result) {
    if (err) return next(err)
    res.json(result)
    res.end()
  })
})

app.get('/async-waterfall-test', function (req, res, next) {
  async.test('w', function(err, result) {
    if (err) return next(err)
    res.json(result)
    res.end()
  })
})

// testing xml canonicalization...
app.post('/c14', routes.getXmlC14Handler(config))

app.get('/admin/data.json', routes_admin.data) // used by /admin UI only

// full-page CIN upload form and submit POST submit processing
app.get('/cin_from_other_dp', routes_cin.view_cin_from_other_dp_upload_form)
app.post('/cin_from_other_dp', express.multipart(), routes_cin.post_cin_from_other_dp_upload_form)

// documented 1.0 api endpoints
app.use(config.base_url, app.router)
app.get( '/', function (req, res, next) { res.render('api_docs_10') })

app.get( '/util/archive_items', function(req, res, next) {
  config.database.archive_items(function(result) {
    res.end(result)
  })
})

app.get( '/msg/:instance_id',                             routes_archive.find_archive)
app.get( '/msg',                                          routes_archive.list_archive)
app.post('/msg',                                          routes_archive.post_archive)

app.get( '/subscribed/:gtin/:provider/:tm/:tm_sub',       routes_subscr.get_subscribed_item)
app.get( '/subscribed/:gtin/:provider/:tm',               routes_subscr.get_subscribed_item)
app.get( '/subscribed/:gtin/:provider',                   routes_subscr.get_subscribed_item)
app.get( '/subscribed/:gtin',                             routes_subscr.get_subscribed_item)
app.get( '/subscribed/',                                  routes_subscr.get_subscribed_item)
app.get( '/subscribed', function (req, res, next) { res.render('subscribed_api_docs_10') })

app.get( '/items/:recipient/:gtin/:provider/:tm/:tm_sub', routes_item.find_trade_items)
app.get( '/items/:recipient/:gtin/:provider/:tm',         routes_item.find_trade_items)
app.get( '/items/:recipient/:gtin/:provider',             routes_item.find_trade_items)
app.get( '/items/:recipient/:gtin',                       routes_item.find_trade_items)
app.get( '/items/:recipient',                             routes_item.find_trade_items)
app.get( '/items/',                                       routes_item.find_trade_items)

app.get( '/items',                                        routes_item.list_trade_items)
app.post('/items',                                        routes_item.post_trade_items)

app.get( '/party/:gln',                                   routes_parties.find_parties)
app.get( '/parties',                                      routes_parties.list_parties)
app.post('/parties',                                      routes_parties.post_parties)

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
  };
  var server = https.createServer(https_options, app)
  server.listen(config.https_port)
  log.info("Express GDSN server listening on HTTPS port " + config.https_port)
}


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

function profileLoader(req, res, next) { // load profile
  if (!req.user) return next(new Error('must be logged in'))

  var user_config = config.user_config[req.user]

  if (user_config) {
    log.debug('found existing user_config for user ' + req.user)
    return next()
  }

  log.info('loading config')
  var filename = __dirname + '/profiles/' + req.user + '.config'
  try {
    log.info('loading user_config for user ' + req.user + ', file: ' + filename)
    user_config = require(filename)
    user_config.user = req.user
    config.user_config[req.user] = user_config
  }
  catch (e) {
    log.warn('error loading profile "' + filename + '": ' + e)
  }
  next()
}
