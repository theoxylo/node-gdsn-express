module.exports = function (config) {
  
  var log           = require('../lib/Logger')('rt_cin', config)
  var utils         = require('../lib/utils.js')(config)
  var item_utils    = require('../lib/item_utils.js')(config)
  var trade_item_db = require('../lib/db/trade_item.js')(config)
  var msg_archive   = require('../lib/db/msg_archive.js')(config)
  var process_msg   = require('../lib/process_msg.js')(config)

  return {
    
    create_cin : function (req, res, next) {

      log.debug('create_cin req.path: ' + req.url)

      try {

        // item query to build new CIN message from data pool to local TP or other DP
        // must only consider publisher data pool items 
        // cin is built from items received by the home data pool by locat parties ONLY 
        var query = {
          recipient: config.homeDataPoolGln 
          
          // TODO: add support for mulitple data pools or generating private draft CINs?
        }
        
        // root item gtin is always required
        var gtin = req.param('gtin')
        console.log('create cin gtin: ' + gtin)
        query.gtin = gtin
        if (!gtin) {
          var result = utils.get_collection_json([], config.base_url + req.url)
          result.collection.error = {
            title    : 'gtin parameter is required'
            , code   : '596'
            , message: 'please provide a gtin for your search'
          }
          if (!res.finished) {
              res.jsonp(result)
              res.end()
          }
          return
        }

        var recipient = req.param('recipient') // the subscriber is the recipient of our new CIN, submitted as the first path param

        // later, this URL format would support retrieval of all CIN messages for a given subscriber!
        // e.g. /cs_api/1.0/gdsn-cin/1100001011278?
        // and for any subscriber (local or otherwise) we could also workflow the CIN
        // to create new catalog items retrievable via /cs_api/1.0/subscribed/gtin/provider

        var receiver = req.param('rdp') || req.param('receiver') // receiver is optional, but should be local tp or other dp
        if (!receiver || receiver == config.homeDataPoolGln || receiver == config.gdsn_gr_gln) {
          receiver = recipient // data pool gln for other TP, or our local TP recipient
        }

        // CIN options (all optional)
        var command   = req.param('cmd')    || 'ADD'
        var reload    = req.param('reload') || 'false'
        var docStatus = req.param('doc')    || 'ORIGINAL'

        var provider = req.param('provider')
        if (provider) query.provider = provider

        var tm = req.param('tm')
        if (tm) query.tm = tm

        var tm_sub = req.param('tm_sub')
        if (tm_sub) query.tm_sub = tm_sub

        query.archived_ts = { $exists : false }

        var lang = req.param('lang')
        if (lang && lang.indexOf('-')) lang = lang.split('-')[0] // 'en-us' => 'en'

        var start = Date.now()
        log.debug('fetching all items for gtin ' + gtin + ' at time ' + start)

        trade_item_db.getTradeItems(query, 0, 100, /* include_xml */ true, function process_found_items(err, items) {
          if (err) return next(err)

          log.info('db found ' + (items && items.length) + ' items for gtin ' + gtin + ' in ' + (Date.now() - start) + ' ms')

          //items = item_utils.de_dupe_items(items)

          if (items.length == 0) {
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
            if (!res.finished) {
              res.jsonp(result)
              res.end()
            }
            return
          }

          var start = Date.now()
          items[0].fetch_type = 'match'
          //console.log('first match: ' + items[0].xml)

          item_utils.fetch_all_children_with_xml(items[0], 999, function (err, results) {
            if (err) return next(err)
            log.info('utils found ' + (results && results.length) + ' child items for gtin ' + gtin + ' in ' + (Date.now() - start) + 'ms')

            results.forEach(function (item) {
              if (!item.xml) throw Error('missing xml for item query gtin ' + item.gtin)
            })

            items = items.concat(results)
            //items = item_utils.de_dupe_items(items)
            items = items.map(function (item) {
              item.recipient = recipient // note we are changing the items to our new recipient, so these may not exist in db yet
              return item
            })

            var cin_xml = config.gdsn.create_cin(items, receiver, command, reload, docStatus)

            msg_archive.saveMessage(cin_xml, function (err, msg_info) {
              if (err) return next(err)
              log.info('Generated cin message saved to archive: ' + msg_info.msg_id + ', modified: ' + new Date(msg_info.modified_ts))

              process_msg.send_by_as2(cin_xml, receiver)
            })

            if (!res.finished) {
              res.set('Content-Type', 'application/xml;charset=utf-8')
              if (req.param('download')) res.set('Content-Disposition', 'attachment; filename="gen_cin_' + gtin + '.xml"')
              res.end(cin_xml)
            }
            log.db(req.url, req.user, (Date.now() - start))

          }) // end: fetch all children and generate cin
        })
      }
      catch (error) {
        log.error('Failed returning subscribed items: ' + JSON.stringify(error))
        next(error)
      }
    }

    // requires at least recipient (subscriber or home dp), e.g. /gdsn-cin/1100001011278
    // additional optional parameters:
    // /gdsn-cin/1100001011278/provider
    // /gdsn-cin/1100001011278/provider/gtin
    // /gdsn-cin/1100001011278/provider/gtin/tm
    // /gdsn-cin/1100001011278/provider/gtin/tm/tm_sub
    ,find_cin: function (req, res, next) { // TODO
      log.debug('find_cin req.path: ' + req.url)
      if (!res.finished) res.end(500, 'not yet implemented')
    }

  }
}
