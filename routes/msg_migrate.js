module.exports = function (config) {

  var Promise = require('q').Promise

  var _              = require('underscore')
  var async          = require('async')

  var log            = require('../lib/Logger')('rt_msg_migr', config)
  var db_msg_archive = require('../lib/db/msg_archive.js')(config)

  var api = {}

  api.reparse_msg = function (req, res, next) {
    log.debug('>>> reparse_msg called with path ' + req.path)

    var sender = req.params.sender
    if (!config.gdsn.validateGln(sender)) {
      res.end('sender must be a valid GLN')
      return
    }

    var msg_id = req.params.msg_id
    if (!msg_id) { 
      res.end('msg_id param is required')
      return
    }

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

    var msg_type  = req.param('msg_type') || 'catalogueItemConfirmation'

    var provider  = req.param('provider')
    var recipient = req.param('recipient')
    var all       = req.param('all')

    if (!provider && !recipient && !all) provider = '0000000000000'

    function migrateMessageBatch(batch_num) {

      var query = {
        receiver: config.homeDataPoolGln // only look at messages received by home DP from local parties or other data pools, not generated CIN
        ,msg_type: msg_type
      }
      if (provider) query.provider = provider
      if (recipient) query.recipient = recipient

      db_msg_archive.listMessages(query, batch_num, 10, function (err, messages) {
        if (err) return next(err)
        log.info('migrate_msg_archive cic listMessages return count: ' + messages.length)

        if (!messages.length) {
          res.jsonp({msg: 'Migrated ' + msgsMigrated.length + ' messages: ' + msgsMigrated.join(', ')})
          return res.end()
        }

        var tasks = []
        messages.forEach(function (msg) {
          log.debug('migrating msg ' + msg.msg_id)

          tasks.push(function (callback) {
            db_msg_archive.saveMessage(msg.xml, function (err, msg) {
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
