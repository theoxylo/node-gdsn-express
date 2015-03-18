var request = require('request')

module.exports = function (config) {

  var log            = require('../lib/Logger')('rt_gdsn_dp', config)
  var msg_archive_db = require('../lib/db/msg_archive.js')(config)

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
    msg_archive_db.findMessage(sender, msg_id, function (err, db_msg_info) {
      if (err) return next(err)
      if (db_msg_info.length > 1) return next(Error('found multiple messages with id ' + msg_id))
      log.debug('found message for msg_id ' + msg_id)
      var xml = db_msg_info[0].xml

      if (!xml) return next(new Error('msg and xml not found for msg_id ' + msg_id))
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
      try {
        request.post(post_options, function (err, response, body) {
          if (err) return next(err)
          log.info('lookup_and_send response took ' + (Date.now() - start) + ' ms')
          res.end(body)
        })
      }
      catch (err) {
        return next(err)
      }
    })
  }

  return api
}
