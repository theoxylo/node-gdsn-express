var express = require('express');
var fs = require('fs');

var Gdsn = require('gdsn');
var gdsn = new Gdsn({ 
  homeDataPoolGln: '1100001011285',
  templatePath: __dirname + '/node_modules/gdsn/templates/'
});

var log = console.log;
var inboxDir = __dirname + '/msg/inbox/';
var outboxDir = __dirname + '/msg/outbox/';
var app = express();

// App Setup
app.configure(function() {
  app.set('port', process.env.PORT || 3000);
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
  //log('Request object: ');
  //log(req);

  var ts = new Date().getTime();
  var cinIn = req.files.cin.path;
  var cinOut = outboxDir + req.files.cin.name + '_forward_' + ts;
  var respOut = outboxDir + req.files.cin.name + '_response_' + ts;

  gdsn.readXmlFile(cinIn, function(err, xml) {
    if (err) {
      res.send(500, err);
      return;
    }
    var doc = gdsn.getDocForXml(xml);
    gdsn.createCinResponse(doc, function(err, respXml) {
      gdsn.writeXmlFile(respOut, respXml, function(err, result) {
        if (err) {
          log('Error: ' + err);
          res.send(500, err);
          return;
        }
        log('Created CIN response file: ' + respOut);
      });
      gdsn.forwardCinFromOtherDP(doc, function(err, cinOutXml) {
        gdsn.writeXmlFile(cinOut, cinOutXml, function(err, result) {
          if (err) {
            log('Error: ' + err);
            res.send(500, err);
            return;
          }
          log('Created CIN forward file: ' + cinOut);
          log('Result: ' + result);
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
});

// admin ui api route and default auth response test
app.get('/admin/data.json', function(req, res) {
  res.json({
    authmask: "2097151",
    success: "true"
  });
});

// default snoop home page
app.get('/', getSnoopHandler());

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
      log('Received POST content: ' + buf);
    });
    res.end();
  };
}

app.listen(app.get('port'), process.env.IP);
log("Express GDSN server listening on port " + app.get('port'));

// Proof-of-concept: Inbox filesystem watcher
//  log("Inbox dir: " + inboxDir);
//  fs.watch(
//      inboxDir, 
//      function (event, filename) {
//          console.log('event is: ' + event + ' for filename ' + filename);
//          if (filename && event == 'change')
//          {
//              fs.stat(filename, function (err, stats) {
//                  if (err) return;
//                  console.log('stats: ' + JSON.stringify(stats));
//              });
//          }
//      }
//  );

