#!/usr/bin/env node

"use strict";

(function () {
     
  var log = console.log

  if (process.argv.length < 3) {
    console.log("usage: node cheerio_file.js cinFile1 cinFile2 ...")
    process.exit(1)
  }

  var fs      = require('fs')
  var cheerio = require('cheerio')

  var processFile = function (filename) {
    console.log('Processing file: ' + filename)
    var start = Date.now()

    fs.readFile(filename, 'utf8', function (err, content) {
      if (err) throw err
      console.log('found content-length: ' + content.length)

      var $ = cheerio.load(content, {
        _:0
        , normalizeWhitespace: true
        , xmlMode: true
      })

      { // block scope
	let count = 0
	$('tradeItem > gtin').each(function () {
	  count++
	  log('found gtin ' + $(this).text())
	})
	log('trade item count: ' + count) // count defined in block scope only
      }
      //log('trade item count: ' + count) // ReferenceError: count is not defined
                                          // not the same as "undefined" value
      // can't even do if (count):
      //if (count) log('count!')
      //    ^
      // ReferenceError: count is not defined


      var sdps = []
      $('sourceDataPool').each(function () {
        let sdp = $(this).text()
        console.log('sdp ' + sdp)
        if (sdps.indexOf(sdp) == -1) sdps.push(sdp)
        if (sdps.length != 1) throw Error('sdp not allowed to vary per file')
      })

    })
  }

  while (process.argv.length > 2) {
    processFile(process.argv.pop())
  }

})()
