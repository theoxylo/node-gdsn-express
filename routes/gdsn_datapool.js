var request        = require('request')

module.exports = function (config) {

  //var _              = require('underscore')
  var async          = require('async')

  var log            = require('../lib/Logger')('rt_gdsn_dp', config)
  var msg_archive_db = require('../lib/db/msg_archive.js')(config)

  var api = {}

  api.lookup_and_post_to_gdsn = function(req, res, next) {
    var url = config.dp_post_url
    log.info('dp-post target url: ' + url)
    if (!url) return next('post to GDSN not enabled, please set dp_post_url if needed')

    var start = Date.now()
    log.info('starting lookup_and_post_to_gdsn to dp url ' + url)

    var msg_id = req.params.msg_id
    if (msg_id) { // fetch existing msg xml and submit to dp
      log.debug('lookup_and_post_to_gdsn will use existing message with id ' + msg_id)
      msg_archive_db.findMessage(msg_id, function (err, messages) {
        if (err) return next(err)
        log.debug('found ' + (messages ? messages.length : 0) + ' messages for msg_id ' + msg_id)
        var xml = messages && messages[0] && (messages[0].raw_xml || messages[0].xml)
        if (!xml) return next(new Error('msg and xml not found for msg_id ' + msg_id))
        log.info('lookup_and_post_to_gdsn xml length from msg archive lookup: ' + xml.length)
        log.info('lookup_and_post_to_gdsn xml setup (db) took ' + (Date.now() - start) + ' ms')
        do_post(url, xml, function(err, post_response) {
          if (err) return next(err)
          res.end(post_response)
          if (!res.finished) res.end(post_response)
          log.info('lookup_and_post_to_gdsn response took ' + (Date.now() - start) + ' ms')
        })
      })
    }
    else {
      if (!res.finished) res.end('msg_id param is required')
    }
  }

  api.post_to_gdsn = function(req, res, next) {
    var url = config.dp_post_url
    log.info('dp-post target url: ' + url)
    if (!url) return next('post to GDSN not enabled, please set dp_post_url if needed')

    var start = Date.now()
    log.info('starting post_to_gdsn to dp url ' + url)

    // read posted content and submit to dp
    var xml = ''
    req.setEncoding('utf8')
    req.on('data', function (chunk) {
      log.debug('dp-post chunk.length: ' + (chunk && chunk.length))
      xml += chunk
      if (xml.length > 5 * 1000 * 1000) return res.status(500).end('msg xml too big - larger than 5MB')
    })
    req.on('end', function () {
      log.info('post_to_gdsn xml length from post: ' + xml.length)
      log.info('post_to_gdsn xml setup (post) took ' + (Date.now() - start) + ' ms')
      xml = config.gdsn.trim_xml(xml)
      do_post(url, xml, function(err, post_response) {
        if (err) return next(err)
        res.end(post_response)
        log.info('post_to_gdsn response took ' + (Date.now() - start) + ' ms')
      })
    })
  }

  return api
}
    
function do_post(url, xml, cb) {
  var post_options = {
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
      if (err) return cb(err)
      cb(null, body)
    })
  }
  catch (err) {
    cb(err)
  }
}
