module.exports = function (config) {

  var log = require('../lib/Logger')('route_test', config)
  var db  = require('../lib/db/msg_archive.js')(config)

  return function (req, res, next) {
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
      var start = Date.now()
      db.saveMessage(xml, function (err, msg_info) {
        if (err) return next(err)
        if (!msg_info) return next(Error('missing msg_info'))
        if (msg_info.xml) msg_info.xml = '[suppressed xml of lengh ' + msg_info.xml.length + ']'
        var text = 'Message info saved to archive in ' + (Date.now() - start) + ' ms: ' + msg_info.msg_id + ', modified: ' + new Date(msg_info.modified_ts)
        log.info(text)
        msg_info.post_test_text = text

        //res.jsonp(msg_info)
        populateResponseTemplate(config, msg_info, function (err, resp) {
          if (err) return next(err)
          res.end(resp)
        })
      })
    })
  }

  function populateResponseTemplate(config, msg_info, cb) {
    require('fs').readFile(config.templatePath + '/gdsn31/GS1ResponseACCEPTED.xml', function (err, xml) {
      if (err) return cb(err)
      try {
        var $ = require('cheerio').load(xml, { 
          _:0
          , normalizeWhitespace: true
          , xmlMode: true
        })
        $('sh\\:Sender sh\\:Identifier').text(config.homeDataPoolGln)
        $('sh\\:Receiver sh\\:Identifier').text(msg_info.sender)
        $('sh\\:InstanceIdentifier').text('RESP_' + Date.now() + '_' + msg_info.msg_id)
        $('sh\\:CreationDateAndTime').text(new Date(msg_info.created_ts).toISOString())
        $('sh\\:RequestingDocumentInstanceIdentifier').text(msg_info.msg_id)
        $('originatingMessageIdentifier entityIdentification').text(msg_info.msg_id)
        $('originatingMessageIdentifier contentOwner gln').text(msg_info.sender)
        $('gS1Response receiver').text(msg_info.sender)
        $('gS1Response sender').text(config.homeDataPoolGln)
        $('transactionIdentifier entityIdentification').text('TRX_' + Date.now())
        $('transactionIdentifier contentOwner gln').text(config.homeDataPoolGln)
        cb(null, $.html())
      }
      catch (err) {
        cb(err)
      }
    })


  }

}
