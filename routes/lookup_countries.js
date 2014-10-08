exports.getRequestHandler = function (config) {

  var log  = require('../lib/Logger')('lookup_countries', config)

  var countries = {
    // by [lang][code]
      "en": {124: "Canada"       , 250: "France"       , 840: "United States"}
    , "es": {124: "Canadá"       , 250: "Francia"      , 840: "Estados Unidos"}
    , "fr": {124: "Canada"       , 250: "France"       , 840: "États-Unis d'Amérique"}

    // by [code][lang]
    //  "124": {en: "Canada"       , es: "Canadá"        , fr: "Canada"}
    //, "250": {en: "France"       , es: "Francia"       , fr: "France"}
    //, "840": {en: "United States", es: "Estados Unidos", fr: "États-Unis d'Amérique"}
  }

  return function(req, res, next) {
    log.debug('lookup_countries query: ' + req.query)
    if (req.url.indexOf('?') < 0) {
      return res.render('lookup_country_api_docs_10')
    }
    var code = req.param('code')
    var lang = req.param('lang') || 'en'
    var result = {
        lang: lang
      , timestamp: Date.now()
      , href: req.url
    }
    if (code) {
      result.countries = {}
      result.countries[code] = countries[lang][code] || 'n/a'
    }
    else {
      result.countries = countries[lang]
    }
    log.info(result)

    res.jsonp(result)
    res.end
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
