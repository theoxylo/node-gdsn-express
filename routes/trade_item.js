module.exports = function (config) {

  var _              = require('underscore')
  var async          = require('async')
  var log            = require('../lib/Logger')('rt_items', config)
  var utils          = require('../lib/utils.js')(config)
  var item_utils     = require('../lib/item_utils.js')(config)
  var xml_digest     = require('../lib/xml_to_json.js')(config)
  var trade_item_db  = require('../lib/db/trade_item.js')(config)
  var msg_archive    = require('../lib/db/msg_archive.js')(config)

  var api = {} // for return

  // retrieve list of items including xml
  api.list_trade_items = function (req, res, next) {
    log.debug('list_items')

    var page = parseInt(req.param('page') || '0')
    log.debug('page: ' + page)
    if (!page || page < 0) page = 0

    var per_page = parseInt(req.param('per_page') || '10')
    log.debug('per_page: ' + per_page)
    if (!per_page || per_page < 0 || per_page > 5000) per_page = config.per_page_count  // 5k max items per page

    log.info('req.query params: ' + JSON.stringify(req.query))
    var query = item_utils.get_query(req)

    var start = Date.now()
    trade_item_db.getTradeItems(query, page, per_page, function (err, items) {
      if (err) return next(err)
      log.info('list_trade_items getTradeItems returned ' + (items && items.length) + ' items in ' + (Date.now() - start) + 'ms')
      var item_count = (page * per_page) + 1
      items = items.map(function (item) {
        item.href         = item_utils.get_item_href(item, '/items')
        item.history_href = item_utils.get_item_href(item, '/items/history')
        item.cin_href     = config.base_url + '/validate/' + item.provider + '/' + item.gtin + '/' + item.tm
        item.item_count_num = item_count++
        populateItemImageUrls(item)

        if (item.xml) delete item.xml // skip xml for list view, performance?

        return item
      })
      var href = config.base_url + req.url
      var result = utils.get_collection_json(items, href)

      result.collection.page             = page
      result.collection.per_page         = per_page
      result.collection.item_range_start = (page * per_page) + 1
      result.collection.item_range_end   = (page * per_page) + items.length

      if (!res.finished) res.jsonp(result)
      log.db(req.url, req.user, (Date.now() - start) )
    }) // end trade_item_db.getTradeItems
  }

  // retrieve list of items including xml
  api.find_trade_items = function (req, res, next) {
    log.info('find_trade_items req.path: ' + req.path)

    log.info('find_trade_items req.query: ' + JSON.stringify(req.query))
    var query = item_utils.get_query(req)

    var page = parseInt(req.param('page') || '0')
    log.debug('page ' + page)
    if (!page || page < 0) page = 0

    var per_page = parseInt(req.param('per_page') || '10')
    log.debug('per_page ' + per_page)
    if (!per_page || per_page < 0 || per_page > 100) per_page = config.per_page_count

    var start = Date.now()
    trade_item_db.getTradeItems(query, page, per_page, function (err, items) {
      if (err) return next(err)
      log.info('find_trade_items getTradeItems found ' + items.length + ' items in ' + (Date.now() - start) + 'ms')

      if (req.param('callback') || req.param('json') || items.length > 1) { // json override
        req.headers.accept = 'application/json'
      }
      else if (req.param('xml')) { // xml override
        req.headers.accept = 'application/xml'
      }
      log.debug('Accept header: ' + req.headers['accept'])

      var client_config = config.user_config[req.user] || { client_name: 'Default Client' }

      res.format({

        xml: function () { // send just first item as 'Content-Type: application/xml'

          var item = items && items[0]

          if (item) {
            res.set('Content-Type', 'application/xml;charset=utf-8')
            if (req.param('download')) {
              res.set('Content-Disposition', 'attachment; filename="item_' + item.gtin + '.xml"')
            }
            res.end(item.xml)
          }
          else {
            log.error('No item found')
            res.end('item not found for req ' + req.query)
          }
        },

        json: function () { // serve multi item list as 'Content-Type: application/json'

          items = items.map(function (item) {
            item.req_user    = req.user
            item.client_name = client_config.client_name
            item.href         = item_utils.get_item_href(item, '/items')
            item.history_href = item_utils.get_item_href(item, '/items/history')
            item.cin_href     = config.base_url + '/validate/' + item.provider + '/' + item.gtin + '/' + item.tm
            return item
          })

          var result = utils.get_collection_json(items, config.base_url + req.url)

          if (!res.finished) {
            if (req.query.download) {
              res.set('Content-Disposition', 'attachment; filename="items_' + Date.now() + '.json"')
              res.jsonp(result)
            }
            else if (req.query.pp) {
              res.setHeader('Content-Type', 'text/html')
              res.render('item_pretty_print', {result: result, test: 'hello'})
            }
            else {
              res.jsonp(result)
            }
          }
        },

        default: function () {
          res.end('Unsupported format requested in Accept header: ' + req.headers.accept)
        }

      }) // end res.format
      log.db(req.url, req.user, (Date.now() - start) )
    }) // end trade_item_db.getTradeItems
  }

  api.migrate_trade_items = function (req, res, next) {
    log.debug('migrate_trade_items handler called')

    var recipient = req.param('recipient')

    // custom query:
    var query = {
      archived_ts: {$exists: false}
      //, tradeItem: {$exists: false}
      , raw_xml: {$exists: true}
    }
    if (recipient) query.recipient = recipient

    var gtinsMigrated = []

    var migrateItemBatch = function (batch) {
      log.debug('batch num: ' + batch)
      trade_item_db.getTradeItems(query, batch, 10, function (err, items) {
        if (err) return next(err)

        log.info('migrate_trade_items getTradeItems return item count: ' + items.length)

        if (!items || !items.length) {
          res.jsonp({msg: 'Migrated ' + gtinsMigrated.length + ' items for recipient ' + recipient + ', GTINs: ' + gtinsMigrated.join(', ')})
          return res.end()
        }

        var tasks = []
        items.forEach(function (item) {
          log.debug('migrating (resaving) tradeitem with gtin ' + item.gtin)
          tasks.push(function (callback) {
            trade_item_db.saveTradeItem(item, callback)
          })
        })
        async.parallel(tasks, function (err, results) {
          if (err) return next(err)
          log.debug('parallel results: ' + JSON.stringify(results))
          results = _.flatten(results) // async.parallel returns an array of results arrays
          gtinsMigrated = gtinsMigrated.concat(results)

          setTimeout(function () {
            migrateItemBatch(batch + 1)
          }, 500)
        }, /* concurrency */ 4) // end async.parallel
      }) // end trade_item_db.getTradeItems
    }
    migrateItemBatch(0)
  }

  // retrieve single trade item with historic versions
  api.get_trade_item_history = function (req, res, next) {
    log.debug('get_trade_item_history')

    var req_id = req.param('req_id')
    log.debug('using req_id ' + req_id)
    if (!req_id) req_id = item_utils.get_auto_req_id()

    var info = item_utils.get_info_logger(log, req_id)
    info('req path: ' + req.url)

    info('req.query params: ' + JSON.stringify(req.query))
    var db_query = item_utils.get_query(req)

    if (db_query.archived_ts) delete db_query.archived_ts // include archived items versions
    info('db query: ' + JSON.stringify(db_query))

    var start = Date.now()
    trade_item_db.getTradeItems(db_query, 0, 10, function (err, items) {
      if (err) return next(err)

      info('found ' + items.length + ' total historical items for ' + req.path + ' in ' + (Date.now() - start) + 'ms')

      items.forEach(function (item) {
        if (item) item.fetch_type = item.archived_ts ? 'history' : 'match'
      })

      var start2 = Date.now(); // new start time
      var href = config.base_url + req.url

      serveCollection(req, res, items, href)

      log.db(req.url, req.user, (Date.now() - start2) )
    }) // end trade_item_db.getTradeItems
  }

  api.get_gdsn_registered_items = function (req, res, next) {
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
    function get_complete(err, response, body) {
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
  } // end get_registered_list

  function serveCollection(req, res, items, href) {

    var item_count = 1
    items = items.map(function (item) {
      item.href         = item_utils.get_item_href(item, '/items')
      item.history_href = item_utils.get_item_href(item, '/items/history')
      //item.cin_href     = item_utils.get_item_href(item, '/validate')
      item.cin_href     = config.base_url + '/validate/' + item.provider + '/' + item.gtin + '/' + item.tm

      item.item_count_num = item_count++
      populateItemImageUrls(item)
      return item
    })

    var result = utils.get_collection_json(items, href)

    result.collection.page             = 0
    result.collection.per_page         = 100
    result.collection.item_range_start = 1
    result.collection.item_range_end   = items.length

    if (res.finished) return

    if (req.query.download) {
      res.set('Content-Disposition', 'attachment; filename="items_' + Date.now() + '.json"')
    }
    res.jsonp(result)
  }

  function populateItemImageUrls(item) {
    var urls = []
    if (item
        && item.tradeItem
        && item.tradeItem.tradeItemInformation
        && item.tradeItem.tradeItemInformation.tradeItemDescriptionInformation
        && item.tradeItem.tradeItemInformation.tradeItemDescriptionInformation.tradeItemExternalInformation
    ) {
      try {
        var dUrls = item.tradeItem.tradeItemInformation.tradeItemDescriptionInformation.tradeItemExternalInformation.map(function (extInfo) {
          console.log('found an ExternalInfo for populateItemImageUrls for gtin ' + item.gtin + ' with url ' + extInfo.uniformResourceIdentifier)
          return extInfo.uniformResourceIdentifier
        })
        if (dUrls && dUrls.length) {
          dUrls.unshift(0)
          dUrls.unshift(dUrls.length -1)
          Array.prototype.splice.apply(urls, dUrls)
        }
      }
      catch (e) {console.log(e)}
    }
    if (item
        && item.tradeItem
        && item.tradeItem.extension
        && item.tradeItem.extension.foodAndBeverageTradeItemExtension
        && item.tradeItem.extension.foodAndBeverageTradeItemExtension.tradeItemExternalInformation
    ) {
      try {
        var fUrls = item.tradeItem.extension.foodAndBeverageTradeItemExtension.tradeItemExternalInformation.map(function (extInfo) {
          return extInfo.uniformResourceIdentifier
        })
        if (fUrls && fUrls.length) {
          fUrls.unshift(0)
          fUrls.unshift(fUrls.length -1)
          Array.prototype.splice.apply(urls, fUrls)
        }
      }
      catch (e) {console.log(e)}
    }
    if (urls.length) log.debug('all item external file urls: ' + urls.join(' '))
    item.images = urls
  }

  return api
}
