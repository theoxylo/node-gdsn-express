module.exports = function (config) {

  var log     = require('../Logger.js')('db_mongo', config)
  config.slow_warn_ms = config.slow_warn_ms || 100
  log.debug(config)

  if (!config.db_url) throw new Error('config db_url is required')
  log.debug('config db_url: ' + config.db_url)

  var mdb = require('mongojs')(config.db_url, ['msg_archive', 'trade_items', 'parties', 'logs'])

  mdb.trade_items.ensureIndex({unit_type: 1})
  mdb.trade_items.ensureIndex({gtin: 1})
  mdb.trade_items.ensureIndex({child_gtins: 1})
  mdb.trade_items.ensureIndex({provider: 1})
  mdb.trade_items.ensureIndex({recipient: 1})
  mdb.trade_items.ensureIndex({tm: 1})
  mdb.trade_items.ensureIndex({tm_sub: 1})
  mdb.trade_items.ensureIndex({archived_ts: -1})
  mdb.trade_items.ensureIndex({modified_ts: -1})
  mdb.trade_items.ensureIndex({msg_id: 1})

  mdb.trade_items.ensureIndex({modified_ts: -1, archived_ts: -1})
  mdb.trade_items.ensureIndex({gtin: 1, modified_ts: -1, archived_ts: -1})
  mdb.trade_items.ensureIndex({recipient: 1, gtin: 1, provider: 1, tm: 1, tm_sub: 1, modified_ts: -1, archived_ts: -1})

  mdb.msg_archive.ensureIndex({archived_ts: -1})
  mdb.msg_archive.ensureIndex({modified_ts: -1})
  mdb.msg_archive.ensureIndex({instance_id: 1})
  mdb.msg_archive.ensureIndex({type: 1})

  mdb.parties.ensureIndex({modified_ts: -1})
  mdb.parties.ensureIndex({name: 1, modified_ts: -1})
  mdb.parties.ensureIndex({gln: 1}, {unique: true})

  log.info('connected to mongo db instance')
  for (var key in mdb) {
    if (mdb.hasOwnProperty(key) && mdb[key] && !mdb[key].apply) {
      log.info(key + ': ' + mdb[key])
    }
  }

  config.database = mdb
}

