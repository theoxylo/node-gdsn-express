module.exports = function (config) {

  var _              = require('underscore')
  var async          = require('async')

  var log             = require('../Logger')('db_msg_arch', {debug: true})
  var db_party        = require('./trading_party.js')(config)
  var db_trade_item   = require('./trade_item.js')(config)
  var db_publication  = require('./publication.js')(config)
  var db_subscription = require('./subscription.js')(config)
  var db_confirmation = require('./confirmation.js')(config)
  
  var options = { timeout: config.db_timeout }

  var api = {}

  // default list method does not include archived messages or xml details because of response size/time
  api.listMessages = function (query, page, per_page, cb, skip_xml, include_archived) {
    page = page || 0
    per_page = per_page || 10

    query = query || {}
    if (!include_archived) query.archived_ts = {$exists: false} 
    log.debug('db.msg_archive.find( ' + JSON.stringify(query) + ' )' )

    var projection = {_id: 0}
    if (skip_xml) projection.xml = 0

    config.database.msg_archive
      .find(query, projection, options)
      .sort({modified_ts: -1})
      .skip(page * per_page)
      .limit(per_page)
      .toArray(cb)
  }

  // include all details for any non-archived instances with specified id
  // (usually there should be only one unless from 2 different senders)
  api.findMessage = function (sender, msg_id, cb) {
    if (!msg_id) return cb(Error('findMessage requires msg_id argument'))

    var query = {archived_ts: {$exists: false}, msg_id: msg_id} // exclude archived messages (those with an archived_ts prop)
    if (sender) query.sender = sender

    config.database.msg_archive
    .find(query, {}, options) // keep db _id so we know this is not a new msg instance //_id: 0 */})
    .sort({modified_ts: -1}, function (err, msg_array) {
      if (err) return cb(err)
      if (msg_array.length == 0) return cb(Error('message not found for msg_id: ' + msg_id + (sender ? (', sender: ' + sender) : '')))
      if (msg_array.length  > 1) {

          if (sender) return cb(Error('found unexpected duplicate records (non-archived) records. please run arhive cleanup for msg_id: ' + msg_id + ', sender: ' + sender))

          var senders = _.pluck(msg_array, 'sender')
          return cb(Error('found multiple messages for id ' + msg_id + ', please specify sender gln from list:' + (senders && senders.join(','))))
      }
      cb(null, msg_array[0])
    })
  }

  // return array of message versions for this msg_id and optional sender
  // includes all versions regardless of archive_ts 
  api.findMessageHistory = function (sender, msg_id, cb) {
    var query = {msg_id: msg_id}
    if (sender) query.sender = sender
    config.database.msg_archive
      .find(query, {_id: 0}, options)
      .sort({modified_ts: -1}, cb)
  }

  // archive any current versions by adding archived_ts
  // no other changes to msg properties, xml, etc
  api.archiveMessageInfo = function (msg, cb) {
    log.info('achiveMessageInfo called for msg ' + msg.msg_id)

    var start = Date.now()
    log.debug('starting db.msg_archive.update with ts: ' + start)
    msg = { 
          msg_id   : msg.msg_id
        , sender   : msg.sender
        , archived_ts : {$exists: false}
      }
    config.database.msg_archive.update(msg
      , { $set : {archived_ts: start} }
      , { multi: true , w: 0}
      , function (err, result) {
          msg.archived_ts = start
          var time = Date.now() - start
          log.info('config.database.msg_archive.update took ' + time + 'ms for msg ' + msg.msg_id)
          cb(err, msg)
        }
    )
  }

  // save_message will convert xml to msg with original xml as msg.xml
  // then archive any existing versions and save this latest
  // the saved_msg_info is passed back
  var msg_id_counter = 1000

  api.saveMessage = function (xml, cb) {

    if (!xml || !xml.length) return cb(Error('msg_archive.saveMessage requires msg xml argument'))

    try {
      var msg = config.gdsn.get_msg_info(xml)
      if (!msg) return cb(Error('failed to parse xml info: ' + xml))
    }
    catch (err) {
      return cb('failed to parse xml msg: ' + err)
    }

    if (!msg.msg_id) {
      // auto-generate msg_id
      msg.msg_id = 'itn_' + msg.msg_type + '_' + Date.now() + '_' + msg_id_counter
      if (msg.gtin) msg.msg_id += msg.gtin
    }

    if (!msg.sender) {
      if (msg.provider) msg.sender = msg.provider
      else msg.sender = '0000000000000'
    }

    if (!msg.msg_id || !msg.sender) {
      return cb(Error('msg must be defined with msg_id and sender props' + JSON.stringify(msg)))
    }

    log.debug('save msg instance for msg_id: ' + msg.msg_id + ', sender: ' + msg.sender)
    this.archiveMessageInfo(msg, function (err, archive_result) {
      if (err) return cb(err)

      // attempt to store parties, trade items, pubs, subs...
      // save biz object to  separate collections (parties, items, pubs, subs)

      var tasks = []

      // remove data and add back later to avoid double storage -- we still have the raw xml and parsing is fast
      var saved_data = msg.data
      delete msg.data

      // first save message props and xml (without 'data' biz object)
      tasks.push(function (callback) {
        var start = Date.now()
        log.debug('db.msg_archive.save started at ' + start)
        config.database.msg_archive.save(msg, function (err, save_result) { // actual db save
          log.debug('db.msg_archive.save result: ' + save_result)
          log.info('db.msg_archive.save took ' + (Date.now() - start) + ' ms for msg ' + msg.msg_id + (err ? (', err: ' + err) : ''))
          msg.data = saved_data // restore saved data
          callback(err, msg)
        })
      })

      var count = 0

      if (msg.msg_type == 'catalogueItemNotification' || msg.msg_type == 'tradeItems') {
        saved_data.forEach(function (item) {
          console.log('saving trade item: ' + item.gtin)
          tasks.push(function (callback) {
            count++
            log.debug('Task function called ' + count)
            db_trade_item.saveTradeItem(item, function () {
              callback(null, 'test result ' + count)
            })
          })
        })
      }
      else if (msg.msg_type == 'basicPartyRegistration' || msg.msg_type == 'registryPartyDataDump') {
        saved_data.forEach(function (party) {
          console.log('saving party: ' + party.gln)
          tasks.push(function (callback) {
            db_party.saveParty(party, callback)
          })
        })
      }
      else if (msg.msg_type == 'catalogueItemPublication') {
        saved_data.forEach(function (pub) {
          console.log('found pub: ' + JSON.stringify(pub))
          tasks.push(function (callback) {
            db_publication.save_pub(pub, callback)
          })
        })
      }
      else if (msg.msg_type == 'catalogueItemSubscription') {
        saved_data.forEach(function (sub) {
          console.log('found sub: ' + JSON.stringify(sub))
          tasks.push(function (callback) {
            db_subscription.save_sub(sub, callback)
          })
        })
      }
      else if (msg.msg_type == 'catalogueItemConfirmation') {
        saved_data.forEach(function (cic) {
          console.log('FOUND WORKFLOW CIC: ' + JSON.stringify(cic))
          tasks.push(function (callback) {
            db_confirmation.save_cic(cic, callback)
          })
        })
      }

      var start = Date.now()
      async.parallelLimit(tasks, config.concurrency, function (err, results) {
        if (err) return cb(Error('Error saving trade items for message: ' + err))
        if (!results) {
          return cb(Error('Error saving trade items for message: no results'))
        }
        log.info('Completed data archive tasks: ' + results.length + ' in ' + (Date.now() - start) + ' ms')
        //log.debug('Completed data archive results: ' + results)

        cb(null, msg)
      })
    })
  }

  return api;

}
