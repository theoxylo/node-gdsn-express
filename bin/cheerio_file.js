#!/usr/bin/env node

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

      var count = 0
      $('tradeItem > gtin').each(function () {
        count++
        log('found gtin ' + $(this).text())
      })
      log('trade item count: ' + count)

    })
  }

  while (process.argv.length > 2) {
    processFile(process.argv.pop())
  }

})()
