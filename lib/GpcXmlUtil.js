var fs = require('fs')
var cheerio = require('cheerio')
var saxParser = require('../node_modules/xml-digester/node_modules/sax')

function dom(filename, cb) {

  fs.readFile(filename, 'utf8', function (err, xml) {
    if (err) return cb(err)

    var $ = cheerio.load(xml, {
      normalizeWhitespace: true,
      xmlMode: true
    })

    var node = $('brick').map(function (idx, e) { 
      return {
          code: e.attribs.code
        , name: e.attribs.text
      }
      //var element = $(e)
      //return {
        //code: element.attr('code'),
        //name: element.attr('text')
      //}
    })

    var codes = Array.prototype.slice.call(node, 0)

    var gpc = {}
    codes.forEach(function (e) {
      gpc[e.code] = e.name
    })

    cb(null, gpc)
  })

}

function sax(filename, cb) {
  var strict = true
  var options = { 
    xmlns: true 
    , trim: true
    , normalize: true
  }
  var saxStream = saxParser.createStream(strict, options)
  var gpc = {}
  saxStream.on('error', function (err) {
    return cb(err)
    //this._parser.error = null
    //this._parser.resume()
  })
  saxStream.on('opentag', function (node) { 
    if (node.name == 'brick') {
      //console.log('brick code: ' + node.attributes.code.value)
      //console.log('brick text: ' + node.attributes.text.value)
      gpc[node.attributes.code.value] = node.attributes.text.value
    }
  })
  saxStream.on('end', function () { 
    cb(null, gpc)
  })
  fs.createReadStream(filename, {encoding: 'utf8'}).pipe(saxStream)
}

module.exports = {
  dom: dom,
  sax: sax
}
