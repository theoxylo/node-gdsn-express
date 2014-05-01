module.exports = Database

var mongojs = require('mongojs')
var log = require('./Logger.js')('database', {debug: true})

function Database(config) {

  if (!(this instanceof Database)) return new Database(config)

  console.log(config)
  this.config = config || {}

  if (!this.config.db_url) throw new Error('db_url is required')
  log.debug('db_url: ' + this.config.db_url)

  this.mdb = mongojs(this.config.db_url, ['msg_archive', 'trade_items', 'parties'])

  //this.mdb.on('error', function (err) { log.err(err) })

  this.mdb.msg_archive.ensureIndex({instance_id: 1, modified_ts: -1})

  this.mdb.trade_items.ensureIndex({modified_ts: -1, archived_ts: -1})
  this.mdb.trade_items.ensureIndex({gtin: 1, modified_ts: -1, archived_ts: -1})
  this.mdb.trade_items.ensureIndex({recipient: 1, gtin: 1, provider: 1, tm: 1, tm_sub: 1, modified_ts: -1, archived_ts: -1})

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

/////////////////////////// TRADE ITEM /////////////////////////////////

Database.prototype.saveTradeItem = function (item, cb) {
  if (!this.mdb) return cb(new Error('Database not connected'))
  item.modified_ts = Date.now()
  if (!item.recipient) item.recipient = this.config.homeDataPoolGln
  if (!item.source_dp) item.source_dp = this.config.homeDataPoolGln
  if (!item.created_ts) item.created_ts = item.modified_ts
  var self = this
  this.archiveTradeItem(item, function (err, result) {
    log.debug('archiveTradeItem result: ' + JSON.stringify(result).slice(400))
    self.mdb.trade_items.save(item, function (err, result) {
      log.debug('trade_items.save result: ' + JSON.stringify(result))
      if (err) return cb(err)
      log.debug('Persisted trade item with GTIN ' + item.gtin)
      cb(result)
    })
  })
}

Database.prototype.getTradeItems = function (query, page, perPage, includeXml, cb) {
  if (!this.mdb) return cb(new Error('Database not connected'))
  try {
    query = query || {}
    log.info('trade item query: ' + JSON.stringify(query))

    var suppress = {}
    suppress.raw_xml = 0
    suppress._id = 0
    if (!includeXml) suppress.xml = 0
    log.info('trade item fetch: ' + JSON.stringify(suppress))

    this.mdb.trade_items
      .find(query, suppress)
      //.sort([["modified_ts", 'descending']])
      //.sort({gtin: 1, provider: 1, tm: 1, recipient: 1, tm_sub: 1, modified_ts: -1})
      .sort({modified_ts: -1, recipient: 1, gtin: 1, provider: 1, tm: 1, tm_sub: 1})
      //.sort({recipient: 1, gtin: 1, provider: 1, tm: 1, tm_sub: 1, modified_ts: -1})
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

Database.prototype.archiveTradeItem = function (item, cb) {
  if (!this.mdb) return cb(new Error('Database not connected'))
  log.info('trade item archive called for GTIN: ' + item.gtin)

  var now = Date.now()
  this.mdb.trade_items.update(
    { recipient : item.recipient
      , gtin    : item.gtin
      , provider: item.provider
      , tm      : item.tm
      , tm_sub  : item.tm_sub
      , archived_ts : { $in : ['', null] }
    },
    { $set : {archived_ts: now} },
    { multi: true },
    cb
  )
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
    archived_ts   : ts
    , instance_id : id
    , xml         : this.config.gdsn.clean_xml(msg_string)
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
