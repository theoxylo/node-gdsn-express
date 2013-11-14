var express = require('express')
var fs = require('fs')

var Gdsn = require('gdsn')
var gdsn = new Gdsn({ 
  homeDataPoolGln: '1100001011285',
  templatePath: __dirname + '/node_modules/gdsn/templates/'
})

var log = require('./Logger.js')('gdsnApp')
log.debug('DEBUG logging enabled')
log.info('INFO logging enabled')

var inboxDir = __dirname + '/msg/inbox/'
var outboxDir = __dirname + '/msg/outbox/'
var app = express()

// mongodb test
var db = null
try {
  db = (function () {
    var mongojs = require('mongojs')
    return mongojs('gdsn', ['msg_in', 'msg_out'])
  })()
}
catch (err) {
  log.error('mongojs not found: ' + err)
  console.log('Error opening mongodb: ')
  console.log(err)
}
log.info('mongo db: ')
log.info(db)
//console.log('mongo db: ' + db)
//console.log(db)

//var mongojs = require('mongojs')
//var db = mongojs('gdsn', ['msg_in', 'msg_out'])

app.set('port', process.env.PORT || 8080)
app.set('views', __dirname + '/views')

// App Setup
app.configure(function() {
  app.use(express.logger('dev'))
  app.use(express.basicAuth(function (user, pass) {
    return 'admin' == user & 'devadmin' == pass;
  }));
  app.use(getCinPostHandler({ test: true }))
  app.use(express.bodyParser())
  app.use(express.methodOverride())
  app.use(express.cookieParser('your secret here'))
  app.use(express.session())
  app.use(app.router)
  app.use(express.static(__dirname + '/public'))
  app.use(express.directory(__dirname + '/public'))
  app.use(express.favicon(__dirname + '/public/favicon.ico'))
})

console.log('env: ' + app.get('env'))

app.configure('development', function() {
  log.info('configuring development environment...')
  app.use(express.errorHandler({showStack: true, dumpExceptions: true}));
})

// API root
app.get('/api', function(req, res) {
  res.json({ 
    gdsn_rest_api_version: "0.0.3", 
    ts: Date.now()
  })
})

// API root
app.get('/api', function(req, res) {
  res.json({ 
    gdsn_rest_api_version: "0.0.3", 
    ts: Date.now()
  })
})

// admin ui api route and default auth response test
app.get('/admin/data.json', function(req, res) {

  var cmd = req.query.req
  log.debug('/admin/data.json command: ' + cmd)
  log.debug(JSON.stringify(req.query))

  if (cmd === 'login') {
    var user = req.query.Username
    var pass = req.query.Password
    log.info('login attempt for user: ' + user + ' (' + pass + ')')

    if (user === 'admin' && pass === 'devadmin') {
      res.json({
        authmask: "2097151",
        success: "true"
      })
      return
    }
    else {
      res.json({
        status: "403",
        success: "false"
      })
      return
    }
  }
  else if (cmd === 'gettip') {
    res.json({
      tip: 'Current server date/time: ' + Date()
    })
  }
  else if (cmd === 'getstatus') {
    res.json({
      state: 20, // server is up
      failed: false
    })
  }
})

app.handleErr = function (err, res) {
  console.log('handleErr: ' + err)
  res.send(500, JSON.stringify(err))
}

// list sent messages
app.get('/api/msg_out', function(req, res) {
  db && db.msg_in.find({}, {xml:0}, function (err, docs) {
    if (err) {
      app.handleErr(err, res)
      return
    }
    res.json(docs);
  })
})

// get xml for specific sent message
app.get('/api/msg_out/id:msg_id', function(req, res) {
  db && db.msg_in.find({}, {xml:0}, function (err, docs) {
    if (err) {
      app.handleErr(err, res)
      return
    }
    res.json({
      ts:       Date.now(),
      messages: docs
    })
  })
})

// CIN upload form
app.get('/cin', function(req, res) {
  res.render('cin_confirm.ejs', {
    messages: ['Please upload your file'],
    title: 'CIN Upload Form',
    upload: null
  })
})

// CIN upload POST submit processing
app.post('/cin', function(req, res) {

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
      app.handleErr(err, res)
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
})

// default snoop home page
app.get('/snoop', getSnoopHandler())

function getSnoopHandler(count) {
  count = count || 0
  return function(req, res) {
    res.cookie('test_response_cookie', 'some cookie data, count ' + count++)
    req.session.count = count
    req.session.timestamp = Date.now()
    res.contentType('text/html')
    res.render('snoop.ejs', {
      title: "Node HTTP Snoop",
      req: req,
      res: res
    })
  }
}

function getCinPostHandler(options) {
  options = options || {}
  return function(req, res, next) {
    if ('/post-cin' != req.url) {
      return next()
    }
    var buf = ''
    req.setEncoding('utf8')
    req.on('data', function(chunk) {
      buf += chunk
    })
    req.on('end', function() {
      log.info('Received POST content: ' + buf)
    })
    res.end()
  }
}

app.listen(app.get('port'), process.env.IP)
log.info("Express GDSN server listening on port " + app.get('port'))

// Proof-of-concept: Inbox filesystem watcher
//  log.info("Inbox dir: " + inboxDir)
//  fs.watch(
//      inboxDir, 
//      function (event, filename) {
//          log.info('event is: ' + event + ' for filename ' + filename)
//          if (filename && event == 'change')
//          {
//              fs.stat(filename, function (err, stats) {
//                  if (err) return
//                  log.info('stats: ' + JSON.stringify(stats))
//              })
//          }
//      }
//  )

