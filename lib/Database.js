module.exports = function Database(config) {

  var mongojs = require('mongojs')
  var log = require('./Logger.js')('database', {debug: true})

  console.log(config)
  this.config = config || {}

  if (!(this instanceof Database)) return new Database(config)

  if (!config.db_url) throw new Error('db_url is required')
  log.debug('db_url: ' + config.db_url)

  this.mdb = mongojs(config.db_url, ['msg_archive', 'trade_items'])

  this.mdb.msg_archive.ensureIndex({instance_id: 1, modified_ts: -1})

  this.mdb.trade_items.ensureIndex({modified_ts: -1})
  this.mdb.trade_items.ensureIndex({gtin: 1, modified_ts: -1})

  log.info('connected to mongo db instance')
  for (var key in this.mdb) {
    if (this.mdb.hasOwnProperty(key) && this.mdb[key] && !this.mdb[key].apply) {
      log.info(key + ': ' + this.mdb[key])
    }
  }

/////////////////////////// TRADE ITEM /////////////////////////////////

  Database.prototype.saveTradeItem = function (item, cb) {
    if (!this.mdb) return cb(new Error('Database not connected'))
    try {
      item.modified_ts = Date.now()
      if (!item.recipient) item.recipient = config.homeDataPoolGln
      if (!item.created_ts) {
        console.log('created_ts not found for GTIN ' + item.gtin)
        item.created_ts = item.modified_ts
      }
      this.mdb.trade_items.save(item)
      log.debug('Persisted trade item with GTIN ' + item.gtin)
      process.nextTick(function () {
        cb(null, item.gtin)
      })
    }
    catch (err) {
      process.nextTick(function () {
        cb(err)
      })
    }
  }

  Database.prototype.listTradeItems = function (cb) {
    if (!this.mdb) return cb(new Error('Database not connected'))
    try {
      this.mdb.trade_items.find({}, {xml: 0, raw_xml: 0, json: 0}).sort([["modified_ts", 'descending']], cb)
    }
    catch (err) {
      process.nextTick(function () {
        cb(err)
      })
    }
  }

  Database.prototype.findTradeItem = function (gtin, provider, tm, tmsub, recipient, cb) {
    if (!this.mdb) return cb(new Error('Database not connected'))
    try {
      var query = {
        gtin: gtin
      }
      if (provider)  query.provider  = provider
      if (tm)        query.tm        = tm
      if (tmsub)     query.tmsub     = tmsub
      if (recipient) query.recipient = recipient

      this.mdb.trade_items.find(query, {}).sort([["modified_ts", 'descending']], cb)
    }
    catch (err) {
      process.nextTick(function () {
        cb(err)
      })
    }
  }

/////////////////////////// Message Archive /////////////////////////////////

  Database.prototype.saveMessage = function (msg_info, cb) {
    if (!this.mdb) return cb(new Error('Database not connected'))
    try {
      msg_info.modified_ts = Date.now()
      this.mdb.msg_archive.save(msg_info)
      log.debug('Persisted message with instance_id ' + msg_info.instance_id)
      process.nextTick(function () {
        cb(null, msg_info.instance_id)
      })
    }
    catch (err) {
      process.nextTick(function () {
        cb(err)
      })
    }
  }

  Database.prototype.saveMessageString = function (msg_string, cb) {
    if (!this.mdb) return cb(new Error('Database not connected'))
    
    var ts = Date.now()

    var tagName = 'InstanceIdentifier'
    var matches = msg_string.match(RegExp(tagName + '>([^<\/]*)<\/'))
    var id = (matches && matches[1]) || 'id_' + ts
    log.info('found message instance id: ' + id)

    var info = {
      archive_ts    : ts
      , instance_id : id
      , xml         : config.gdsn.clean_xml(msg_string)
      , raw_xml     : msg_string
    }
    this.saveMessage(info, cb)
  }

  Database.prototype.listMessages = function (cb) {
    if (!this.mdb) return cb(new Error('Database not connected'))
    try {
      this.mdb.msg_archive.find({}, {xml: 0, raw_xml: 0}).sort([["modified_ts", 'descending']], cb)
    }
    catch (err) {
      process.nextTick(function () {
        cb(err)
      })
    }
  }

  Database.prototype.findMessage = function (instance_id, cb) {
    if (!this.mdb) return cb(new Error('Database not connected'))
    try {
      this.mdb.msg_archive.find({instance_id: instance_id}, {xml:1}).sort([["modified_ts", 'descending']], cb)
    }
    catch (err) {
      process.nextTick(function () {
        cb(err)
      })
    }
  }

}
