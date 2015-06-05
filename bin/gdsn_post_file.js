#!/usr/bin/env node

(function () {

  console.dir(process.argv)

  var arg_idx = 2

  var url = process.argv[arg_idx++] || 'http://localhost:8080/cs_api/1.0/gdsn-auto'
  console.log('url: ' + url)

  var fs      = require('fs')
  var request = require('request')

  var file = process.argv[arg_idx++]

  while (file) {
    console.log('file: ' + file)

    var xml = fs.readFileSync(file)

    do_post(url, xml, function (err, result) {
      if (err) {
        console.log('post file err: ' + err)
      }
      console.log('post file result: ' + result)
    })
    file = process.argv[arg_idx++]

  } // end while (file)

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
