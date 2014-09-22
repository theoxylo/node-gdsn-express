module.exports = Database

var mongojs = require('mongojs')
var Logger  = require('./Logger.js')

var log // singleton if there are multiple instances

function Database(config) {

  if (!(this instanceof Database)) return new Database(config)

  this.request_counter = 0

  this.config = config || {debug: true}
  if (!log) log = Logger('database', this.config)
  log.debug(config)

  if (!this.config.slow_warn_ms) this.config.slow_warn_ms = 100

  if (!this.config.db_url) throw new Error('db_url is required')
  log.debug('db_url: ' + this.config.db_url)

  this.mdb = mongojs(this.config.db_url, ['msg_archive', 'trade_items', 'parties', 'logs'])

  //this.mdb.on('error', function (err) { log.err(err) })

  this.mdb.trade_items.ensureIndex({unit_type: 1})
  this.mdb.trade_items.ensureIndex({gtin: 1})
  this.mdb.trade_items.ensureIndex({child_gtins: 1})
  this.mdb.trade_items.ensureIndex({provider: 1})
  this.mdb.trade_items.ensureIndex({recipient: 1})
  this.mdb.trade_items.ensureIndex({tm: 1})
  this.mdb.trade_items.ensureIndex({tm_sub: 1})
  this.mdb.trade_items.ensureIndex({archived_ts: -1})
  this.mdb.trade_items.ensureIndex({modified_ts: -1})
  this.mdb.trade_items.ensureIndex({msg_id: 1})

  this.mdb.trade_items.ensureIndex({modified_ts: -1, archived_ts: -1})
  this.mdb.trade_items.ensureIndex({gtin: 1, modified_ts: -1, archived_ts: -1})
  this.mdb.trade_items.ensureIndex({recipient: 1, gtin: 1, provider: 1, tm: 1, tm_sub: 1, modified_ts: -1, archived_ts: -1})

  this.mdb.msg_archive.ensureIndex({instance_id: 1, modified_ts: -1})

  this.mdb.parties.ensureIndex({modified_ts: -1})
  this.mdb.parties.ensureIndex({name: 1, modified_ts: -1})
  this.mdb.parties.ensureIndex({gln: 1}, {unique: true})

  log.info('connected to mongo db instance')
  for (var key in this.mdb) {
    if (this.mdb.hasOwnProperty(key) && this.mdb[key] && !this.mdb[key].apply) {
      log.info(key + ': ' + this.mdb[key])
    }
  }
}

