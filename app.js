var express = require('express')
var fs = require('fs')

var Gdsn = require('gdsn')
var gdsn = new Gdsn({ 
  homeDataPoolGln: '1100001011285',
  templatePath: __dirname + '/node_modules/gdsn/templates/'
});

var log = require('./Logger.js')('gdsnApp')
var inboxDir = __dirname + '/msg/inbox/'
var outboxDir = __dirname + '/msg/outbox/'
var app = express()

// mongodb test
var mongojs = require('mongojs');
var db = mongojs('gdsn', ['msg_in', 'msg_out']);

// App Setup
app.configure(function() {
  app.set('port', process.env.PORT || 8080);
  //app.set('views', __dirname + '/views');
  app.use(express.favicon());
  app.use(getCinPostHandler({ test: true }));
  app.use(express.logger('dev'));
  app.use(express.bodyParser());
  app.use(express.methodOverride());
  app.use(express.cookieParser('your secret here'));
  app.use(express.session());
  app.use(app.router);
  app.use(express.static(__dirname + '/public'));
});

app.configure('development', function() {
  app.use(express.errorHandler());
});

// CIN upload form
app.get('/cin', function(req, res) {
  res.render('cin_confirm.ejs', {
    title: 'CIN Upload Form',
    upload: null
  });
});

// CIN upload submit processing
app.post('/cin', function(req, res) {
  //log.debug('Request object: ');
  //log.debug(req);

  var ts = new Date().getTime();
  var cinIn = req.files.cin.path;
  var cinOut = outboxDir + req.files.cin.name + '_forward_' + ts;
  var respOut = outboxDir + req.files.cin.name + '_response_' + ts;

  gdsn.readFile(cinIn, function(err, xml) {
    if (err) {
      res.send(500, err);
      return;
    }
    //var doc = gdsn.getXmlDom(xml);
    gdsn.getXmlDomForString(xml, function(err, doc) {

      // persist to mongodb INBOUND archive
      var info = gdsn.getMessageInfo(doc);
      info.xml = xml;
      info.process_ts = new Date();
      db.msg_in.save(info);

      gdsn.createCinResponse(doc, function(err, respXml) {
        gdsn.writeFile(respOut, respXml, function(err) {
          if (err) {
            log.error(err);
            res.send(500, err);
            return;
          }
        });

        // persist to mongodb OUTBOUND archive
        gdsn.getXmlDomForString(respXml, function(err, $dom) {
          var info = gdsn.getMessageInfo($dom);
          info.xml = respXml;
          info.process_ts = new Date();
          db.msg_out.save(info);
        });
      });

      gdsn.forwardCinFromOtherDP(doc, function(err, cinOutXml) {

        // persist to mongodb OUTBOUND archive
        gdsn.getXmlDomForString(cinOutXml, function(err, $dom) {
          var info = gdsn.getMessageInfo($dom);
          info.xml = cinOutXml;
          info.process_ts = new Date();
          db.msg_out.save(info);
        });

        gdsn.writeFile(cinOut, cinOutXml, function(err) {
          if (err) {
            log.error(err);
            res.send(500, err);
            return;
          }
        });

        log.info('Created CIN forward file: ' + cinOut);
        //log.info('Result: ' + result);
        res.render('cin_confirm.ejs', {
          upload: true,
          title: 'CIN Upload Confirmation',
          cin_filename: req.files.cin.name,
          cin_filesize: (req.files.cin.size / 1024),
          cin_filepath: req.files.cin.path,
          cin_out: cinOut
        });

      });
    });
  });
});

// admin ui api route and default auth response test
app.get('/admin/data.json', function(req, res) {
  res.json({
    authmask: "2097151",
    success: "true"
  });
});

// default snoop home page
app.get('/snoop', getSnoopHandler());

function getSnoopHandler(count) {
  count = count || 0;
  return function(req, res) {
    res.cookie('test_response_cookie', 'some cookie data, count ' + count++);
    req.session.count = count;
    req.session.timestamp = new Date().getTime();
    res.contentType('text/html');
    res.render('snoop.ejs', {
      title: "Node HTTP Snoop",
      req: req,
      res: res
    });
  }
}

function getCinPostHandler(options) {
  options = options || {};
  return function(req, res, next) {
    if ('/post-cin' != req.url) {
      return next();
    }
    var buf = '';
    req.setEncoding('utf8');
    req.on('data', function(chunk) {
      buf += chunk
    });
    req.on('end', function() {
      log.info('Received POST content: ' + buf);
    });
    res.end();
  };
}

app.listen(app.get('port'), process.env.IP);
log.info("Express GDSN server listening on port " + app.get('port'));

// Proof-of-concept: Inbox filesystem watcher
//  log.info("Inbox dir: " + inboxDir);
//  fs.watch(
//      inboxDir, 
//      function (event, filename) {
//          log.info('event is: ' + event + ' for filename ' + filename);
//          if (filename && event == 'change')
//          {
//              fs.stat(filename, function (err, stats) {
//                  if (err) return;
//                  log.info('stats: ' + JSON.stringify(stats));
//              });
//          }
//      }
//  );

