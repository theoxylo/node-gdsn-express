module.exports = Database

var mongojs = require('mongojs')
var log = require('./Logger.js')('database', {debug: true})

function Database(config) {

  if (!(this instanceof Database)) return new Database(config)

  log.opts.debug = config.debug

  this.request_counter = 0

  log.debug(config)
  this.config = config || {}

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

/////////////////////////// TRADE ITEM /////////////////////////////////

Database.prototype.saveTradeItem = function (item, callback) {
  item.modified_ts = Date.now()
  if (!item.recipient) item.recipient = this.config.homeDataPoolGln
  if (!item.source_dp) item.source_dp = this.config.homeDataPoolGln
  if (!item.created_ts) item.created_ts = item.modified_ts
  var self = this
  this.archiveTradeItem(item, function (err, result) {
    //log.debug('archiveTradeItem result: ' + JSON.stringify(result))
    var start = Date.now()
    log.debug('mdb.trade_items.save started at ' + start)
    self.mdb.trade_items.save(item, function (err, result) {
      if (err) return callback(err)
      log.info('mdb.trade_items.save took ' + (Date.now() - start) + 'ms for item ' + (item && item.gtin))
      //log.debug('trade_items.save result: ' + JSON.stringify(result))
      log.info('Persisted trade item with GTIN ' + result.gtin)
      callback(null, result.gtin)
    })
  })
}

Database.prototype.getTradeItem = function (query, callback) {
  var page = 0
  var per_page = 2
  var includeXml = false
  this.getTradeItems(query, page, per_page, includeXml, callback)
}

Database.prototype.getTradeItems = function (query, page, perPage, includeXml, callback, count_only) {
  var req_id = this.request_counter++
  try {
    query = query || {}

    var projection = {
      raw_xml: 0
      , _id  : 0
    }
    if (!includeXml) {
        projection.xml = 0
        //projection.tradeItem = 0 // we need tradeItem, but adds a lot of size per result to the response
    }
    log.debug('getTradeItems projection: ' + JSON.stringify(projection))

    var slow_warn = this.config.slow_warn_ms || 1000
    var max_count = this.config.total_item_count_limit || 500

    var start = Date.now()
    log.debug(req_id + ' mdb.trade_items.find ' + JSON.stringify(query) + ' started at ' + start + (count_only ? ' (counting ' + max_count + ')' : ''))

    if (count_only) {
      var self = this
      this.mdb.trade_items
      .find(query, {})
      .sort({modified_ts: -1})
      .skip(max_count)
      .limit(1)
      .toArray(function (err, result) {
        var time = Date.now() - start
        log.info(req_id + ' query ' + JSON.stringify(query) + ' found count over ' + max_count + ': ' + (result && result.length) +  ' in ' + time + 'ms' + (time > slow_warn ? ' SLOW' : ''))

        if (err) return callback(err)
        if (result && result.length) return callback(null, max_count + '+')

        // if max_count or less, get actual total count (slow)
        var start2 = Date.now()
        log.debug(req_id + ' mdb.trade_items.find.count ' + JSON.stringify(query) + ' started at ' + start2)
        self.mdb.trade_items
        .find(query, {})
        .sort({modified_ts: -1})
        .count(function (err, result) { // very very slow!
          var time = Date.now() - start2
          log.info(req_id + ' query ' + JSON.stringify(query) + ' found count ' + result +  ' in ' + time + 'ms' + (time > slow_warn ? ' SLOW' : ''))
          callback(err, result)
        })
      })
    }
    else {
      this.mdb.trade_items
        .find(query, projection)
        .sort({modified_ts: -1})
        .skip(page * perPage)
        .limit(perPage)
        .toArray(function (err, items) {
          var time = Date.now() - start
          log.info(req_id + ' query ' + JSON.stringify(query) + ' found ' + (items && items.length) +  ' items in ' + time + 'ms' + (time > slow_warn ? ' SLOW' : ''))
          callback(err, items)
        })
    }
  }
  catch (err) {
    log.error(err)
    setImmediate(function () {
      callback(err)
    })
  }
}

Database.prototype.archiveTradeItem = function (item, callback) {
  log.info('trade item archive called for GTIN: ' + item.gtin)

  var start = Date.now()
  log.debug('mdb.trade_items.update started at ' + start)

  this.mdb.trade_items.update( { 
        recipient : item.recipient
      , gtin    : item.gtin
      , provider: item.provider
      , tm      : item.tm
      , tm_sub  : item.tm_sub
      , archived_ts : { $exists : false }
    }
    , { $set : {archived_ts: Date.now()} }
    , { multi: true }
    , function (err, result) {
        var time = Date.now() - start
        log.info('mdb.trade_items.update took ' + time + 'ms for result ' + (result && JSON.stringify(result)))
        callback(err, result)
      }
  )
}

/////////////////////////// Message Archive /////////////////////////////////

Database.prototype.saveMessage = function (msg_info, callback) {
  try {
    msg_info.modified_ts = Date.now()
    this.mdb.msg_archive.save(msg_info, function (err, result) {
      log.info('Persisted message with instance_id ' + msg_info.instance_id)
      callback(null, msg_info.instance_id)
    })
  }
  catch (err) {
    setImmediate(function () {
      callback(err)
    })
  }
}

Database.prototype.saveMessageString = function (msg_string, callback) {
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
  this.saveMessage(info, callback)
}

Database.prototype.listMessages = function (page, perPage, callback) {
  try {
    this.mdb.msg_archive
      .find({}, {xml: 0, raw_xml: 0})
      .sort({modified_ts: -1})
      .skip(page * perPage)
      .limit(perPage)
      .toArray(callback)
  }
  catch (err) {
    setImmediate(function () {
      callback(err)
    })
  }
}

Database.prototype.findMessage = function (instance_id, callback) {
  try {
    this.mdb.msg_archive
      .find({instance_id: instance_id}, {xml:1})
      .sort({modified_ts: -1}, callback)
  }
  catch (err) {
    setImmediate(function () {
      callback(err)
    })
  }
}

/////////////////////////// TRADING PARTIES /////////////////////////////////

Database.prototype.saveParty = function (party, callback) {
  var self = this

  this.findParty(party.gln, function (err, existing_party) {

    if (err) return callback(err)

    if (existing_party) {
      if (existing_party.raw_xml === party.raw_xml) {
        // no update needed for this party
        return callback(null, '^' + party.gln)
      }
      party.created_ts = existing_party.created_ts // carry over original create timestamp
    }

    party.modified_ts = Date.now()

    try {
      self.mdb.parties.update({gln: party.gln, raw_xml: {$ne: party.raw_xml} }, party, {upsert: true})
      log.info('Persisted party with GLN ' + party.gln)
      return callback(null, party.gln)
    }
    catch (err) {
      log.error('Error persisting party with GLN ' + party.gln + ': ' + err)
      return callback(err)
    }
  })
}

Database.prototype.listParties = function (page, perPage, callback) {
  try {
    this.mdb.parties
      .find({}, {xml: 0, raw_xml: 0})
      .sort({modified_ts: -1})
      .skip(page * perPage)
      .limit(perPage)
      .toArray(callback)
  }
  catch (err) {
    setImmediate(function () {
      callback(err)
    })
  }
}

Database.prototype.findParty = function (gln, callback) {
  try {
    log.info('Database#findParty gln ' + gln)
    this.mdb.parties.findOne({gln: gln}, {}, callback)
  }
  catch (err) {
    setImmediate(function () {
      callback(err)
    })
  }
}

/////////////////////////// LOGS /////////////////////////////////

Database.prototype.listLogs = function (query, page, perPage, callback, count_only) {
  var req_id = this.request_counter++
  try {
    log.info('Database.listLogs page=' + page)
    query = query || {}

    var slow_warn = this.config.slow_warn_ms || 1000
    var max_count = this.config.total_item_count_limit || 500

    var start = Date.now()
    log.debug(req_id + ' mdb.logs.find ' + JSON.stringify(query) + ' started at ' + start + (count_only ? ' (counting ' + max_count + ')' : ''))

    if (count_only) {
      var self = this
      this.mdb.logs
      .find(query, {})
      .sort({timestamp: -1})
      .skip(max_count)
      .limit(1)
      .toArray(function (err, result) {
        var time = Date.now() - start
        log.info(req_id + ' query ' + JSON.stringify(query) + ' found count over ' + max_count + ': ' + (result && result.length) +  ' in ' + time + 'ms' + (time > slow_warn ? ' SLOW' : ''))

        if (err) return callback(err)
        if (result && result.length) return callback(null, max_count + '+')

        // if max_count or less, get actual total count (slow)
        var start2 = Date.now()
        log.debug(req_id + ' mdb.logs.find.count ' + JSON.stringify(query) + ' started at ' + start2)
        self.mdb.logs
        .find(query, {})
        .sort({timestamp: -1})
        .count(function (err, result) { // very very slow!
          var time = Date.now() - start2
          log.info(req_id + ' query ' + JSON.stringify(query) + ' found count ' + result +  ' in ' + time + 'ms' + (time > slow_warn ? ' SLOW' : ''))
          callback(err, result)
        })
      })
    } else {
    	this.mdb.logs
    	.find(query)
    	.sort({timestamp: -1})
    	.skip(page * perPage)
    	.limit(perPage)
    	.toArray(callback)
    }
  }
  catch (err) {
    setImmediate(function () {
      callback(err)
    })
  }
}

