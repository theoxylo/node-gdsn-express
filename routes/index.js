(function () {

var log = require('../lib/Logger')('routes')

var Gdsn = require('gdsn')
var gdsn = new Gdsn({ 
  homeDataPoolGln: '1100001011285'
  //, templatePath: __dirname + '/node_modules/gdsn/templates/'
})

var outboxDir = __dirname + '/../msg/outbox/'

var fs = require('fs')

var db = require('../lib/Database')

var handleErr = function (err, res) {
  log.info('handleErr: ' + err)
  res.send(500, JSON.stringify({ error: err }))
}

exports.list_messages = function(req, res) {
  db && db.msg_in.find({}, {xml:0}, function (err, docs) {
    if (err) {
      handleErr(err, res)
      return
    }
    res.json(docs);
  })
}

exports.find_message = function(req, res) {
  db && db.msg_in.find({}, {xml:0}, function (err, docs) {
    if (err) {
      handleErr(err, res)
      return
    }
    res.json({
      ts:       Date.now(),
      messages: docs
    })
  })
}

// this snoop export is a factory function that should be called when creating the route
exports.getSnoopHandler = function getSnoopHandler(count) {
  count = count || 0
  return function(req, res) {
    res.cookie('test_response_cookie', 'some cookie data, count ' + count++)
    req.session.count = count
    req.session.timestamp = Date.now()
    res.contentType('text/html')
    res.render('snoop', {
      title: "Node HTTP Snoop",
      req: req,
      res: res
    })
  }
}

// this one is not a factory and should just be referenced
exports.view_cin_upload_form = function(req, res) {
  res.render('cin_confirm', {
    messages: ['Please upload your file'],
    title: 'CIN Upload Form',
    upload: null
  })
}

exports.post_cin_upload_form = function(req, res) {

  var sent500 = false
  var count = 0
  var messages = []
  var done = function (err, msg) {
    log.info("done called with arg: " + (err ? err : msg))
    if (err && sent500) {
      return
    }
    if (err) {
      sent500 = true
      handleErr(err, res)
      return
    }
    if (msg) messages.push(msg)
    if (--count == 0) {
      res.render('cin_confirm.ejs', {
        messages: messages,
        upload: true,
        title: 'CIN Upload Confirmation',
        cin_filename: req.files.cin.name,
        cin_filesize: (req.files.cin.size / 1024),
        cin_filepath: req.files.cin.path,
        cin_out: cinOut
      })
    }
  }

  var ts = Date.now()
  var cinIn = req.files.cin.path
  var cinOut = outboxDir + req.files.cin.name + '_forward_' + ts
  var respOut = outboxDir + req.files.cin.name + '_response_' + ts

  count++
  fs.readFile(cinIn, 'utf-8', function (err, xml) {
    if (err) return done(err)

    count++
    gdsn.getXmlDomForString(xml, function(err, doc) {
      if (err) return done(err)

      // persist to mongodb INBOUND archive
      var info = gdsn.getMessageInfo(doc)
      info.xml = xml
      info.process_ts = Date() // long date and time stamp
      db && db.msg_in.save(info)
      log.info('Saved CIN submissiont to db with instance_id: ' + info.id)

      count++
      gdsn.createCinResponse(doc, function(err, respXml) {
        if (err) return done(err)

        log.info("gdsn.createCinResponse: response xml length: " + respXml.length)

        gdsn.writeFile(respOut, respXml, function(err) {
          if (err) return done(err)
          log.info('Created CIN response file: ' + respOut)
        })

        // persist to mongodb OUTBOUND archive
        gdsn.getXmlDomForString(respXml, function(err, $dom) {
          if (err) return done(err)

          var info = gdsn.getMessageInfo($dom)
          info.xml = respXml
          info.process_ts = Date()
          db && db.msg_out.save(info)

          log.info('Saved CIN response to db with instance_id: ' + info.id)
        })
        done(null, "Done creating CIN response")
      })

      count++
      gdsn.forwardCinFromOtherDP(doc, function(err, cinOutXml) {
        if (err) return done(err)

        log.info("gdsn.forwardCinFromOtherDP: result xml length: " + cinOutXml.length)

        gdsn.writeFile(cinOut, cinOutXml, function(err) {
          if (err) return done(err)
          log.info('Created CIN forward file: ' + cinOut)
        })

        // persist to mongodb OUTBOUND archive
        gdsn.getXmlDomForString(cinOutXml, function(err, $dom) {
          if (err) return done(err)

          var info = gdsn.getMessageInfo($dom)
          info.xml = cinOutXml
          info.process_ts = Date()
          db && db.msg_out.save(info)

          log.info('Saved CIN forward to db with instance_id: ' + info.id)
        })
        done(null, "Done creating CIN forward")
      })
      done(null, "Done parsing uploaded XML to DOM")
    })
    done(null, "Done reading uploaded file")
  })
}

return exports

})()
