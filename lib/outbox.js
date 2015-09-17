var async          = require('async')
var request        = require('request')

module.exports = function (config) {

  var log            = require('../lib/Logger.js')('outbox', config)
  var db_msg_archive = require('../lib/db/msg_archive.js')(config)

  var api = {}
    
  api.send_by_as2 = function (xml, receiver, done) {

    done = done || function (err, result) {
      if (err) return log.error('err: ' + err)
      log.info('send_by_as2 default done result: ' + result)
    }

    db_msg_archive.saveMessage(xml, function (err, msg_info) {
      if (err) return done(err)
      log.info('Message saved to archive before attempting as2: ' + msg_info.msg_id + ', modified: ' + new Date(msg_info.modified_ts))

      if (config.as2_gln_list.indexOf(receiver) == -1) {
        return done(Error('receiver ' + receiver + ' is not on as2 config list'))
      }

      var url = config.url_gdsn_api + '/outbox'
      log.info('dp-outbox target url: ' + url)

      var post_options = {
        url: url
        , auth: {
            'user': 'admin'
            , 'pass': 'devadmin'
            , 'sendImmediately': true
          }
        , body: xml
      }

      request.post(post_options, function (post_err, response, body) {

        if (post_err) return done(post_err)

        log.debug('post response: ' + response)
        log.debug('body    : ' + body)

        done(null, msg_info)

      }) // end request.post
    }) // end db_msg_archive.saveMessage
  } // end api.send_by_as2

  return api
}

