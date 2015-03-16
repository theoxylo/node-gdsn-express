module.exports = function (config) {

  var log = require('../Logger')('db_msg_arch', {debug: true})
  
  var api = {}

  // default list method does not include archived messages or xml details because of response size/time
  api.listMessages = function (query, page, per_page, cb, include_all_fields) {
    query = query || {}
    query.archived_ts = {$exists: false} 
    page = page || 0
    per_page = per_page || 5
    log.debug('db.msg_archive.find( ' + JSON.stringify(query) + ' )' )
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
    this.listMessages(query, page, per_page, cb, true)
  }

  // include all details for any non-archived instances with specified id
  // (usually there should be only one unless from 2 different senders)
  api.findMessage = function (sender, msg_id, cb) {
    var query = {archived_ts: {$exists: false}, msg_id: msg_id}
    if (sender) query.sender = sender
    config.database.msg_archive
      .find(query, {_id: 0})
      .sort({modified_ts: -1}, cb)
  }

  api.findMessageHistory = function (sender, msg_id, cb) {
    var query = {msg_id: msg_id}
    if (sender) query.sender = sender
    config.database.msg_archive
      .find(query, {_id: 0})
      .sort({modified_ts: -1}, cb)
  }

  // save_messages will convert xml to msg_info, then archive any existing versions and save this latest
  // the saved_msg_info is passed back with saved_msg_info.xml = xml
  api.saveMessage = function (xml, cb) {
    log.debug('db msg_archive saveMessage called with xml length ' + xml.length)
    var self = this
    var start = Date.now()

    var msg_info = config.gdsn.get_msg_info(xml)

    if (!msg_info) return cb(Error('msg_info undefined'))
    log.debug('***************** version : ' + msg_info.version)

    var start2 = Date.now()
    self.saveMessageInfo(msg_info, function (err, saved_msg_info) {
      log.info('saveMessageInfo took ' + (Date.now() - start2) + ' ms for msg ' + (saved_msg_info && saved_msg_info.msg_id))
      if (err) return cb(err)
      if (!saved_msg_info) return cb(Error('saved_msg_info undefined'))
      log.debug('***************** version : ' + saved_msg_info.version)
      log.debug('***************** xml length : ' + saved_msg_info.xml && (saved_msg_info.xml && saved_msg_info.xml.length))
      cb(null, saved_msg_info)
    })
  }

  api.saveMessageInfo = function (msg_info, cb) {
    var start = Date.now()

    msg_info.modified_ts = start
    if (!msg_info.created_ts) msg_info.created_ts = msg_info.modified_ts

    if (msg_info.xml && !msg_info.xml_length) msg_info.xml_length = msg_info.xml.length
    log.debug('saveMessageInfo xml length ' + msg_info.xml_length)

    log.debug('archiveMessageInfo started at ' + start)
    this.archiveMessageInfo(msg_info, function (err, archive_result) {
      log.info('archiveMessageInfo took ' + (Date.now() - start) + 'ms for msg ' + msg_info.msg_id)
      if (err) return cb(err)

      // don't save linked objects to the msg_archive collection since we are pesisting full xml,
      // and also have separate collections for those objects
      // TODO: clean this up using copy of immutable data structure?
      var saved_item = msg_info.item
      delete msg_info.item

      var saved_party = msg_info.party
      delete msg_info.party

      var saved_pub = msg_info.pub
      delete msg_info.pub

      var saved_sub = msg_info.sub
      delete msg_info.sub

      start = Date.now()
      log.debug('db.msg_archive.save started at ' + start)
      config.database.msg_archive.save(msg_info, function (err, save_result) {
        log.info('db.msg_archive.save took ' + (Date.now() - start) + 'ms for msg ' + msg_info.msg_id + ', err: ' + err + ', archive_result ' + archive_result + ', save_result ' + save_result)
        if (msg_info) { // restore linked objects
            msg_info.item  = saved_item
            msg_info.party = saved_party
            msg_info.pub   = saved_pub
            msg_info.sub   = saved_sub
        }
        cb(err, msg_info)
      })
    })
  }

  api.archiveMessageInfo = function (msg_info, cb) {
    log.info('msg archive called for msg_info ' + msg_info.msg_id)

    var start = Date.now()
    log.debug('db.msg_archive.update started at ' + start)

    config.database.msg_archive.update( { 
          msg_id   : msg_info.msg_id
        , sender   : msg_info.sender
        , archived_ts : {$exists: false}
      }
      , { $set : {archived_ts: Date.now()} }
      , { multi: true }
      , function (err, result) {
          var time = Date.now() - start
          log.info('db.msg_archive.update took ' + time + 'ms for result ' + (result && JSON.stringify(result)))
          cb(err, result)
        }
    )
  }

  return api;
}
