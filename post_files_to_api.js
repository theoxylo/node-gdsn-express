#!/usr/bin/env node

(function () {

  console.dir(process.argv)

  var endsWith = function(str, suffix) {
    return str.indexOf(suffix, str.length - suffix.length) !== -1;
  }

  var path = process.argv[2] || '.'
  console.log('path: ' + path)

  var url = process.argv[3] || 'http://localhost:8080/cs_api/1.0/msg'
  console.log('url: ' + url)

  var fs      = require('fs')
  var request = require('request')

  var files = fs.readdirSync(path)

  files.forEach(function (file) {

    if (endsWith(file, '.xml')) {
    //if (file.match(/\.xml$/)) {

      console.log('processing file: ' + file)
      var xml = fs.readFileSync(path + '/' + file)

      do_post(url, xml, function (err, result) {
        if (err) {
          console.log('post file err: ' + err)
          //process.exit(1)
        }
        console.log('post file result: ' + result)
      })

    } // end file.match occurrence
  }) // end forEach

  function do_post(post_url, xml, cb) {
    var post_options = {
      url: post_url
      , auth: {
          'user': 'test'
          , 'pass': 'testAdmin'
          , 'sendImmediately': true
        }
      , body: xml
    }
    try {
      request.post(post_options, function (err, response, body) {
        if (err) return cb(err)
        cb(null, body)
      })
    }
    catch (err) {
      cb(err)
    }
  }

})()
