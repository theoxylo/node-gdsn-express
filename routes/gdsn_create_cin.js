module.exports = function (config) {
  
  var log           = require('../lib/Logger')('rt_cin', config)
  var utils         = require('../lib/utils.js')(config)
  var item_utils    = require('../lib/item_utils.js')(config)
  var trade_item_db = require('../lib/db/trade_item.js')(config)
  var msg_archive_db= require('../lib/db/msg_archive.js')(config)

  return {
    
    create_cin : function (req, res, next) {

      log.debug('create_cin req.path: ' + req.url)

      try {

        var query = {
          recipient: config.homeDataPoolGln // cin is built from items received by data pool
        }
        
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

        var start = Date.now()
        log.debug('fetching all items for gtin ' + gtin + ' at time ' + start)

        var include_xml = true // for db projection

        trade_item_db.getTradeItems(query, 0, 100, include_xml, function process_found_items(err, items) {
          if (err) return next(err)

          log.info('db found ' + (items && items.length) + ' items for gtin ' + gtin + ' in ' + (Date.now() - start) + 'ms')

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

          var start = Date.now()
          var include_xml = true
          items[0].fetch_type = 'match'

          item_utils.fetch_all_children(items[0], 999, function (err, results) {
            if (err) return next(err)
            log.info('utils found ' + (results && results.length) + ' items for gtin ' + gtin + ' in ' + (Date.now() - start) + 'ms')

            items = items.concat(results)
            items = item_utils.de_dupe_items(items)
            items = items.map(function (item) {
              item.recipient = req.param('recipient') // new cin will create new items belonging to subscriber/recipient/dr
              item.receiver  = req.param('receiver')  // recipient data pool gln, need to look this up somewhere instead or requiring parameter
              return item
            })

            var cin_xml = config.gdsn.create_cin(items)

            msg_archive_db.saveMessage(cin_xml, function (err, msg_info) {
              if (err) return next(err)
              log.info('Generated cin message saved to archive: ' + msg_info.msg_id + ', modified: ' + new Date(msg_info.modified_ts))
            })

            res.set('Content-Type', 'application/xml;charset=utf-8')
            if (req.param('download')) {
              res.set('Content-Disposition', 'attachment; filename="gen_cin_' + gtin + '.xml"')
            }
            res.end(cin_xml)

            log.db(req.url, req.user, (Date.now() - start))

          }, include_xml) // end fetch all children and generate cin
        })
      }
      catch (error) {
        log.error('Failed returning subscribed items: ' + JSON.stringify(error))
        next(error)
      }
    }
  }
}
