var async   = require('async')
var request = require('request')

var log
var config

module.exports = function get_api(x_config) {

  config = x_config
  log               = require('../lib/Logger')('rt_mdsreg', config)
  var trade_item_db = require('../lib/db/trade_item.js')(config)
  var process_msg   = require('../lib/process_msg.js')(config)

  var api = {}

  api.register_existing_items = function (req, res, next) {

    var start = Date.now()

    log.debug('>>>>>>>>>>>>>>>>>>>> gdsn register saved items handler called at time ' + start)

    var provider = req.params.provider
    if (!provider) {
        // validate gln
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

      var req_body
      try {
        log.info('Received content of length ' + (content && content.length || '0'))
        console.log('request body:' + content)

        req_body = JSON.parse(content)
        console.log('parsed:')
        console.dir(req_body)

        req_body.items.forEach(function (item) { // TODO: create new array with map and copy
          item.recipient = config.homeDataPoolGln
          item.provider = provider
          item.tm_sub = item.tm_sub || item.tmSub || 'na'
          item.validate = req_body.validate
        })
      }
      catch (err) {
        log.error('Error parsing request content: ' + content)
        log.error(err)
        req_body = { items: [], validate: false }
      }
      if (!req_body.items.length) return next(Error('no item definitions found in request'))

      validate_register_items(process_msg, trade_item_db, req_body.items, function format_response(err, results) {

        log.debug('>>>>>>>>>>>>>>>>>>>> validate_register_items (' + (results ? results.length : '0') + ' results) took ' + (Date.now() - start) + ' ms')

        if (err) return next(err) // not expected as item errors will be wrapped in results
        if (!results || !results.length) return next(Error('no results'))

        var error_count = 0
        results.forEach(function (result) {
          log.info('register_items result: ' + result)
          if (result == null || !result.success) error_count++
        })
        if (!res.finished) {
          res.jsonp({
             result_count: (results && results.length) || '0'
             ,error_count: error_count
             ,provider: provider
             ,results: results
          })
          res.end()
        }
      }) // end validate_register_items
    }) // end req.on('end')
  }

  return api
}

// private worker functions:

function validate_register_items(as2, db, items, all_done) {
  var tasks = []
  items.forEach(function (item_query) {
    tasks.push(function (task_done) {
      validate_and_register_item(as2, db, item_query, function (result) {
        task_done(null, result) // result will wrap any errors
      })
    })
  })
  async.parallel(tasks, all_done, 5) // concurrency
}

function validate_and_register_item(msg_as2, ti_db, query, done) {
  console.log('item query: ' + (query && query.gtin))

  ti_db.findTradeItemFromItem(query, function (err, item) {

    if (err) return done(format_result(err, null, null, query))

    if ((query.itemOwnerProductCode && query.itemOwnerProductCode != item.itemOwnerProductCode)
     || (query.vendorId             && query.vendorId             != item.vendorId)
     || (query.buyerId              && query.buyerId              != item.buyerId)
     || (query.portalChar           && query.portalChar           != item.portalChar)) {

        return done(format_result(Error('mds attributes do not match, no item found'), null, null, item))
    }
    if (query.validate == 'false') return register_item(item, done)
    validate_single_item(msg_as2, item, register_item, done)
  })
} // end validate_and_register_item

function validate_single_item(as2, item, do_success, done) {
  log.debug('validate_single_item, gtin: ' + item.gtin)
  var start = Date.now()
  var cin_xml = config.gdsn.create_tp_item_cin_28(item)
  log.debug('CIN: ' + cin_xml)
  request.post({
    url: config.url_gdsn_api + '/xmlvalidation' // + '?bus_vld=true'
    , auth: {
        'user': 'admin'
        , 'pass': 'devadmin'
        , 'sendImmediately': true
      }
    , body: cin_xml
  },
  function (err, response, res_body) {
    log.debug('post single item validation result: ' + res_body)
    if (err || !get_success(res_body)) {
      return done(format_result(err, response, res_body, item))
    }
    do_success(as2, item, done)
  }) // end request.post
} // end validate_single_item

function register_item(as2, item, done) {
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

  log.debug('posting item data for gtin  ' + item.gtin)
  request.post({
    url   : config.url_gdsn_api + '/ci/' + item.provider + '/' + item.gtin + '/' + item.tm + '/' + item.tm_sub || 'na'
    , form: form_data
    , auth: {
        'user': 'admin'
        , 'pass': 'devadmin'
        , 'sendImmediately': true
      }
  }, function post_complete(err, response, res_body) {
    log.debug('post single item register dp result: ' + res_body)

    // conditional logic to send RCI if needed (as indicated by /ci response)
    var rci_xml = config.gdsn.create_tp_item_rci_28(config, item)
    log.debug('RCI: ' + rci_xml)
    try {
      var send_rci = config.send_rci // (JSON.parse(res_body).info.p_sendRciMsg == 'false' /*'true'*/)
      if (send_rci) {
        var start = Date.now()
        as2.send_by_as2_new(rci_xml, config.gdsn_gr_gln, function(err, result) {
          log.debug('process_msg.send_by_as2_new completed in ' + (Date.now() - start) + ' ms')
          if (err) log.error(err)
          if (result) log.info(result)
        })
      }
    }
    catch (err) {
      log.warn('error parsing gdsn server response for RCI logic: ' + err)
      console.log(err)
    }

    done(format_result(err, response, res_body, item, 'Registration')) // end of processing for each item

  }) // end request.post
} // end register_item

function format_result(err, response, res_body, item, errorType) {
  var result = {
    success: false
    ,errors: []
    ,errorType: (errorType || 'Validation')
  }
  item = item || {}
  result.gtin                 = item.gtin                 || ''
  result.tm                   = item.tm                   || ''
  result.tm_sub               = item.tm_sub               || ''
  result.itemOwnerProductCode = item.itemOwnerProductCode || ''
  result.vendorId             = item.vendorId             || ''
  result.buyerId              = item.buyerId              || ''
  result.portalChar           = item.portalChar           || ''

  if (err) {
    result.errors.push({message:err.message, xPath:'', attributename:''})
    return result
  }
  if ((response && response.statusCode > 400) || !get_success(res_body)) {
    //result.errors.push({message: ('bad status code ' + response.statusCode), xPath:'', attributename:''})
    var msg = 'item error: ' + response.statusCode
    try {
      msg = JSON.parse(res_body).error
    }
    catch (err) {
      console.log('error parsing res_body:')
      console.log(res_body)
    }
    result.errors.push({message: msg, xPath:'', attributename:''})
    return result
  }
  result.success = true
  result.errorType = ''
  return result
} // end format_result

function get_success(res_body){
  try {
    var success = JSON.parse(res_body).success
    console.log('success value from res_body: ' + success)
    return success && success != 'false' && success != 'FALSE'
  }
  catch (err) {
    console.log('json parse error: ' + err)
  }
  return false
} // end get_success
