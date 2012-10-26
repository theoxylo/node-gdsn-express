var express = require('express')
  , log = console.log
  , fs = require('fs')
  , gdsn = require('gdsn')
  ;

var inboxDir = __dirname + '/msg/inbox/';
var outboxDir = __dirname + '/msg/outbox/';
var app = express();

app.configure(function() {
  app.set('port', process.env.PORT || 3000);
  //app.set('views', __dirname + '/views');
  app.use(express.favicon());
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
  res.send('<p>Please select the inbound CIN (from other data pool) to process:</p>'
    + '<form method="post" enctype="multipart/form-data">'
    + '<p>File: <input type="file" name="cin" /></p>'
    + '<p><input type="submit" value="Upload" /></p>'
    + '</form>');
});
// CIN upload submit processing
app.post('/cin', function(req, res) {
    log('Request object: ');
    log(req);

    var cinIn = req.files.cin.path;
    var cinOut = outboxDir + req.files.cin.name;
    gdsn.readXmlFile(cinIn, function (err, xml) {
        if (err) {
            res.send(500, err);
            return;
        }
        var modXml = gdsn.processCinFromOtherDP(xml);
        gdsn.writeXmlFile(cinOut, modXml);
    });

    res.render('cin_confirm.ejs', { 
        title: 'CIN Upload Confirmation',
        cin_filename: req.files.cin.name,
        cin_filesize: (req.files.cin.size / 1024 | 0),
        cin_filepath: req.files.cin.path,
        cin_out: cinOut
    });
});

// admin ui api route and default auth response test
app.get('/admin/data.json', function(req, res) {
    res.json({ authmask: "2097151", success: "true" });
});

// ejs test with function factory (closure) approach
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

app.listen(app.get('port'));
console.log("Express GDSN server listening on port " + app.get('port'));

// Proof-of-concept: Inbox filesystem watcher
/*
log("Inbox dir: " + inboxDir);
fs.watch(
    inboxDir, 
    function (event, filename) {
        console.log('event is: ' + event + ' for filename ' + filename);
        if (filename && event == 'change')
        {
            fs.stat(filename, function (err, stats) {
                if (err) return;
                console.log('stats: ' + JSON.stringify(stats));
            });
        }
    }
);
*/

