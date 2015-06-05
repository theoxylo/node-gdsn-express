#!/usr/bin/env node

(function () {

  console.dir(process.argv)

  var endsWith = function(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
  }

  var file = process.argv[2] || '.'
  console.log('file: ' + file)

  var url = process.argv[3] || 'http://localhost:8080/cs_api/1.0/gdsn-workflow'
  console.log('url: ' + url)

  var fs      = require('fs')
  var request = require('request')

  console.log('processing file: ' + file)
  var list = fs.readFileSync(file)
  var lines = String(list).split(/\s/)


  lines.forEach(function (line) {

    if (!line) return

    do_get(url + '/' + line, function (err, result) {
      if (err) {
        console.log('workflow err: ' + err)
      }
      console.log('workflow result: ' + result)
    })

  }) // end forEach

  function do_get(url, cb) {
    var options = {
      url: url
      , auth: {
          'user': 'test'
          , 'pass': 'testAdmin'
          , 'sendImmediately': true
        }
    }
    try {
      request.get(options, function (err, response, body) {
        if (err) return cb(err)
        cb(null, body)
      })
    }
    catch (err) {
      cb(err)
    }
  }

})()
