module.exports = function (config) {
  
  var log           = require('../lib/Logger')('rt_cin', config)
  var item_utils    = require('../lib/item_utils.js')(config)
  var outbox        = require('../lib/outbox.js')(config)
  var utils         = require('../lib/utils.js')(config)
  var trade_item_db = require('../lib/db/trade_item.js')(config)
  var msg_archive   = require('../lib/db/msg_archive.js')(config)

  var api = {}
    
  api.create_cin_28_or_31 = function (req, res, next) { // GET /:recipient/:gtin/:provider/:tm[/:tm_sub|na]

    log.debug('create_cin_28_or_31 req.path: ' + req.url)

    var gtin // used in catch

    try {

      //var gtin = req.param('gtin')

      gtin = req.params.gtin // root item gtin is always required in path
      console.log('create new CIN messages for root gtin: ' + gtin)
      if (!gtin) {
        var result = utils.get_collection_json([], config.base_url + req.url)
        result.collection.error = {
          title    : 'gtin parameter is required'
          , code   : '596'
          , message: 'please provide a gtin for your search'
        }
        if ('test') res.end('early end error test') // throw cannot set headers error below
        return res.jsonp(result) // early 200 return with err object
      }

      var recipient = req.param('recipient') // the subscriber is the recipient of our new CIN, submitted as the first path param

      // later, this URL format would support retrieval of all CIN messages for a given subscriber!
      // e.g. /cs_api/1.0/gdsn-cin/1100001011278?
      // and for any subscriber (local or otherwise) we could also workflow the CIN
      // to create new catalog items retrievable via /cs_api/1.0/subscribed/gtin/provider

      var sender = config.homeDataPoolGln

      var receiver = req.param('rdp') || req.param('receiver') // receiver is optional, but should be local tp or other dp
      if (!receiver || receiver == config.homeDataPoolGln || receiver == config.gdsn_gr_gln) {
        receiver = recipient // data pool gln for other TP, or our local TP recipient
      }

      // CIN options (all optional)
      var command   = req.param('cmd')    || 'ADD'
      var reload    = req.param('reload') || 'false'
      var docStatus = req.param('doc')    || 'ORIGINAL'

      // item query to build new CIN message from data pool to local TP or other DP
      // must only consider publisher data pool items 
      // cin is built from items received by the home data pool by locat parties ONLY 
      var query = {
        recipient: config.homeDataPoolGln 
        , provider   : req.params.provider
        , gtin       : gtin
        , tm         : req.params.tm || '840'
        , tm_sub     : req.params.tm_sub || 'na'
        , archived_ts: { $exists : false }
      }
      // req.params refers to path :param object
      query.provider    = req.params.provider
      query.tm          = req.params.tm || '840'
      query.tm_sub      = req.params.tm_sub || 'na'
      query.archived_ts = { $exists : false }

      var start = Date.now()
      log.debug('fetching all items for gtin ' + gtin + ' at time ' + start)

      trade_item_db.getTradeItems(query, 0, 100, function (err, items) {
        if (err) return next(err)

        log.info('db found ' + (items && items.length) + ' items for gtin ' + gtin + ' in ' + (Date.now() - start) + ' ms')

        if (items.length == 0) {
          var result = utils.get_collection_json([], config.base_url + req.url)
          result.collection.error = {
            title    : 'Item not found'
            , code   : '598'
            , message: 'no item was found for the given criteria'
          }
          if (!res.finished) {
            res.jsonp(result)
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
          }
          return
        }

        var start = Date.now()
        items[0].fetch_type = 'match'
        var version_28 = (items[0].tradeItem.gtin ? false : true) // 3.1 tradeItem has shorter gtin xpath

        item_utils.fetch_all_children(items[0], 999, function (err, results) {
          if (err) return next(err)
          log.info('utils found ' + (results && results.length) + ' child items for gtin ' + gtin + ' in ' + (Date.now() - start) + 'ms')

          results.forEach(function (item) {
            if (!item.xml) throw Error('missing xml for item query gtin ' + item.gtin)
          })

          items = items.concat(results)

          // make items hypothetical with modified values for CIN generation
          items = items.map(function (item) {
            item.recipient = recipient // note we are changing the items to our new recipient, so these may not exist in db yet
            return item
          })

          var cin_xml = ''
          try {
            if (version_28) cin_xml = config.gdsn.create_cin_28(items, receiver, command, reload, docStatus, sender)
            else            cin_xml = config.gdsn.create_cin_31(items, receiver, command, reload, docStatus, sender)
          }
          catch (err) {
            log.error('err generating CIN: ' + err)
            //log.debug(cin_xml)
          }

          msg_archive.saveMessage(cin_xml, function (err, msg_info) {
            if (err) return next(err)
            log.info('Generated cin message saved to archive: ' + msg_info.msg_id + ', modified: ' + new Date(msg_info.modified_ts))

            outbox.send_by_as2(cin_xml, receiver)
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
      log.error('Failed to create new CIN message for root gtin: ' + JSON.stringify(error))
      next(error)
    }
  } // end api.create_cin_28_or_31

  return api
}
