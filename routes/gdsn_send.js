var request = require('request')

module.exports = function (config) {

  var log            = require('../lib/Logger')('rt_gdsn_dp', config)
  var db_msg_archive = require('../lib/db/msg_archive.js')(config)

  var api = {}

  api.lookup_and_send = function(req, res, next) {

    var url = config.url_gdsn_api + '/outbox'
    log.info('dp-outbox target url: ' + url)
    if (!url) return next('post to GDSN not enabled, please set url_gdsn_api if needed')

    var start = Date.now()
    log.info('starting lookup_and_send to dp url ' + url)

    var msg_id = req.params.msg_id
    var sender = req.params.sender
    if (!msg_id) { 
      return res.end('msg_id param is required')
    }
    // fetch existing msg xml and submit to dp
    log.debug('lookup_and_send will use existing message with id ' + msg_id)

    db_msg_archive.findMessage(sender, msg_id, function (err, msg) {
      if (err) return next(err)
      log.debug('found message for msg_id ' + msg_id)
      var xml = msg.xml || ''

      if (!xml) return next(Error('msg xml not found for msg_id ' + msg_id))
      log.info('lookup_and_send xml length from msg archive lookup: ' + xml.length)

      log.info('lookup_and_send xml setup (db) took ' + (Date.now() - start) + ' ms')
      var post_options = {
        //url: url + '/as2_post_' + Date.now()
        url: url
        , auth: {
            'user': 'admin'
            , 'pass': 'devadmin'
            , 'sendImmediately': true
          }
        , body: xml
      }
      request.post(post_options, function (err, response, body) {
        if (err) return next(err)

        log.debug('response: ' + response)
        log.debug('body    : ' + body)

        if (!res.finished) {
          res.json(body)
          res.end()
        }


        // save AS2 send info below not working yet
        /*
        msg.as2 = msg.as2 || []
        msg.as2.push(response)
        db_msg_archive.saveMessageInfo(msg, function (err, msg) {
          if (err) return next(err)
          if (!msg) return next(Error('msg undefined'))
          log.debug('***************** version : ' + msg.version)
          log.debug('***************** xml length : ' + msg.xml && (msg.xml && msg.xml.length))
          if (!res.finished) {
            res.json(msg)
            res.end()
          }
        })
        */

      }) // end request.post
    }) // end db_msg.findMessage
  } // end api.lookup_and_send

  // other api methods:
  // api.getInfo = function () {...

  return api
}
