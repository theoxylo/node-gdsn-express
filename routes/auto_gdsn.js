var async   = require('async')
var request = require('request')

module.exports = function (config) {

  var log            = require('../lib/Logger')('rt_msg_arch', {debug: true})
  var utils          = require('../lib/utils.js')(config)
  var db_msg_archive = require('../lib/db/msg_archive.js')(config)
  var gdsn_workflow_msg  = require('./gdsn_workflow_msg.js')(config)

  var api = {}

  api.process = function (req, res, next) {
    log.debug('>>>>>>>>>>>>>>>>>>>> process message  handler called')

    var xml = ''
    req.setEncoding('utf8')
    req.on('data', function (chunk) {
      log.debug('archive_post_chunk.length: ' + (chunk && chunk.length))
      xml += chunk
      if (xml.length > 10 * 1024 * 1024 && !res.finished) res.end('msg.xml too big - larger than 10 MB')
    })

    req.on('end', function () {

      log.info('Received msg.xml of length ' + (xml && xml.length || '0'))
      db_msg_archive.saveMessage(xml, function (err, msg_info) {
        if (err) return next(err)
        log.info('Message info saved to archive: ' + msg_info.msg_id + ', modified: ' + new Date(msg_info.modified_ts))

        try {
          request.post({
            url: config.url_gdsn_api + '/xmlvalidation?bus_vld=true'
            , auth: {
                'user': 'admin'
                , 'pass': 'devadmin'
                , 'sendImmediately': true
              }
            , body: xml
            }, function (err, response, body) {

            log.debug('body: ' + body)

            if (err) return next(err)
 
            gdsn_workflow_msg.process(msg_info, 'DEFAULT', function (err, result) {
              if (err) return next(err)
              if (!res.finished) res.end(result)
            })

          })
        }
        catch (err) {
          return next(err)
        }

      })
    })
  }

  return api
}
