module.exports = function (config) {

  var _              = require('underscore')
  var async          = require('async')

  var log            = require('../Logger')('db_msg_arch', {debug: true})
  var xml_digest     = require('../xml_to_json.js')(config)

  var db_party        = require('./trading_party.js')(config)
  var db_trade_item   = require('./trade_item.js')(config)
  var db_publication  = require('./publication.js')(config)
  var db_subscription = require('./subscription.js')(config)
  
  var api = {}

  // default list method does not include archived messages or xml details because of response size/time
  api.listMessages = function (query, page, per_page, cb, include_all_fields, include_archived) {
    query = query || {}
    if (!include_archived) query.archived_ts = {$exists: false} 
    page = page || 0
    per_page = per_page || 10
    log.debug('db.msg_archive.listMessages( ' + JSON.stringify(query) + ' )' )
    var projection = {_id: 0}
    if (!include_all_fields) {
      projection.xml     = 0
      projection.raw_xml = 0 // in case it is still there from before, now deprecated
    }
    config.database.msg_archive
      .find(query, projection)
      .sort({modified_ts: -1})
      .skip(page * per_page)
      .limit(per_page)
      .toArray(cb)
  }

  api.listMessagesWithXml = function (query, page, per_page, cb) {
    this.listMessages(query, page, per_page, cb, true, false)
  }

  // include all details for any non-archived instances with specified id
  // (usually there should be only one unless from 2 different senders)
  api.findMessage = function (sender, msg_id, cb) {
    if (!msg_id) return cb(Error('findMessage requires msg_id argument'))

    var query = {archived_ts: {$exists: false}, msg_id: msg_id} // exclude archived messages (those with an archived_ts prop)
    if (sender) query.sender = sender

    config.database.msg_archive
    .find(query, {}) // keep db _id so we know this is not a new msg instance //_id: 0 */})
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
      .find(query, {_id: 0})
      .sort({modified_ts: -1}, cb)
  }

  // save msg xml and properties derived from xml, as well as archiving and hiding older versions or maybe all
  api.saveMessageInfo = function (msg, cb, archive_all) {
    this.archiveMessageInfo(msg, function (err, archive_result) {
      if (err) return cb(err)

      if (archive_all) {
        msg.archived_ts = archive_result.archived_ts
      }

      // attempt to store parties, trade items, pubs, subs...
      // save biz object to  separate collections (parties, items, pubs, subs)

      var tasks = []
      // persist msg itself

      // remove data and add back later to avoid double storage -- we still have the raw xml and parsing is fast
      var saved_data = msg.data
      delete msg.data

      // first save message props and xml (without 'data' biz object)
      tasks.push(function (callback) {
        start = Date.now()
        log.debug('db.msg_archive.save started at ' + start)
        config.database.msg_archive.save(msg, function (err, save_result) { // actual db save
          log.info('db.msg_archive.save took ' + (Date.now() - start) + 'ms for msg ' + msg.msg_id + (err ? (', err: ' + err) : '') + ', archive_result ' + archive_result + ', save_result ' + save_result)
          msg.data = saved_data // restore saved data
          callback(err, msg)
        })
      })

      if (msg.msg_type == 'catalogueItemNotification') {
        saved_data.forEach(function (item) {
          console.log('saving trade item: ' + item.gtin)

          var itemDigest = xml_digest.digest(item.xml)
          item.tradeItem = itemDigest.tradeItem

          tasks.push(function (callback) {
            db_trade_item.saveTradeItem(item, callback)
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
          //tasks.push(function (callback) {
            //db_publication.save_pub(pub, callback)
          //})
        })
      }
      else if (msg.msg_type == 'catalogueItemSubscription') {
        saved_data.forEach(function (sub) {
          console.log('found sub: ' + JSON.stringify(sub))
          //tasks.push(function (callback) {
            //db_subscription.save_sub(sub, callback)
          //})
        })
      }

      else if (msg.msg_type == 'catalogueItemConfirmation') {
        saved_data.forEach(function (cic) {
          console.log('FOUND WORKFLOW CIC: ' + JSON.stringify(cic))
          //tasks.push(function (callback) {
            //db_publication.save_cic(cic, callback)
          //})
        })
      }

      async.parallel(tasks, function (err, results) {
        log.debug('parallel results: ' + JSON.stringify(results))
        console.dir(results)
        if (err) return cb(Error('Error saving trade items for message: ' + err))
        if (!results) {
          return cb(Error('Error saving trade items for message: no results'))
        }
        log.info('Completed workflow tasks: ' + results.length)

        cb(null, results)
      })
    })
  }

  // archive any current versions by adding archived_ts
  // no other changes to msg properties, xml, etc
  api.archiveMessageInfo = function (msg, cb) {
    log.info('achiveMessageInfo called for msg ' + msg.msg_id)

    var start = Date.now()
    log.debug('starting db.msg_archive.update with ts: ' + start)
    config.database.msg_archive.update( { 
          msg_id   : msg.msg_id
        , sender   : msg.sender
        , archived_ts : {$exists: false}
      }
      , { $set : {archived_ts: start} }
      , { multi: true }
      , function (err, result) {
          if (result) result.archived_ts = start
          var time = Date.now() - start
          log.info('config.database.msg_archive.update took ' + time + 'ms for result ' + (result && JSON.stringify(result)))
          cb(err, result)
        }
    )
  }

  // save_messages will convert xml to msg with original xml as msg.xml
  // then archive any existing versions and save this latest
  // the saved_msg_info is passed back
  api.saveMessage = function (msg /* or raw xml */, cb, archive_all) {
    if (!msg) return cb(Error('msg_archive.saveMessage requires msg or raw xml argument'))

    if (!msg.xml && msg.length) {
      msg = config.gdsn.get_msg_info(msg) // passed msg is actually raw xml string // REPARSE
    }

    if (!msg || !msg.msg_id || !msg.sender) {
      return cb(Error('msg must be defined with msg_id and sender props'))
    }

    log.debug('save msg instance for msg_id: ' + msg.msg_id + ', sender: ' + msg.sender)
    this.saveMessageInfo(msg, cb, archive_all)
  }

  return api;

}
