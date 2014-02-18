(function () {

  var mongojs = require('mongojs')
  var log = require('./Logger.js')('database', {debug: true})

  module.exports = function Database(config) {

    console.log(config)
    this.config = config || {}

    //if (!(this instanceof Database)) return new Database(config)
    if (this.constructor.name != 'Database') {
      console.log('Warning: Database constructor function was called without keyword "new"')
      return new Database(config) // constructor was called without 'new' keyword
    }

    if (!config.db_url) throw new Error('db_url is required')
    log.debug('db_url: ' + config.db_url)

    this.mdb = mongojs(config.db_url, ['archive', 'trade_items'])
    this.mdb.archive.ensureIndex({instance_id: 1})
    this.mdb.trade_items.ensureIndex({gtin: 1})

    log.info('connected to mongo db instance')
    for (var key in this.mdb) {
      if (this.mdb.hasOwnProperty(key) && !this.mdb[key].apply) {
        log.info(key + ': ' + this.mdb[key])
      }
    }

/////////////////////////// TRADE ITEM /////////////////////////////////

    this.saveTradeItem = function (item, cb) {
      if (!this.mdb) return cb(new Error('Database not connected'))
      try {
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

    this.listTradeItems = function (cb) {
      if (!this.mdb) return cb(new Error('Database not connected'))
      try {
        this.mdb.trade_items.find({}, {xml:0}, cb)
      }
      catch (err) {
        process.nextTick(function () {
          cb(err)
        })
      }
    }

    this.findTradeItem = function (gtin, cb) {
      if (!this.mdb) return cb(new Error('Database not connected'))
      try {
        this.mdb.trade_items.find({gtin: gtin}, {}, cb)
      }
      catch (err) {
        process.nextTick(function () {
          cb(err)
        })
      }
    }

/////////////////////////// Message Archive /////////////////////////////////

    this.saveMessage = function (msg, cb) {
      if (!this.mdb) return cb(new Error('Database not connected'))
      try {
        this.mdb.archive.save(msg)
        log.debug('Persisted message with instance_id ' + msg.instance_id)
        process.nextTick(function () {
          cb(null, msg.instance_id)
        })
      }
      catch (err) {
        process.nextTick(function () {
          cb(err)
        })
      }
    }

    this.listMessages = function (cb) {
      if (!this.mdb) return cb(new Error('Database not connected'))
      try {
        this.mdb.archive.find({}, {content:0}, cb)
      }
      catch (err) {
        process.nextTick(function () {
          cb(err)
        })
      }
    }

    this.findMessage = function (id, cb) {
      if (!this.mdb) return cb(new Error('Database not connected'))
      try {
        this.mdb.archive.find({instance_id: id}, {}, cb)
      }
      catch (err) {
        process.nextTick(function () {
          cb(err)
        })
      }
    }

  }

})()
