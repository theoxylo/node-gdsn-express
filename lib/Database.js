module.exports = function Database(config) {

  var mongojs = require('mongojs')
  var log = require('./Logger.js')('database', {debug: true})

  console.log(config)
  this.config = config || {}

  if (!(this instanceof Database)) return new Database(config)

  if (!config.db_url) throw new Error('db_url is required')
  log.debug('db_url: ' + config.db_url)

  this.mdb = mongojs(config.db_url, ['msg_archive', 'trade_items', 'parties'])

  this.mdb.msg_archive.ensureIndex({instance_id: 1, modified_ts: -1})

  this.mdb.trade_items.ensureIndex({modified_ts: -1})
  this.mdb.trade_items.ensureIndex({gtin: 1, modified_ts: -1})

  this.mdb.parties.ensureIndex({modified_ts: -1})
  this.mdb.parties.ensureIndex({name: 1, modified_ts: -1})
  this.mdb.parties.ensureIndex({gln: 1}, {unique: true})

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

  Database.prototype.getTradeItems = function (query, page, perPage, includeXml, includeJson, cb) {
    if (!this.mdb) return cb(new Error('Database not connected'))
    try {
      query = query || {}
      log.info('trade item query: ' + JSON.stringify(query))

      var suppress = {}
      suppress.raw_xml = 0
      suppress._id = 0
      if (!includeXml) suppress.xml = 0
      if (!includeJson) suppress.json = 0
      log.info('trade item fetch: ' + JSON.stringify(suppress))

      this.mdb.trade_items
        .find(query, suppress)
        .sort([["modified_ts", 'descending']])
        .skip(page * perPage)
        .limit(perPage)
        .toArray(cb)
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

  Database.prototype.listMessages = function (page, perPage, cb) {
    if (!this.mdb) return cb(new Error('Database not connected'))
    try {
      this.mdb.msg_archive
        .find({}, {xml: 0, raw_xml: 0})
        .sort([["modified_ts", 'descending']])
        .skip(page * perPage)
        .limit(perPage)
        .toArray(cb)
    }
    catch (err) {
      process.nextTick(function () {
        cb(err)
      })
    }0013000000574
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

/////////////////////////// TRADING PARTIES /////////////////////////////////

  Database.prototype.saveParty = function (party, cb) {
    if (!this.mdb) return cb(new Error('Database not connected'))

    var self = this

    this.findParty(party.gln, function (err, existing_party) {

      if (err) return cb(err)

      if (existing_party) {
        if (existing_party.raw_xml === party.raw_xml) {
          // no update needed for this party
          return cb(null, '^' + party.gln)
        }
        party.created_ts = existing_party.created_ts // carry over original create timestamp
      }

      party.modified_ts = Date.now()

      try {
        self.mdb.parties.update({gln: party.gln, raw_xml: {$ne: party.raw_xml} }, party, {upsert: true})
        log.info('Persisted party with GLN ' + party.gln)
        return cb(null, party.gln)
      }
      catch (err) {
        log.error('Error persisting party with GLN ' + party.gln + ': ' + err)
        return cb(err)
      }
    })
  }

  Database.prototype.listParties = function (page, perPage, cb) {
    if (!this.mdb) return cb(new Error('Database not connected'))
    try {
      //this.mdb.parties.find({}, {xml: 0, raw_xml: 0}).sort([["modified_ts", 'descending']], cb)
      //var cursor = this.mdb.parties.find({}, {xml: 0, raw_xml: 0}).sort([["modified_ts", 'descending']])
      this.mdb.parties
        .find({}, {xml: 0, raw_xml: 0})
        .sort([["modified_ts", 'descending']])
        .skip(page * perPage)
        .limit(perPage)
        .toArray(cb)
    }
    catch (err) {
      process.nextTick(function () {
        cb(err)
      })
    }
  }

  Database.prototype.findParty = function (gln, cb) {
    if (!this.mdb) return cb(new Error('Database not connected'))
    try {
      log.info('Database#findParty gln ' + gln)
      this.mdb.parties.findOne({gln: gln}, {}, cb)
    }
    catch (err) {
      process.nextTick(function () {
        cb(err)
      })
    }
  }

}
