module.exports = function (config) {

  var api = {}

  var fs = require('fs')
  var log  = require('../lib/Logger')('routes_form', {debug: true})
  var outboxDir = __dirname + '/../msg/outbox/'

  api.view_cin_from_other_dp_upload_form = function(req, res, next) {
    res.render('cin_confirm', {
      messages: ['Please upload your file'],
      title: 'CIN Upload Form',
      upload: null
    })
  }

  api.post_cin_from_other_dp_upload_form = function (req, res, next) {
    var gdsn = config.gdsn
    var database = config.database

    var errorSent = false
    var count = 0
    var messages = []

    var done = function (err, msg) {
      log.info("done called with arg: " + (err ? err : msg))
      if (errorSent) {
        return
      }
      if (err) {
        errorSent = true
        return next(err)
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

        // persist to mongodb INBOUND collection
        var info = gdsn.getMessageInfo(doc)
        info.xml = xml
        info.process_ts = Date() // long date and time stamp

        database.saveMessage(info, function (err, id) {
          if (err) return done(err)
          log.info('Saved CIN submission to db with instance_id: ' + id)

          count++
          gdsn.createCinResponse(doc, function(err, respXml) {
            if (err) return done(err)

            log.info("gdsn.createCinResponse: response xml length: " + respXml.length)

            gdsn.writeFile(respOut, respXml, function(err) {
              if (err) return done(err)
              log.info('Created CIN response file: ' + respOut)
            })

            // persist to mongodb OUTBOUND collection
            gdsn.getXmlDomForString(respXml, function(err, $dom) {
              if (err) return done(err)

              var info = gdsn.getMessageInfo($dom)
              info.xml = respXml
              info.process_ts = Date()
              database.saveMessage(info, function (err, id) {
                if (err) return done(err)
                log.info('Saved CIN response to db with instance_id: ' + id)
              })
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

            // persist to mongodb OUTBOUND collection
            gdsn.getXmlDomForString(cinOutXml, function(err, $dom) {
              if (err) return done(err)

              var info = gdsn.getMessageInfo($dom)
              info.xml = cinOutXml
              info.process_ts = Date()
              database.saveMessage(info, function (err, id) {
                if (err) return done(err)
                log.info('Saved CIN forward to db with instance_id: ' + id)
              })
            })
            done(null, 'forwardCinFromOtherDP returning')
          })

          done(null, 'saveMessage returning')
        })
        done(null, 'getXmlDomForString returning')
      })
      done(null, 'readFile returning')
    })

  }

  return api
}
