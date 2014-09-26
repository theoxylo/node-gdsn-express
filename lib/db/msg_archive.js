module.exports = function (config) {

  var log   = require('../Logger')('db_msg_arch', {debug: true})
  
  var api = {}

  api.listMessages = function (page, perPage, cb) {
    config.database.msg_archive
      .find({archived_ts: { $exists : false }}, {_id: 0, xml: 0, raw_xml: 0})
      .sort({modified_ts: -1})
      .skip(page * perPage)
      .limit(perPage)
      .toArray(cb)
  }

  api.findMessage = function (instance_id, cb) {
    config.database.msg_archive
      .find({archived_ts: { $exists : false }, instance_id: instance_id}, {_id: 0})
      .sort({modified_ts: -1}, cb)
  }

  api.findMessageHistory = function (instance_id, cb) {
    config.database.msg_archive
      .find({instance_id: instance_id}, {_id: 0})
      .sort({modified_ts: -1}, cb)
  }

  api.saveMessage = function (xml, cb) {
    log.debug('db msg_archive saveMessage called with xml length ' + xml.length)
    var self = this
    config.gdsn.msg_string_to_msg_info(xml, function (err, info) {
      if (err) return cb(err)
      var start = Date.now()

      // don't save trade items
      if (info.trade_items) {
        var trade_items = info.trade_items
        delete info.trade_items

        trade_items.forEach(function (item) {
          console.log('--------------------------------------------------------------------- skipping msg trade item with gtin ' + item.gtin)
          console.log('created_ts: ' + item.created_ts)
          console.log('recipient:  ' + item.recipient)
          console.log('message id: ' + item.msg_id)
          console.log('source db:  ' + item.source_dp)
          //console.log('raw_xml:    ' + item.raw_xml)
          //console.log('xml:        ' + item.xml)
          console.log('provider:   ' + item.provider)
          console.log('tm country: ' + item.tm)
          console.log('tm sub:     ' + item.tm_sub)
          console.log('unit_type:  ' + item.unit_type)
          console.log('gpc:        ' + item.gpc)
          console.log('brand:      ' + item.brand)
          console.log('child count:' + item.child_count)
          console.log('child gtins:' + item.child_gtins)
        })
      }

      self.saveMessageInfo(info, function (err, saved_info) {
        log.info('saveMessageInfo took ' + (Date.now() - start) + ' ms')
        if (err) return cb(err)
        cb(null, saved_info)
      })
    })
  }

  api.saveMessageInfo = function (msg_info, cb) {
    var start = Date.now()
    msg_info.modified_ts = start
    if (!msg_info.created_ts) msg_info.created_ts = msg_info.modified_ts
    log.debug('archiveMessageInfo started at ' + start)
    this.archiveMessageInfo(msg_info, function (err, result) {
      log.info('archiveMessageInfo took ' + (Date.now() - start) + 'ms for msg ' + msg_info.instance_id)
      if (err) return cb(err)
      start = Date.now()
      log.debug('db.msg_archive.save started at ' + start)

      for (var key in msg_info) {
        if (msg_info.hasOwnProperty(key) && msg_info[key] && !msg_info[key].apply) {
          log.info(key + ': ' + msg_info[key])
        }
      }
      config.database.msg_archive.save(msg_info, function (err, result) {
        log.info('db.msg_archive.save took ' + (Date.now() - start) + 'ms for msg ' + msg_info.instance_id + ', err: ' + err + ', result ' + result)
        cb(err, msg_info)
      })
    })
  }

  api.archiveMessageInfo = function (info, cb) {
    log.info('msg archive called for msg info ' + info.instance_id)

    var start = Date.now()
    log.debug('db.msg_archive.update started at ' + start)

    config.database.msg_archive.update( { 
          instance_id : info.instance_id
        , sender_gln  : info.sender_gln
        , receiver_gln: info.receiver_gln
        //, type: info.type // uncomment to make instance_id only unique per message type for each sender/receiver pair
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
