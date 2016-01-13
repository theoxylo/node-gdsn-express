var async   = require('async')
var request = require('request')

module.exports = function (config) {

  var log            = require('../lib/Logger')('rt_autogdsn', {debug: true})
  var utils          = require('../lib/utils.js')(config)
  var db_msg_archive = require('../lib/db/msg_archive.js')(config)
  var process_msg    = require('../lib/process_msg.js')(config)

  var api = {}

  api.process = function (req, res, next) {
    log.debug('>>>>>>>>>>>>>>>>>>>> auto_gdsn process message  handler called')

    var xml = ''
    req.setEncoding('utf8')
    req.on('data', function (chunk) {
      log.debug('archive_post_chunk.length: ' + (chunk && chunk.length))
      xml += chunk
      if (xml.length > 10 * 1024 * 1024 && !res.finished) res.end('msg.xml too big - larger than 10 MB')
    })

    req.on('end', function () {

      log.info('Received msg.xml of length ' + (xml && xml.length || '0'))

      db_msg_archive.saveMessage(xml, function (err, msg) {

        if (err) return next(err)

        log.info('Message info saved to archive: ' + msg.msg_id + ', sender: ' + msg.sender)
        log.info('Message info saved to archive: ' + msg)

        try {
          request.post({
            url: config.url_gdsn_api + '/xmlvalidation?bus_vld=true'
            , auth: {
                'user': 'admin'
                , 'pass': 'devadmin'
                , 'sendImmediately': true
              }
            , body: msg.xml
          }, 
          function (err, response, body) {

            if (err) return next(err)

            if (!getSuccess(body)) {
              log.debug('body: ' + body)
              var response_xml = config.gdsn.populateResponseToSender('validation error', msg, msg.provider || msg.recipient)
              if (response_xml) {
                db_msg_archive.saveMessage(response_xml, function (err, saved_resp) {
                  if (err) return next(err)
                  log.info('Saved generated response to original message: ' + msg.msg_id)
                  log.info('Saved generated response: ' + saved_resp.msg_id)
                  res.jsonp({note:'validation error for msg ' + msg.msg_id, body: body})
                })
              }
              return
            }
 
            process_msg.workflow(msg, function (err, result) {
              if (err) return next(err)
              else res.jsonp(result)
            })

          }) // end request.post
        }
        catch (err) {
          return next(err)
        }

      })
    })
  }

  return api
}

function getSuccess(body) { // this function cannot access config
  try {
    var success = JSON.parse(body).success
    console.log('success: ' + success)
    return success && success != 'false'
  }
  catch (e) {
    log.debug('json parse error: ' + e)
  }
  return false
}
