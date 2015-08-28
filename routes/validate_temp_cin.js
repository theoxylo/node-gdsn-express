var async   = require('async')
var request = require('request')

module.exports = function (config) {
  
  var log           = require('../lib/Logger')('rt_cin', config)
  var utils         = require('../lib/utils.js')(config)
  var item_utils    = require('../lib/item_utils.js')(config)
  var trade_item_db = require('../lib/db/trade_item.js')(config)
  var msg_archive   = require('../lib/db/msg_archive.js')(config)

  var api = {}
    
  api.validate_hierarchy = function (req, res, next) {

    log.debug('validate_hierarchy req.path: ' + req.url)

    try {

      // generate TP CIN to home DP for registration-oriented validation
      var recipient = config.homeDataPoolGln 
      var receiver  = recipient

      var query = {
          recipient: recipient
      }
      
      // CIN options (all optional)
      var command   = 'ADD'
      var reload    = 'false'
      var docStatus = 'ORIGINAL'

      var provider = req.param('provider')
      var sender = provider
      query.provider = provider


      var gtin = req.param('gtin')
      query.gtin = gtin

      // provider and root item gtin is always required
      if (!provider || !gtin) {
        var result = utils.get_collection_json([], config.base_url + req.url)
        result.collection.error = {
          title    : 'Party and Product ID parameters are both required'
          , code   : '596'
          , message: 'Please provide Party and Product IDs for the hierarchy root item'
        }
        if (!res.finished) {
          res.jsonp(result)
          res.end()
        }
        return
      }

      var tm = req.param('tm') || '840'
      if (tm) query.tm = tm

      var tm_sub = req.param('tm_sub') || 'na'
      if (tm_sub) query.tm_sub = tm_sub

      query.archived_ts = { $exists : false }

      var start = Date.now()
      log.debug('fetching all items for provider ' + provider + ', gtin ' + gtin + ' at time ' + start)

      trade_item_db.getTradeItems(query, 0, 100, function (err, items) {
        if (err) return next(err)

        log.info('db found ' + (items && items.length) + ' items for gtin ' + gtin + ' in ' + (Date.now() - start) + ' ms')

        if (!items || items.length == 0 || !items[0] || !items[0].gtin) {
          var result = utils.get_collection_json([], config.base_url + req.url)
          result.collection.error = {
            title    : 'Item not found'
            , code   : '598'
            , message: 'no item was found for the given criteria'
          }
          if (!res.finished) {
            res.jsonp(result)
            res.end()
          }
          return
        }

        if (items.length > 1) {
          console.log('found many items: ' + items.join())
          items = [items[0]] // temp enhancement: ignore additional items
        }

        if (items.length > 1) {
          var href = config.base_url + req.url
          var result = utils.get_collection_json([], href)
          result.collection.error = {
            title    : 'Unique item not found'
            , code   : '597'
            , message: 'more than one item was found for the given criteria'
          }
          result.collection.links = []
          items.forEach(function (item) {
            item.href = item_utils.get_item_href(item, '/validate')
            result.collection.links.push({rel: 'match', href: item.href})
          })
          if (!res.finished) {
            res.jsonp(result)
            res.end()
          }
          return
        }

        var start = Date.now()
        items[0].fetch_type = 'match' // this is the hierarchy root item
        //console.log('first match: ' + items[0].xml)

        item_utils.fetch_all_children(items[0], 999, function (err, results) {
          if (err) return next(err)
          log.info('utils found ' + (results && results.length) + ' child items for gtin ' + gtin + ' in ' + (Date.now() - start) + 'ms')

          results.forEach(function (item) {
            if (!item.xml) throw Error('missing xml for item query gtin ' + item.gtin)
          })

          items = items.concat(results)
          items = items.map(function (item) {
            item.recipient = recipient // note we are changing the items to our new recipient, so these may not exist in db yet
            return item
          })

          var cin_xml = config.gdsn.create_tp_pub_cin_28(items, receiver, command, reload, docStatus, sender)

          if (config.skip_hier_validation && !res.finished) {
            res.set('Content-Type', 'application/xml;charset=utf-8')
            return res.end(cin_xml)
          }

          try {
            var start_post = Date.now()
            var gdsn_url = config.url_gdsn_api + '/xmlvalidation?bus_vld=' + (config.skip_hier_bus_validation ? 'false' : 'true')
            request.post({
              //url: config.url_gdsn_api + '/xmlvalidation?bus_vld=true'
              url: gdsn_url
              , auth: {
                  'user': 'admin'
                  , 'pass': 'devadmin'
                  , 'sendImmediately': true
                }
              , body: cin_xml
            }, 
            function (err, response, body) {
              log.debug('post to gdsn xmlvalidation with bus_vld took ' + (Date.now() - start_post) + ' ms with gdsn url ' + gdsn_url)

              if (err) return next(err)

              if (!getSuccess(body)) {
                log.debug('validation failed: ' + body)
                if (!res.finished) {
                  res.jsonp({result: body, xml: cin_xml})
                  res.end()
                }
                return
              }

              // return valid CIN for verification
              if (!res.finished) {
                res.set('Content-Type', 'application/xml;charset=utf-8')
                res.end(cin_xml)
              }
              log.db(req.url, req.user, (Date.now() - start))
              
            }) // end request.post
          }
          catch (err) {
            return next(err)
          }
        }) // end: fetch all children and generate/validate cin
      }) // end trade_item_db.getTradeItems
    }
    catch (err) {
      log.error(err)
      next(err)
    }
  } // end api.validate_hierarchy

  api.validate_trade_items = function (req, res, next) {

    log.debug('validate_trade_items req.path: ' + req.url)

    var xml = ''
    req.setEncoding('utf8')
    req.on('data', function (chunk) {
      log.debug('validate_trade_item_chunk.length: ' + (chunk && chunk.length))
      xml += chunk
      if (xml.length > 10 * 1024 * 1024 && !res.finished) res.end('msg.xml too big - larger than 10 MB')
    })

    req.on('end', function () {
      log.info('Received msg.xml of length ' + (xml && xml.length || '0'))
      var msg = config.gdsn.get_msg_info(xml)
      log.info('msg_info: ' + JSON.stringify(msg))

      var tasks = []
      msg.data.forEach(function (item) {
        tasks.push(function (task_done) {
          log.debug('trade item data gtin: ' + item.gtin)
          var start = Date.now()
          var cin_xml = config.gdsn.create_tp_item_cin_28(item)
          request.post({
            url: config.url_gdsn_api + '/xmlvalidation' // + '?bus_vld=true'
            , auth: {
                'user': 'admin'
                , 'pass': 'devadmin'
                , 'sendImmediately': true
              }
            , body: cin_xml
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
        }) // end tasks.push
      }) // end msg.data.forEach item
      async.parallel(tasks, function (err, results) {
        log.debug('parallel single item validation results count: ' + results && results.length)
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
      }, 5) // concurrency
    }) // end req.on('end') callback
  } // end api.validate_trade_items 

  return api
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
