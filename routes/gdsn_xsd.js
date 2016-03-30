var request = require('request')

var log
var config

module.exports = function (x_config) {

  config = x_config
  log    = require('../lib/Logger')('rt_gdsnVld', config)

  var api = {}

  api.post_and_validate = function(req, res, next) { // submit posted msg xml to dp for validation

    var start = Date.now()
    var xml = ''
    req.setEncoding('utf8')
    req.on('data', function (chunk) {
      log.debug('post_and_validate  chunk length: ' + (chunk && chunk.length))
      xml += chunk
      if (xml.length > 10 * 1024 * 1024) next(Error('xml content too big - larger than 10 MB'))
    })
    req.on('end', function () {
      do_validation_post(config.gdsn.trim_xml(xml), function(err, result) {
        log.info('post_and_validate response took ' + (Date.now() - start) + ' ms')
        if (err) return next(err)

        log.debug('post_and_validate result: ' + result)
        if (!res.finished) res.end(result)
      })
    })
  }

  var msg_archive    = require('../lib/db/msg_archive.js')(config)

  api.lookup_and_validate = function(req, res, next) { // fetch existing msg xml and submit to dp
    var start = Date.now()
    var msg_id = req.params.msg_id
    var sender = req.params.sender
    if (!msg_id) { 
      if (!res.finished) res.end('msg_id param is required')
      return
    }
    log.debug('lookup_and_validate will use existing message with id ' + msg_id)
    msg_archive.findMessage(sender, msg_id, function (err, msg) {
      if (err) return next(err)
      var xml = msg.xml || ''
      if (!xml) return next(Error('msg and xml not found for msg_id ' + msg_id))
      log.info('lookup_and_validate xml length from msg archive lookup: ' + xml.length)
      log.info('lookup_and_validate xml archive lookup (db) took ' + (Date.now() - start) + ' ms')
      do_validation_post(xml, function(err, result) {
        log.info('lookup_and_validate response took ' + (Date.now() - start) + ' ms')
        if (err) return next(err)
        if (!res.finished) res.end(result)
      })
    })
  }

  return api

} // end module.exports
    
function do_validation_post(xml, cb) {

  var url = config.url_gdsn_api + '/xmlvalidation' 
  //url += '?bus_vld=true'
  //url += '?bus_vld=' + (config.gdsn_bus_vld ? 'true' : 'false')
  url += '?bus_vld=' + config.gdsn_bus_vld // support custom value like 'bms_only'
  log.info('dp-xsd target url: ' + url)

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
    var start = Date.now()
    request.post(post_options, function (err, response, body) {
      log.info('do_validation_post to GDSN Server took ' + (Date.now() - start) + ' ms')
      if (err) {
        log.error('err in do_validation_post: ' + err)
        return cb(err)
      }
      cb(null, body)
    })
  }
  catch (err) {
    cb(err)
  }
}
