module.exports = function (config) {

  var async          = require('async')
  var request        = require('request')
  var log            = require('../lib/Logger.js')('outbox', config)
  var db_msg_archive = require('../lib/db/msg_archive.js')(config)

  var api = {}
    
  api.send_from_dp = function (xml, callback) {

    callback = callback || function (err, result) { // default callback function in case none is passed
      if (err) return log.error('err: ' + err)
      log.info('send_from_dp default callback result: ' + result)
    }

    db_msg_archive.saveMessage(xml, function (err, msg_info) {

      if (err) return callback(err)
      log.info('Message saved to archive before attempting as2: ' + msg_info.msg_id + ', modified: ' + new Date(msg_info.modified_ts))

      // post xml to gdsn data pool outbox
      request.post({
        url: config.url_gdsn_api + '/outbox'
        , auth: {'sendImmediately': true
            ,'user': config.url_gdsn_api_user || 'admin'
            ,'pass': config.url_gdsn_api_pass || 'devadmin'
          }
        , body: xml
      }, function (post_err, response, body) {
        if (post_err) return callback(post_err)
        log.debug('post response: ' + response)
        log.debug('body    : ' + body)
        callback(null, msg_info)
      })

    }) // end db_msg_archive.saveMessage
  } // end api.send_from_dp

  return api
}

