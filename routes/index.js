var log  = require('../lib/Logger')('routes', {debug: true})

exports.getSnoopHandler = function (count) {
  count = count || 0
  return function(req, res, next) {
    count++
    res.cookie('test_response_cookie', 'some cookie data, count ' + count)
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

// this is a test of xml canonicalization using the xml-c14n module from npm
exports.getXmlC14Handler = function (config) {
  var c14n = null
  try {
                      c14n = require("xml-c14n")()
  }
  catch (e) {
                      log.warn('Could not load module xml-c14n, route disabled')
  }

  var canonicaliser = c14n && c14n.createCanonicaliser("http://www.w3.org/2001/10/xml-exc-c14n#WithComments")

  return function(req, res, next) {
    log.info('XmlC14Handler called')

    if (!c14n) return next({message: "xml-c14n module not found - route disabled"})

    var content = ''
    req.setEncoding('utf8')
    req.on('data', function (chunk) {
      content += chunk
    })
    req.on('end', function () {
      log.info('c14 content length: ' + (content ? Buffer.byteLength(content) : 0))

      config.gdsn.getXmlDomForString(content, function (err, $dom) {
        if (err) next(err)

        canonicaliser.canonicalise($dom.documentElement, function(err, result) {
          if (err) return next(err)

          log.info('result type: ' + result.constructor.name)
          log.info('canonical result length: ' + (result ? Buffer.byteLength(result) : 0))

          config.gdsn.writeFile('c14_out.xml', result, function(err) {
            if (err) throw err
          })

          res.end('all done')
        });
      })
    })
  }
}
