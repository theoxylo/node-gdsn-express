var request = require('request')

module.exports = function (config) {

  var log            = require('../lib/Logger')('rt_gdsn_dp', config)
  var db_msg_archive = require('../lib/db/msg_archive.js')(config)

  var api = {}

  api.lookup_and_send = function(req, res, next) {

    var start = Date.now()

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
      //var url = config.url_gdsn_api + '/outbox' // orig :)
      var filename = (msg.gtin || '999') + '_' + msg_id + '_' + sender + '_' + msg.status
      var url = config.url_gdsn_api + '/outbox?filename=' + encodeURIComponent(filename)
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
      request.post(post_options, function (err, response, body) {
        if (err) return next(err)

        log.debug('response: ' + response)
        log.debug('body    : ' + body)

        if (!res.finished) {
          res.json(body)
          res.end()
        }

      }) // end request.post
    }) // end db_msg.findMessage
  } // end api.lookup_and_send

  // other api methods:
  // api.getInfo = function () {...

  return api
}
