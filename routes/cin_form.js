module.exports = function (config) {

  var api = {}

  var log = require('../lib/Logger')('routes_form', {debug: true})

  api.view_cin_from_other_dp_upload_form = function(req, res, next) {
    res.render('cin_confirm', {
      messages: ['Please upload your file'],
      title: 'CIN Upload Form',
      upload: null
    })
  }

  api.post_cin_from_other_dp_upload_form = function (req, res, next) {

    var errorSent = false
    var messages = []

    config.gdsn.readFile(req.files.cin.path, function (err, xml) {
      if (err) return next(err)

      api.process_cin_xml_from_other_dp(req.files.cin.name, xml, function (err, msg) {
        if (errorSent) {
          return
        }
        if (err) {
          errorSent = true
          return next(err)
        }
        if (msg) {
          messages.push(msg)
          return 
        }
        res.render('cin_confirm.ejs', {
          messages: messages,
          upload: true,
          title: 'CIN Upload Confirmation',
          cin_filename: req.files.cin.name,
          cin_filesize: (req.files.cin.size / 1024),
          cin_filepath: req.files.cin.path
        })
      })
    })

  }

  api.process_cin_xml_from_other_dp = function (name, xml, cb) {

    log.info('process_cin_xml_from_other_dp called with name ' + name)

    var ts = Date.now()
    var cinOut  = config.outbox_dir + '/' + name + '_forward_' + ts
    var respOut = config.outbox_dir + '/' + name + '_response_' + ts

    var count = 0
    function done() {
      count++
      console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> done called, count is ' + count)
      if (count == 4) cb()
    }

    config.gdsn.getXmlDomForString(xml, function(err, doc) {
      if (err) return cb(err)

      // persist to mongodb INBOUND collection
      var info = config.gdsn.getMessageInfoForDom(doc)
      info.xml = xml
      info.process_ts = Date() // long date and time stamp

      config.database.saveMessage(info, function (err, id) {
        if (err) return cb(err)
        log.info('Saved CIN submission to db with instance_id: ' + id)

        config.gdsn.createCinResponse(doc, function(err, respXml) {
          if (err) return cb(err)

          log.info("createCinResponse: response xml length: " + respXml.length)

          // persist to file
          config.gdsn.writeFile(respOut, respXml, function(err) {
            if (err) return cb(err)
            log.info('Created CIN response file: ' + respOut)
            done()
          })

          // persist to database
          config.gdsn.getXmlDomForString(respXml, function(err, $dom) {
            if (err) return cb(err)

            var info = config.gdsn.getMessageInfoForDom($dom)
            info.xml = respXml
            info.process_ts = Date()
            config.database.saveMessage(info, function (err, id) {
              if (err) return cb(err)
              log.info('Saved CIN response to db with instance_id: ' + id)
              done()
            })
          })

          cb(null, "Done creating CIN response")
        })

        config.gdsn.forwardCinFromOtherDP(doc, function(err, cinOutXml) {
          if (err) return cb(err)

          log.info("forwardCinFromOtherDP: result xml length: " + cinOutXml.length)

          // persist to file
          config.gdsn.writeFile(cinOut, cinOutXml, function(err) {
            if (err) return cb(err)
            log.info('Created CIN forward file: ' + cinOut)
            done()
          })

          // persist to database
          config.gdsn.getXmlDomForString(cinOutXml, function(err, $dom) {
            if (err) return cb(err)

            var info = config.gdsn.getMessageInfoForDom($dom)
            info.xml = cinOutXml
            info.process_ts = Date()
            config.database.saveMessage(info, function (err, id) {
              if (err) return cb(err)
              log.info('Saved CIN forward to db with instance_id: ' + id)
              done()
            })
          })

          cb(null, 'forwardCinFromOtherDP returning')
        })

        cb(null, 'saveMessage returning')
      })
      cb(null, 'getXmlDomForString returning')
    })

  }

  return api
}
