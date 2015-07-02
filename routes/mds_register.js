var async   = require('async')
var request = require('request')

var log
var config

module.exports = function (x_config) {
  
  config = x_config
  log           = require('../lib/Logger')('rt_cin', config)
  var trade_item_db = require('../lib/db/trade_item.js')(config)

  var api = {}
    
  api.register_saved_trade_items = function (req, res, next) {
    log.debug('>>>>>>>>>>>>>>>>>>>> gdsn register saved items handler called')

    var provider = req.params.provider
    if (!provider) { 
      return next(Error('provider gln is required'))
    }

    var content = ''
    req.setEncoding('utf8')
    req.on('data', function (chunk) {
      log.debug('mds_post_chunk length: ' + (chunk && chunk.length))
      content += chunk
      if (content.length > 10 * 1024 * 1024 && !res.finished) res.end('content too big - larger than 10 MB')
    })

    req.on('end', function () {

      var items = []
      try {
        log.info('Received content of length ' + (content && content.length || '0'))

        var body = JSON.parse(content)
        console.log('parsed:')
        console.dir(body)

        items = body.items.map(function (item) {
          item.recipient = config.homeDataPoolGln
          item.provider = provider
          if (!item.tm_sub) item.tm_sub = 'na'
          return item
        })
      }
      catch (err) {
        next(err)
      }

      register_items(trade_item_db, items, function (err, results) {
        log.debug('parallel item register from JSON-lookup results count: ' + results && results.length)
        if (err) return next(err)
        if (!results || !results.length) return next(Error('no results'))

        var error_count = 0
        results.forEach(function (result) { 
          if (!result.success) error_count++
        })
        if (!res.finished) {
          res.jsonp({error_count: error_count, provider: provider, results: results})
          res.end()
        }
      }) // end register_items
    }) // end req.on('end'
  }

  api.register_trade_items = function (req, res, next) {

    log.debug('register_trade_items req.path: ' + req.url)

    var xml = ''
    req.setEncoding('utf8')
    req.on('data', function (chunk) {
      log.debug('register_trade_item_chunk.length: ' + (chunk && chunk.length))
      xml += chunk
      if (xml.length > 10 * 1024 * 1024 && !res.finished) res.end('msg.xml too big - larger than 10 MB')
    })

    req.on('end', function () {
      log.info('Received msg.xml of length ' + (xml && xml.length || '0'))
      var msg = config.gdsn.get_msg_info(xml)
      log.info('msg_info: ' + JSON.stringify(msg))

      register_items(msg.data, function (err, results) {
        log.debug('parallel item register from XML results count: ' + results && results.length)
        if (err) return next(err)
        if (!results || !results.length) return next(Error('no results'))

        var error_count = 0
        results.forEach(function (result) { 
          if (!result.success) error_count++
        })
        if (!res.finished) {
          res.jsonp({error_count: error_count, results: results})
          res.end()
        }
      }) // end register_items
    }) // end req.on('end') callback
  } // end api.register_trade_items 

  api.get_registered_items = function (req, res, next) {
    var provider = req.params.provider || ''
    if (!provider) { 
      return next(Error('provider gln is required'))
    }
    var gtin = req.params.gtin || ''

    var url = config.url_gdsn_api + '/tradeItemList?gln=' + provider
    if (gtin) { 
      log.debug('fetching item data for provider ' + provider + ', gtin ' + gtin)
      url += '&gtin=' + gtin
    }
    else {
      log.debug('fetching all item data for provider ' + provider)
    }

    var start_get_reg_list = Date.now()
    request.get({
      url   : url + '&ts=' + Date.now()
      , auth: {
          user: 'admin'
          , pass: 'devadmin'
          , sendImmediately: true
      }
    }, 
    function (err, response, body) {
      log.info('get item list api call took ' 
        + (Date.now() - start_get_reg_list ) 
        + ' ms with response: '
        + (response ? response.statusCode : 'NO_RESPONSE')
        + ', body: '
        + body)

      if (err || response.statusCode != '200') next(Error('failed with status code ' + response.statusCode))

      if (!res.finished) {
        res.send(body)
        res.end()
      }
    }) // end request.get
    log.debug('get item list request initiated')
  }// end get_registered_list

  return api
}

function register_items(trade_item_db, item_list, callback) {
  var tasks = []
  item_list.forEach(function (item) {
    tasks.push(function (task_done) {
      register_item(trade_item_db, item, task_done)
    }) // end tasks.push
  }) // end msg.data.forEach item
  async.parallel(tasks, callback, 5) // concurrency
}

function register_item(trade_item_db, item_shell, task_done) {

  console.log('item shell: ' + (item_shell && item_shell.gtin))

  trade_item_db.findTradeItemFromItem(item_shell, function (err, item) {

    if (err) return task_done(err)

    log.debug('trade item data gtin: ' + item.gtin)
    log.debug('trade item data brand: ' + item.brand)

    var start = Date.now()

    var start_cin_api_call = Date.now()
    log.debug('posting item data for gtin  ' + item.gtin)

    var form_data = {
        brandName                 : item.brand
      , classCategoryCode         : item.gpc
      , unitDescriptor            : item.unit_type
      , ts                        : new Date()
      , cmd                       : 'ADD'
      , ci_state: 'REGISTERED' // always, for now
    }
    if (item.cancelledDate)    form_data.canceledDate     = item.cancelledDate // iso string
    if (item.discontinuedDate) form_data.discontinuedDate = item.discontinuedDate // iso string

    form_data.brand             = form_data.brand             || 'generic'
    form_data.classCategoryCode = form_data.classCategoryCode || '99999999'
    form_data.unitDescriptor    = form_data.unitDescriptor    || 'CASE'

    var children = item.child_gtins && item.child_gtins.join(',')
    form_data.children = '[' + children + ']'

    request.post({
      url   : config.url_gdsn_api + '/ci/' + item.provider + '/' + item.gtin + '/' + item.tm + '/' + item.tm_sub || 'na' 
      , form: form_data
      , auth: {
          'user': 'admin'
          , 'pass': 'devadmin'
          , 'sendImmediately': true
        }
    }, 
    function (err, response, body) {
      var result = {
        success: false
        ,gtin  : item.gtin
        ,tm    : item.tm
        ,tm_sub: (item.tm_sub == 'na' ? '' : item.tm_sub)
        ,errors: []
      }
      if (err) {
        result.errors.push({message:err, xPath:'', attributename:''})
      }
      else if (!getSuccess(body)) {
        result.errors.push({message:body, xPath:'', attributename:''})
      }
      else {
        result.success = true
      }
      task_done(null, result)
    }) // end request.post
  })   // end trade_item_db.findTradeItemFromItem
}

function getSuccess(body) {
  try {
    var success = JSON.parse(body).success
    console.log('success value from body: ' + success)
    return success && success != 'false' && success != 'FALSE'
  }
  catch (err) {
    console.log('json parse error: ' + err)
  }
  return false
}
