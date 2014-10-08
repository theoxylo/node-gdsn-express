module.exports = function (config) {

/*
mongos> var oneRow = db.msg_archive.findOne()
mongos> for (var key in oneRow) { print(key) }
_id
msg_type Y
msg_id   Y
sender   Y
receiver Y
source_dp
created_ts Y
version
request_msg_id Y
exception
item_count Y
gtins
xml
raw_xml
modified_ts Y
*/
  var log   = require('../Logger')('db_msg_arch', {debug: true})
  
  var api = {}

  api.listMessages = function (query, page, perPage, cb, include_all) {
    query.archived_ts = { $exists : false } 
    log.debug('db.msg_archive.find( ' + JSON.stringify(query) + ' )' )

    var projection = {}//_id:0}
    if (!include_all) {
      projection.xml = 0,
      projection.raw_xml = 0
    }
    config.database.msg_archive
      .find(query, projection)
      .sort({modified_ts: -1})
      .skip(page * perPage)
      .limit(perPage)
      .toArray(cb)
  }

  api.findMessage = function (msg_id, cb) {
    config.database.msg_archive
      .find({archived_ts: { $exists : false }, msg_id: msg_id}, {_id: 0})
      .sort({modified_ts: -1}, cb)
  }

  api.findMessageHistory = function (msg_id, cb) {
    config.database.msg_archive
      .find({msg_id: msg_id}, {_id: 0})
      .sort({modified_ts: -1}, cb)
  }

  api.saveMessage = function (xml, cb) {
    log.debug('db msg_archive saveMessage called with xml length ' + xml.length)
    var self = this
    var start = Date.now()
    config.gdsn.msg_string_to_msg_info(xml, function (err, msg_info) {
      log.debug('msg_string_to_msg_info took ' + (Date.now() - start) + ' ms for msg ' + (msg_info && msg_info.msg_id))
      if (err) return cb(err)
      if (!msg_info.msg_id) return cb(Error('message not saved, msg_info.msg_id not found'))
      var start2 = Date.now()
      self.saveMessageInfo(msg_info, function (err, saved_msg_info) {
        log.info('saveMessageInfo took ' + (Date.now() - start2) + ' ms for msg ' + saved_msg_info.msg_id)
        if (err) return cb(err)
        cb(null, saved_msg_info)
      })
    })
  }

  api.saveMessageInfo = function (msg_info, cb) {
    var start = Date.now()
    msg_info.modified_ts = start
    if (!msg_info.created_ts) msg_info.created_ts = msg_info.modified_ts
    log.debug('archiveMessageInfo started at ' + start)
    this.archiveMessageInfo(msg_info, function (err, result) {
      log.info('archiveMessageInfo took ' + (Date.now() - start) + 'ms for msg ' + msg_info.msg_id)
      if (err) return cb(err)
      start = Date.now()
      log.debug('db.msg_archive.save started at ' + start)

      config.database.msg_archive.save(msg_info, function (err, result) {
        log.info('db.msg_archive.save took ' + (Date.now() - start) + 'ms for msg ' + msg_info.msg_id + ', err: ' + err + ', result ' + result)
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
        , receiver : msg_info.receiver
        , archived_ts : { $exists : false }
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
