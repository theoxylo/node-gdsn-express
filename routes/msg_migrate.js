module.exports = function (config) {

  var Promise = require('q').Promise

  var _              = require('underscore')
  var async          = require('async')

  var log            = require('../lib/Logger')('rt_msg_migr', {debug: true})
  var db_msg_archive    = require('../lib/db/msg_archive.js')(config)

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
    log.debug('gdsn-wf will use existing msg with id ' + msg_id)

    Promise(function (resolve, reject) {
      db_msg_archive.findMessage(sender, msg_id, function (err, msg) {
        if (err) {
          reject(err)
        }
        else if (!msg || !msg.msg_id || !msg.xml) {
          reject('missing msg_info for msg_id: ' + msg_id)
        }
        else {
          resolve(msg.xml)
        }
      })
    })
    .then(function (msg_xml) {
      log.debug('promised msg_xml.length: ' + msg_xml.length)
      return Promise(function (resolve, reject) {
        db_msg_archive.saveMessage(msg_xml, function (err, msg) {
          if (err) reject(err)
          else resolve(msg)
        })
      })
    })
    .then(function (msg) {
      log.debug('then msg id: ' + msg.msg_id)
      res.jsonp(msg)
    })
    .catch(function (err) {
      log.debug('catch err: ' + err)
      res.jsonp(err)
    })
  }

  api.migrate_msg_archive = function (req, res, next) {
    log.debug('migrate_msg_archive handler called at ' + new Date)

    var msgsMigrated = []

    function migrateMessageBatch(batch_num) {

      var query = {
        sender   : '1100001011339'
        //,msg_type: 'catalogueItemNotification'
        //,source_dp: '1100001011285'
        //,version  : '3.1'
        //source_dp: {$exists: false}
        //version: {$exists: false}
        //status: "REVIEW"
        //msg_type: 'GDSNResponse'
        //msg_id: 'API_CIP_1348588916974_10036016500279'
        //gdsn_repostable: {$exists: true}
      }

      db_msg_archive.listMessages(query, batch_num, 10, function (err, messages) {
        if (err) return next(err)
        log.info('migrate_msg_archive listMessages return count: ' + messages.length)

        if (!messages.length) {
          res.jsonp({msg: 'Migrated ' + msgsMigrated.length + ' messages: ' + msgsMigrated.join(', ')})
          return res.end()
        }

        var tasks = []
        messages.forEach(function (msg) {
          log.debug('migrating msg ' + msg.msg_id)

          tasks.push(function (callback) {
            db_msg_archive.saveMessage(msg.xml, function (err, msg) {
              log.debug('route save version: ' + (msg && msg.version))
              if (err) return callback(err)
              else callback(null, msg.msg_id)
            })
          })
        })
        async.parallelLimit(tasks, config.concurrency, function (err, results) {
          if (err) log.debug('parallel err: ' + JSON.stringify(err))
          else log.debug('parallel results: ' + JSON.stringify(results))

          if (err) return next(err)
          results = _.flatten(results)
          msgsMigrated = msgsMigrated.concat(results)

          setTimeout(function () {
            migrateMessageBatch(batch_num + 1)
          }, 500)

        }) // end async.parallelLimit
      }) // end db_msg_archive.listMessages
    }
    migrateMessageBatch(0)
  }

  return api
}
