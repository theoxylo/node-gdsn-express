module.exports = function (config) {

  var async = require('async')
  var log = require('../lib/Logger')('route_test', config)
  var msg_archive_db  = require('../lib/db/msg_archive.js')(config)
  var POST = 'POST'
  
  function logOwn(label, obj) {
    if (label) console.log('Obj label: ' + label)
    for (var prop in obj) if (obj.hasOwnProperty(prop)) console.log('Obj prop "' + prop + '": ' + obj[prop])
  }
    
  return function (req, res, next) {

    if (req.method != POST) {
      var msg_id = req.params.msg_id
      if (msg_id) { // fetch existing msg xml and submit to dp
        log.debug('gdsn-wf will use existing message with id ' + msg_id)
        msg_archive_db.findMessage(msg_id, function (err, results) {
          if (err) return next(err)
          do_gdsn_workflow(results, res, next)
        })
      }
      else {
        res.end('msg_id param is required')
      }
      return
    }

    log.debug('>>> post_test route handler called with path ' + req.path)
    var xml = ''
    req.setEncoding('utf8')
    req.on('data', function (chunk) {
      log.debug('archive_post_chunk.length: ' + (chunk && chunk.length))
      xml += chunk
      if (xml.length > 10 * 1000 * 1000) return res.jsonp({msg: 'msg xml too big - larger than 10 MB'})
    })
    req.on('end', function () {
      log.info('Received msg xml POST of length ' + (xml && xml.length || '0'))
      msg_archive_db.saveMessage(xml, function (err, results) {
        if (err) return next(err)
        do_gdsn_workflow(results, res, next)
      }) 
    })
  }

  function do_gdsn_workflow(msg_info, res, next) {
    if (Array.isArray(msg_info)) msg_info = msg_info[0]
    if (!msg_info || !msg_info.msg_id) return next(Error('missing msg_info'))

    if (msg_info.receiver != config.homeDataPoolGln) return next(Error('to initiate workflow, the message receiver must be the datapool'))

    log.info('starting workflow for ' + msg_info.msg_id + ', modified: ' + new Date(msg_info.modified_ts))

    var tasks = []

    // all non-response messages will require a response to be generated
    if (msg_info.msg_type != 'GDSNResponse') {
      tasks.push(function (cb) {
        config.gdsn.populateResponseTemplate(config, msg_info, function (err, dp_response) {
          if (err) return cb(err)
          console.log(dp_response)
          cb(null, dp_response)
        })
      })
    }

    // each message type may or may not have additional downstream messages that we can generate
    if (msg_info.msg_type == 'basicPartyRegistration') {
      tasks.push(function (cb) {
        config.gdsn.populateBprToGrTemplate(config, msg_info, function (err, cis_to_gr) {
          if (err) return cb(err)
          console.log(cis_to_gr)
          cb(null, cis_to_gr)
        })
      })
    }
    if (msg_info.msg_type == 'catalogueItemNotification') {
      tasks.push(function (cb) {
        config.gdsn.populateRciToGrTemplate(config, msg_info, function (err, cis_to_gr) {
          if (err) return cb(err)
          console.log(cis_to_gr)
          cb(null, cis_to_gr)
        })
      })
    }
    if (msg_info.msg_type == 'catalogueItemPublication') {
      // only a response to local TP is needed, no further messages
    }
    if (msg_info.msg_type == 'catalogueItemSubscription') {
      tasks.push(function (cb) {
        config.gdsn.populateCisToGrTemplate(config, msg_info, function (err, cis_to_gr) {
          if (err) return cb(err)
          console.log(cis_to_gr)
          cb(null, cis_to_gr)
        })
      })
    }
    if (msg_info.msg_type == 'catalogueItemConfirmation') {
      tasks.push(function (cb) {
        config.gdsn.populateCicTemplate(config, msg_info, function (err, cis_to_gr) {
          if (err) return cb(err)
          console.log(cis_to_gr)
          cb(null, cis_to_gr)
        })
      })
    }
    if (msg_info.msg_type == 'requestForCatalogueItemNotification') {
    }

    async.parallel(tasks, function (err, results) {
      if (err) return next(err)
      results.forEach(function (result) {
        res.write(result)
      })
      res.end('done with ' + tasks.length + ' tasks for message type ' + msg_info.msg_type)
    })
  }
}
