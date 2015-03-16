module.exports = function (config) {
  
  var _             = require('underscore')
  var async         = require('async')
  var log           = require('../lib/Logger')('rt_cin', config)
  var utils         = require('../lib/utils.js')(config)
  var item_utils    = require('../lib/item_utils.js')(config)
  var trade_item_db = require('../lib/db/trade_item.js')(config)

  return {
    
    create_cin : function (req, res, next) {

      log.debug('create_cin req.path: ' + req.url)

      try {

//
// extra request logging, expensive:
//
        var req_id = req.param('req_id')
        log.debug('using req_id ' + req_id)
        if (!req_id) req_id = item_utils.get_auto_req_id()
        var info = item_utils.get_info_logger(log, req_id)
        info('create_cin req.path: ' + req.url)
//
//
//

        var query = {}
        
        if (config.enable_query_req_id) query['req_id_' + req_id] = {"$exists":false}

        query.recipient = config.homeDataPoolGln // cin is built from items received by data pool
        
        var gtin = req.param('gtin')
        console.log('create cin gtin: ' + gtin)
        
        if (gtin) query.gtin = gtin
        else {
          var result = utils.get_collection_json([], config.base_url + req.url)
          result.collection.error = {
            title    : 'gtin parameter is required'
            , code   : '596'
            , message: 'please provide a gtin for your search'
          }
          if (!res.finished) res.jsonp(result)
          return
        }

        var provider = req.param('provider')
        if (provider) query.provider = provider

        var tm = req.param('tm')
        if (tm) query.tm = tm

        var tm_sub = req.param('tm_sub')
        if (tm_sub) query.tm_sub = tm_sub

        query.archived_ts = { $exists : false }

        var lang = req.param('lang')
        if (lang && lang.indexOf('-')) lang = lang.split('-')[0] // 'en-us' => 'en'


        /* use config.js home data pool gln, but maybe it should come from user_config file array:
        //var client_config = config.user_config[req.user] || { client_name: 'Default Client' }
        //try {
        //  var recipients = client_config.recipients
        //  if (recipients && recipients.length) {
        //    info('limited query results to configured recipients: ' + recipients.join(', '))
        //    if (recipients.length > 1) query.recipient = { $in: recipients }
        //    else query.recipient = recipients[0]
        //  }
        // }
        // catch (e) {
        //   log.warn('server profile config "recipients" not found, no filter applied')
        // }
        */

        var start = Date.now()
        log.debug(req_id + ' fetching all items for gtin ' + gtin + ' at time ' + start)

        var include_xml = true // for db projection

        trade_item_db.getTradeItems(query, 0, 100, include_xml, function process_found_items(err, items) {
          if (err) return next(err)

          info('db found ' + (items && items.length) + ' items for gtin ' + gtin + ' in ' + (Date.now() - start) + 'ms')

          items = item_utils.de_dupe_items(items)

          if (items.length == 0) {
            var result = utils.get_collection_json([], config.base_url + req.url)
            result.collection.error = {
              title    : 'Item not found'
              , code   : '598'
              , message: 'no item was found for the given criteria'
            }
            if (!res.finished) res.jsonp(result)
            return
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
              item.href = item_utils.get_item_href(item, '/gdsn-cin')
              result.collection.links.push({rel: 'match', href: item.href})
            })
            if (!res.finished) res.jsonp(result)
            return
          }

          var tasks = []
          items.forEach(function (item) {

            item.fetch_type = 'match'

            tasks.push(
              function (callback) {
                var start = Date.now()
                var include_xml = true
                item_utils.fetch_all_children(item, req_id, function (err, item_and_children) {
                  if (err) return callback(err)
                  info('utils found ' + (item_and_children && item_and_children.length) + ' child items for gtin ' + gtin + ' in ' + (Date.now() - start) + 'ms')
                  callback(null, item_and_children)
                }, include_xml)
              }
            )
          })

          info('starting async fetch for task count: ' + tasks.length)

          async.parallel(tasks, function (err, results) {
              if (err) return next(err)
              results = _.flatten(results) // async.parallel returns an array of results arrays

              //results.unshift(items[0])
              items = items.concat(results)

              items = item_utils.de_dupe_items(items)
              log.debug(req_id + ' parallel tasks final item count: ' + items.length)

              // 
              items = items.map(function (item) {
                item.recipient = req.param('recipient') // new cin will create new items belonging to subscriber/recipient/dr
                item.receiver  = req.param('receiver')  // recipient data pool gln, need to look this up somewhere instead or requiring parameter
                return item
              })

              var cin_xml = config.gdsn.create_cin(items)

              res.set('Content-Type', 'application/xml;charset=utf-8')
              if (req.param('download')) {
                res.set('Content-Disposition', 'attachment; filename="gen_cin_' + gtin + '.xml"')
              }
              res.end(cin_xml)

              log.db(req.url, req.user, (Date.now() - start))
            } // end async.parallel callback
          ) // end async.parallel invocation
        }) // end db getTradeItems callback and invocation
      }
      catch (error) {
        log.error('Failed returning subscribed items: ' + JSON.stringify(error))
        next(error)
      }
    }
  }
}
