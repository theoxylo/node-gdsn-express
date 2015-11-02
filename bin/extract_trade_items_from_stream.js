#!/usr/bin/env node

(function () {

  if (process.argv.length < 3) {
    console.log("usage: node extract_trade_items_from_stream.js cinFile1 cinFile2 ...")
    process.exit(1)
  }

  var fs   = require('fs')
  var Gdsn = require('gdsn')

  var gdsn = new Gdsn({debug:false})
  
  function processFile(filename) {
    console.log('Processing CIN file: ' + filename)
    var is = fs.createReadStream(process.cwd() + '/' + filename, {encoding: 'utf8'})

    var count = 0
    var gtins = []

    var start = Date.now()
    gdsn.getEachTradeItemFromStream(is, function(err, item) {
      if (err) throw err

      if (item) {
        var gtin = item.gtin
        var valid = gdsn.validateGtin(item.gtin)

        count++
        log_item(valid, item, start, count)
        gtins.push(item.gtin)
      }
    })

    is.on('end', function () {
      console.log('stream found ' + count + ' trade items in ' + (Date.now() - start) + ' ms')
    })
  }

  function log_item(valid, item, start, count) {
    if (count == 1) console.log('stream found first item in ' + (Date.now() - start) + ' ms')
    if (!valid) console.log(count + ' ' +
      '>>>>>>>>>>>>>>>>>>>>>> GTIN '  + item.gtin + 
      ' is '   + (valid ? 'valid' : 'invalid') + 
      ' took ' + (Date.now() - start) + ' ms'
    )
    else if (!(count % 1000)) {
      console.log(count+ ' >>> GTIN: '  + item.gtin + ' took ' + (Date.now() - start) + ' ms')
    }
  }

  while (process.argv.length > 2) {
    processFile(/* filename */ process.argv.pop())
  }

})()
