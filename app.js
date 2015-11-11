/*
 * Welcome to Catalog Services API Server!
 *
 * The project has the following source locations:
 *  app.js (this file)
 *  lib/
 *  profiles/
 *  routes/
 *
 * NPM modules are in the usual place, e.g.
 *  node_modules/gdsn/index.js
 *
 * Client-side code and files are found here:
 *  public/
 *  public/js
 *
 * SVN Tag: $URL: $
 */
console.log('start app.js at ' + new Date)

var config  = require('./config.js')
config.user_config     = {}
config.request_counter = 0

var express         = require('express')
var logger          = require('morgan')
var compression     = require('compression')
//var session         = require('cookie-session')

var fs      = require('fs')

var Logger = require('./lib/Logger')
var log = Logger('gdsnApp', config)
log.debug('DEBUG logging enabled')
log.info('INFO logging enabled')
log.debug('config: ' + config) // use config.toString impl

var Gdsn = require('gdsn')
config.gdsn = new Gdsn(config)

require('./lib/db/database.js').init(config) // adds config.database

//var routes          = require(config.routes_dir + '/index.js')
//var routes_cin      = require(config.routes_dir + '/cin_form.js')(config)
var routes_subscr   = require(config.routes_dir + '/items_subscribed.js')(config)
var routes_login    = require(config.routes_dir + '/login.js')(config)
var routes_msg_mig  = require(config.routes_dir + '/msg_migrate.js')(config)
var routes_parties  = require(config.routes_dir + '/parties.js')(config)
var routes_logs     = require(config.routes_dir + '/logs.js')(config)
var routes_item     = require(config.routes_dir + '/trade_item.js')(config)
var routes_profile  = require(config.routes_dir + '/profile.js')(config)
var routes_gdsn_wf  = require(config.routes_dir + '/gdsn_workflow.js')(config)
var routes_gdsn_cin = require(config.routes_dir + '/gdsn_create_cin.js')(config)
var routes_hierarchy= require(config.routes_dir + '/validate_hierarchy.js')(config)
var routes_gdsn     = require(config.routes_dir + '/gdsn_send.js')(config)
var routes_xsd      = require(config.routes_dir + '/gdsn_xsd.js')(config)
var routes_msg      = require(config.routes_dir + '/msg_archive.js')(config)
var routes_auto     = require(config.routes_dir + '/auto_gdsn.js')(config)
var routes_publish  = require(config.routes_dir + '/gdsn_publish.js')(config)
var routes_register = require(config.routes_dir + '/mds_register.js')(config)
var test_promise    = require(config.routes_dir + '/test_promise.js')(config)
var app = express()
config.app = app

app.set('views', __dirname + '/views')
app.set('view engine', 'ejs')

app.use(compression())
app.use(require('serve-favicon')(__dirname + '/public/favicon.ico'))
app.use(express.static(__dirname + '/public'))

// append response time to Http log, for Kibana
app.use(logger(logger.combined + ' - :response-time ms') )

/*
app.use(session({
  keys: ['secret135', 'secret258']
  , secureProxy: true
}))
*/

log.info('Loading ITN Passport google OAuth2 connector...')
require('./lib/passport').init(config)


//app.use('/snoop', function (req, res, next) { res.render('snoop') }) // views/snoop.ejs

// api doc renders - ejs examples
app.get('/docs' + config.base_url + '/parties',    function (req, res, next) { res.render('parties_api_docs_10')   })
app.get('/docs' + config.base_url + '/items',      function (req, res, next) { res.render('items_api_docs_10')     })
app.get('/docs' + config.base_url + '/login',      function (req, res, next) { res.render('login_api_docs_10')     })
app.get('/docs' + config.base_url + '/subscribed', function (req, res, next) { res.render('subscribed_api_docs_10')})

// api endpoint routing
var router = express.Router()
app.use(config.base_url, router)

log.info('setting up basic_auth')
var basic_auth = require('basic-auth')

router.use(function authorizeRequest(req, res, next) {
  log.info('req.user: ' + JSON.stringify(req.user))

  var credentials = basic_auth(req)
  log.info('creds: ' + JSON.stringify(credentials))

  /*
  var session = req.session
  log.info('session: ' + JSON.stringify(session))

  if (req.user && req.user.google_token) {
     req.user = 'ted'
     return next()
  }
  */

  if (!credentials || (credentials.name + 'Admin' !== credentials.pass)) {
    res.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="Authorization Required"'
    })
    return res.end()
  }
  req.user = credentials.name
  log.info('req.user: ' + JSON.stringify(req.user))
  next()
})
log.info('done setting up basic_auth')

log.info('setting up profile loader and checker')
router.use(routes_profile.profileLoader)
router.use(routes_profile.profileChecker)
log.info('done setting up profile loader and checker')

log.info('setting up shutdown')
app.get('/shut_down', function (req, res, next) {
  if (req.query.pw === config.shut_down_pw) {
    log.info('Server is process is exiting down via shut_down endpoint...')
    process.exit(0)
  }
  next(Error('incorrect shut_down parameter'))
})
log.info('done setting up shutdown ' + config.shut_down_pw)

log.info('setting up routes and URL templates')

// POST json
router.post('/publish/:provider',            routes_publish.publish) // JSON {"gln":["123"],gtin:["456"]}
router.post('/validate_register/:provider',  routes_register.register_existing_items) // JSON

router.get( '/validate_register/:provider/:gtin/:tm/:tm_sub',  routes_register.register_existing_item) // GET for single item/hierarchy
router.get( '/validate_register/:provider/:gtin/:tm'        ,  routes_register.register_existing_item) // default tm_sub 'na'

// POST xml
router.post('/gdsn-auto',                    routes_auto.process) // message persistence, validation, workflow, and response
router.post('/items',                        routes_item.post_trade_items) // used by eccnet / ECCnet client
router.post('/item',                         routes_msg.post_archive)
router.post('/msg',                          routes_msg.post_archive)
router.post('/persist',                      routes_msg.post_archive)
router.post('/save',                         routes_msg.post_archive)
router.post('/parties',                      routes_parties.post_parties) //

// GET /gdsn
router.get('/gdsn-send/:msg_id/:sender',     routes_gdsn.lookup_and_send)
router.get('/gdsn-send/:msg_id',             routes_gdsn.lookup_and_send)

router.post('/gdsn-validate',                routes_xsd.post_and_validate)
router.get('/gdsn-validate/:msg_id/:sender', routes_xsd.lookup_and_validate)
router.get('/gdsn-validate/:msg_id',         routes_xsd.lookup_and_validate)

router.get('/gdsn-workflow/:msg_id/:sender', routes_gdsn_wf.lookup_and_process)
router.get('/gdsn-workflow/:msg_id',         routes_gdsn_wf.lookup_and_process)

// fully qualified path for CIN generation, including recipient
// also accepts [rdp=gln] // recipientDataPool, msg receiver, defaults to recipient
//              [cmd=*ADD|CORRECT|CHANGE_BY_REFRESH|DELETE]
//              [reload=true|*false]
//              [doc=COPY|*ORIGINAL]
router.get('/gdsn-cin/:recipient/:gtin/:provider/:tm/:tm_sub', routes_gdsn_cin.create_cin)
router.get('/gdsn-cin/:recipient/:gtin/:provider/:tm'        , routes_gdsn_cin.create_cin) // default tm_sub is 'na'

// GET
router.get('/msg/history/:msg_id/:sender',   routes_msg.msg_history)
router.get('/msg/archive/:msg_id/:sender',   routes_msg.archive_msg)

router.get('/msg/migrate/:msg_id/:sender',   routes_msg_mig.reparse_msg)
router.get('/msg/migrate/:msg_id',           routes_msg_mig.reparse_msg)
//router.get('/msg-migrate',                   routes_msg_mig.migrate_msg_archive)

router.get('/msg/:msg_id/:sender',           routes_msg.find_archive)
router.get('/msg/:msg_id',                   routes_msg.find_archive)
router.get('/msg',                           routes_msg.list_archive)

router.get('/publish/:provider/:subscriber', routes_publish.get_publication_list) // active pubs for pub/sub pair
router.get('/publish/:provider',             routes_publish.get_publication_list) // all pubs for publisher gln
router.get('/publish',                       routes_publish.get_publication_list) // all pubs

router.get('/subscribed/:gtin/:provider/:tm/:tm_sub', routes_subscr.get_subscribed_item)
router.get('/subscribed/:gtin/:provider/:tm'        , routes_subscr.get_subscribed_item) // default tm_sub 'na' or any
router.get('/subscribed/:gtin/:provider'            , routes_subscr.get_subscribed_item) // default tm '840' or any
router.get('/subscribed/:gtin'                      , routes_subscr.get_subscribed_item)
router.get('/subscribed/'                           , routes_subscr.get_subscribed_item)

router.get('/items/history/:recipient/:gtin/:provider/:tm/:tm_sub', routes_item.get_trade_item_history)
router.get('/items/history/:recipient/:gtin/:provider/:tm'        , routes_item.get_trade_item_history) // default tm_sub 'na'

router.get('/items-list',                    routes_item.list_trade_items)
router.get('/items-migrate/:recipient',      routes_item.migrate_trade_items)
router.get('/items-migrate'           ,      routes_item.migrate_trade_items)

router.get('/items/:recipient/:gtin/:provider/:tm/:tm_sub',   routes_item.find_trade_items)
router.get('/items/:recipient/:gtin/:provider/:tm',           routes_item.find_trade_items)
router.get('/items/:recipient/:gtin/:provider',               routes_item.find_trade_items)
router.get('/items/:recipient/:gtin',                         routes_item.find_trade_items)
router.get('/items/:recipient',                               routes_item.find_trade_items)
router.get('/items',                                          routes_item.find_trade_items)

router.get('/party/:gln',                    routes_parties.find_parties)
router.get('/parties/:gln',                  routes_parties.find_parties)
router.get('/parties',                       routes_parties.list_parties)
router.get('/login',                         routes_login.authenticate)
router.get('/logs',                          routes_logs.list_logs)
router.get('/item_status/:provider/:gtin',   routes_item.get_gdsn_registered_items)
router.get('/item_status/:provider',         routes_item.get_gdsn_registered_items)

// validate service POST / GET, not yet used by MDS
router.get( '/test_promise'                       ,    test_promise.do_get) // Promises
router.get( '/get_cin/:provider/:gtin/:tm/:tm_sub',    routes_hierarchy.get_cin) // Promises
router.get( '/validate/:provider/:gtin/:tm/:tm_sub',   routes_hierarchy.validate_hierarchy) // Promises
router.post('/validate_multi/:provider',               routes_hierarchy.validate_hierarchies) // json list post

//var routes_validate_old = require(config.routes_dir + '/validate_temp_cin_OLD.js')(config)
//router.post('/post-validate',                          routes_validate_old.validate_trade_items) // xml post
//router.get( '/x_validate/:provider/:gtin/:tm/:tm_sub', routes_validate_old.validate_hierarchy)   // old version

log.info('done setting up routes')

// shutdown processing
process.on('SIGINT', function () {
  log.info('Application shutting down...')
  setTimeout(function () {
    log.info('shutdown complete!')
    process.exit(0)
  }, 500) // simulate shutdown activities for .5 seconds
})
log.info('done setting up SIGINT')


if (config.http_port) {
  try {
    log.info('Trying to listen at port: ' + config.http_port)
    //app.on('error', function (e) { console.log(e) })
    app.listen(config.http_port)
    log.info('Return: Express GDSN server listening at port: ' + config.http_port)
  }
  catch (e) {
    log.error(e)
    throw e
  }
}

// if configured, start the server using https/SSL
if (config.https_port) {
  var https_options = {
    key   : fs.readFileSync(config.key_file),
    cert  : fs.readFileSync(config.cert_file)
  }
  require('https').createServer(https_options, app).listen(config.https_port)
  log.info('Express GDSN server listening at https://' + config.https_host + ':' + config.https_port)
}

// mock GDSN Server outbox on local file system, good for export
app.use('/gdsn-server/api/outbox', (function (counter) {
  return function (req, res, next) {
    if (res.finished) return

    var content = ''
    req.setEncoding('utf8')
    req.on('data', function (chunk) {
      log.debug('archive_post_chunk.length: ' + (chunk && chunk.length))
      content += chunk
      if (content.length > 10 * 1024 * 1024 && !res.finished) res.end('content too big - larger than 10 MB')
    })
    req.on('end', function () {

      var filename = encodeURIComponent(req.query.filename || ('nofile_' + Date.now()))
      console.log('req.query string for dp-outbox target url: ' + filename)
      filename = config.outbox_dir + '/' + filename + '-' + (counter++) + '-' + (Date.now()) + '.xml'

      fs.writeFile(filename, content, function (err) {
        if (err) return next(err)
        console.log('wrote file: ' + filename + ' (' + Buffer.byteLength(content) + ' bytes)')
        if (!res.finished) {
          res.set('Content-Type', 'text/xml; charset=utf-8')
          res.send(content)
          res.end()
        }
      })
    })
    console.log('saving outbox messages to file ' + counter)
  }
}(100)))

// mock GDSN Server for gdsn API calls
app.use('/gdsn-server/api/', (function (counter) {
  return function (req, res, next) {
    res.json({
      success: 'true'
      ,status: '200'
      ,message: 'mock success'
      ,msg: 'short msg'
      ,counter: counter++
      ,rci_is_needed: true
      ,ts: Date.now()
      ,date_time: new Date()
    })
  }
}(100)))

// test for using filesystem inbox
fs.watch(config.inbox_dir, function (event, filename) {
  if (event == 'change') {
    console.log('fs.watch change: ' + filename || '<unnamed>')
    if (!filename) return

    var archive_file = config.inbox_dir + '-archive/' + filename + '.' + Date.now()
    filename = config.inbox_dir + '/' + filename

    console.log('readFile ' + filename)
    fs.readFile(filename, {encoding:'utf8'}, function (err, content) {
      if (err) return console.log(err)
      //console.log(content)
      if (content) try {
        var msg = config.gdsn.get_msg_info(content)
        delete msg.data
        delete msg.xml
        console.log('msg_info:::::::::::::::::::::: ' + msg)
        fs.rename(filename, archive_file, function (err) {
          if (err) {
            console.log('err archiving file ' + filename + ' to ' + archive_file)
            return console.log(err)
          }
          console.log('file processed and moved to archive: ' + archive_file)  
        })
      }
      catch (err) {
        console.log(err)
      }
    })
  }
})

process.on('uncaughtException', function (err) {
  console.log('uncaughtException event: ' + err);
  console.log(err.stack)
})

