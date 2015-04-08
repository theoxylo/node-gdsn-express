module.exports = function (config) {

  var _              = require('underscore')
  var async          = require('async')

  var log            = require('../lib/Logger')('rt_msg_migr', {debug: true})
  var msg_archive_db = require('../lib/db/msg_archive.js')(config)

  var api = {}

  api.reparse_msg = function (req, res, next) {

    log.debug('>>> reparse_msg called with path ' + req.path)

    var sender = req.params.sender
    if (!config.gdsn.validateGln(sender)) {
      res.end('sender must be a valid GLN')
      return
    }
  
    var msg_id = req.params.msg_id
    var sender = req.params.sender
    if (!msg_id) { 
      res.end('msg_id param is required')
      return
    }
    // fetch existing msg xml and submit to dp
    log.debug('gdsn-wf will use existing message with id ' + msg_id)
    msg_archive_db.findMessage(sender, msg_id, function (err, db_msg_info) {

      if (err) return next(err)
      if (db_msg_info.length > 1) return next(Error('found multiple messages with id ' + msg_id))

      db_msg_info = db_msg_info[0]

      if (!db_msg_info || !db_msg_info.msg_id || !db_msg_info.xml) {
        log.error('msg_info problem with data:' + JSON.stringify(db_msg_info))
        return next(Error('missing msg_info'))
      }

      msg_archive_db.saveMessage(db_msg_info.xml, function (err, new_msg_info) {
        log.debug('migrate reparse xml with modified ts: ' + (new_msg_info && new_msg_info.modified_ts))
        if (err) return next(err)
        if (!res.finished) {
            res.json(new_msg_info.msg_id)
            res.end
        }
      })
    })

  }

  api.migrate_msg_archive = function (req, res, next) {
    log.debug('migrate_msg_archive handler called')

    var msgsMigrated = []

    function migrateMessageBatch(batch_num) {

      var query = {
        source_dp: {$exists: false}
        //version: {$exists: false}
        //status: "REVIEW"
        //msg_type: 'catalogueItemNotification'
        //msg_type: 'GDSNResponse'
        //msg_id: 'API_CIP_1348588916974_10036016500279'
        //gdsn_repostable: {$exists: true}
      }

      msg_archive_db.listMessagesWithXml(query, batch_num, 10, function (err, messages) {
        if (err) return next(err)
        log.info('migrate_msg_archive listMessages return count: ' + messages.length)

        if (!messages.length) {
          res.jsonp({msg: 'Migrated ' + msgsMigrated.length + ' messages: ' + msgsMigrated.join(', ')})
          return res.end()
        }

        var tasks = []
        messages.forEach(function (message) {
          log.debug('migrating msg ' + message.msg_id)

          tasks.push(function (callback) {
            msg_archive_db.saveMessage(message.xml, function (err, saved_msg_info) {
              log.debug('route save version: ' + (saved_msg_info && saved_msg_info.version))
              if (err) return callback(err)
              else callback(null, saved_msg_info.msg_id)
            })
          })
        })
        async.parallel(tasks, function (err, results) {
          if (err) log.debug('parallel err: ' + JSON.stringify(err))
          else log.debug('parallel results: ' + JSON.stringify(results))

          if (err) return next(err)
          results = _.flatten(results) // async.parallel returns an array of results arrays
          msgsMigrated = msgsMigrated.concat(results)

          // repeat after 0.5 seconds
          setTimeout(function () {
            migrateMessageBatch(batch_num + 1)
          }, 500)
        })

      })
    }
    migrateMessageBatch(0)
  }

  return api
}
