(function () {

  var log = require('../lib/Logger')('routes', {debug: true})

  var Gdsn = require('gdsn')
  var gdsn = new Gdsn({
    homeDataPoolGln: '1100001011285'
    //, templatePath: __dirname + '/node_modules/gdsn/templates/'
  })

  var outboxDir = __dirname + '/../msg/outbox/'

  var fs = require('fs')

  //var db_config = { url: 'gdsn'}
  //var db_config = { url: 'plt-elas01.itradenetwork.com,plt-elas02.itradenetwork.com,plt-elas03.itradenetwork.com'}
  //var db_config = { url: 'mongodb://plt-elas01.itradenetwork.com,plt-elas02.itradenetwork.com,plt-elas03.itradenetwork.com'}
  // works!:
  var db_config = { url: 'mongodb://plt-elas01.itradenetwork.com'}

  var db = require('../lib/Database')(db_config)

  exports.list_messages = function(req, res, next) {
    log.debug('list_messages')
    db.msg_in.find({}, {xml:0}, function (err, docs) {
      if (err) return next(err)
      res.json(docs);
    })
  }

  exports.find_message = function(req, res, next) {
    log.debug('find_message')
    var msg_id = req.params.msg_id
    log.debug('find_message called with msg_id ' + msg_id)
    db.msg_in.find({id: msg_id}, {xml: 1}, function (err, docs) {
      if (err) return next(err)
      var xml = (docs && docs[0] && docs[0].xml) 
        || '<info>xml content not populated<info>'
      res.set('Content-Type', 'text/xml')
      res.send(xml)
    })
  }

  // this snoop export is a factory function that should be called when creating the route
  exports.getSnoopHandler = function getSnoopHandler(count) {
    count = count || 0
    return function(req, res, next) {
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
  exports.view_cin_upload_form = function(req, res, next) {
    res.render('cin_confirm', {
      messages: ['Please upload your file'],
      title: 'CIN Upload Form',
      upload: null
    })
  }

  exports.post_cin_upload_form = function(req, res, next) {

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
        db.msg_in.save(info)
        log.info('Saved CIN submission to db with instance_id: ' + info.id)

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
            db.msg_out.save(info)

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

          // persist to mongodb OUTBOUND collection
          gdsn.getXmlDomForString(cinOutXml, function(err, $dom) {
            if (err) return done(err)

            var info = gdsn.getMessageInfo($dom)
            info.xml = cinOutXml
            info.process_ts = Date()
            db.msg_out.save(info)

            log.info('Saved CIN forward to db with instance_id: ' + info.id)
          })
          done(null, "Done creating CIN forward")
        })
        done(null, "Done parsing uploaded XML to DOM")
      })
      done(null, "Done reading uploaded file")
    })
  }

  exports.post_archive = function(req, res, next) {
    var content = ''
    req.setEncoding('utf8')
    req.on('data', function (chunk) {
      log.debug('archive_post_chunk: ' + chunk)
      content += chunk
      if (content.length > 10 * 1000 * 1000) return res.end('content too big - larger than 10 MB')
    })
    req.on('end', function () {
      log.info('Received POST content of length ' + (content && content.length || '0'))
      log.debug('Received POST content: ' + content)

      var ts = Date.now()

      var tagName = 'InstanceIdentifier'
      var matches = content.match(RegExp(tagName + '>([^<.]*)'))
      var id = (matches && matches[1]) || 'id_' + ts
      log.info('posted instance id: ' + id)

      var info = {
        archive_ts    : ts
        , instance_id : id
        , content     : content
        , preview     : content && content.slice(0, 100)
        , content_type: req.headers['content-type']
      }
      db.archive.save(info)
      res.end('post content archive with ts ' + info.archive_ts)
    })
  }

  exports.list_archive = function(req, res, next) {
    log.debug('list_archive')
    db.archive.find({}, {content:0}, function (err, docs) {
      if (err) return next(err)
      res.json(docs);
    })
  }

  exports.find_archive = function(req, res, next) {
    log.debug('find_archive params ' + req.params)
    var archive_id = req.params.archive_id
    log.debug('find_message called with archive_id ' + archive_id)
    db.archive.find({instance_id: archive_id}, {content: 1}, function (err, docs) {
      if (err) return next(err)
      res.json(docs && docs[0] && docs[0].content);
    })
  }

  return exports

})()
