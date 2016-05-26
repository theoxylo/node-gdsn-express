var async   = require('async')
var request = require('request')

module.exports = function (config) {

  var log            = require('../lib/Logger')('rt_autogdsn', config)
  var utils          = require('../lib/utils.js')(config)
  var db_msg_archive = require('../lib/db/msg_archive.js')(config)
  var process_msg    = require('../lib/process_msg.js')(config)

  var api = {}

  api.process = function (req, res, next) {
    //log.debug('>>>>>>>>>>>>>>>>>>>> auto_gdsn process message  handler called')
    var xml = ''
    req.setEncoding('utf8')
    req.on('data', function (chunk) {
      //log.debug('archive_post_chunk.length: ' + (chunk && chunk.length))
      xml += chunk
      if (xml.length > 30 * 1024 * 1024 && !res.finished) res.end('msg.xml too big - larger than 30 MB')
    })

    req.on('end', function () {
      log.info('Received msg.xml of length ' + (xml && xml.length || '0'))

      db_msg_archive.saveMessage(xml, function (err, msg) {
        if (err) return next(err)
        log.info('Message info saved to archive: ' + msg.msg_id + ', sender: ' + msg.sender)
        process_msg.workflow(msg, function (err, result) {
          if (err) return next(err)
          else if (!res.finished) res.jsonp(result)
        })
      }) // end saveMessage

    }) // end req on 'end'
  }

  return api
}

function getSuccess(body) { // this function cannot access config
  try {
    var success = JSON.parse(body).success
    //console.log('success: ' + success)
    return success && success != 'false'
  }
  catch (e) {
    log.error('json parse error: ' + e)
  }
  return false
}
