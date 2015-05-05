module.exports = function (config) {
  
  var _              = require('underscore')
  var async          = require('async')
  var log            = require('../lib/Logger')('rt_items', config)
  var utils          = require('../lib/utils.js')(config)
  var item_utils     = require('../lib/item_utils.js')(config)
  var xml_digest     = require('../lib/xml_to_json.js')(config)
  var trade_item_db  = require('../lib/db/trade_item.js')(config)
  var msg_archive    = require('../lib/db/msg_archive.js')(config)

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

  function serveCollection(req, res, items, href) {

    var item_count = 1
    items = items.map(function (item) {
      item.href         = item_utils.get_item_href(item, '/items')
      item.history_href = item_utils.get_item_href(item, '/items/history')
      item.cin_href     = item_utils.get_item_href(item, '/gdsn-cin')

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

  var api = {} // for return

  // retrieve single trade item, and conditionally its children
  api.get_trade_item = function (req, res, next) {
    log.debug('get_trade_item ')

    var req_id = req.param('req_id')
    log.debug('using req_id ' + req_id)
    if (!req_id) req_id = item_utils.get_auto_req_id()

    var info = item_utils.get_info_logger(log, req_id)
    info('get_trade_item req.path: ' + req.url)
    info('req query params: ' + JSON.stringify(req.query))

    var children = (req.param('children') == 'true')
    info('include children ' + children)

    var db_query = item_utils.get_query(req)
    info('db query: ' + JSON.stringify(db_query))

    var start = Date.now()
    trade_item_db.getTradeItems(db_query, 0, 5, false, function (err, items) {
      if (err) return next(err)

      info('found ' + items.length + ' total items for gtin ' + db_query.gtin + ' in ' + (Date.now() - start) + 'ms')

      items.forEach(function (item) {
        item.fetch_type = 'match'
      })

      var start2 = Date.now()
      var href = config.base_url + req.url

      if (children && items.length == 1) { // only get children for first item match
        var item = items[0]
        item_utils.fetch_all_children(item, req_id, function(err, items) {
          if (err) return next(err)
          items.unshift(item)
          info('found ' + items.length + ' total items for gtin ' + item.gtin + ' (with children) in ' + (Date.now() - start2) + 'ms')
          serveCollection(req, res, items, href)
        })
      }
      else {
        info('skipping children for ' + items.length + ' item search results')
        serveCollection(req, res, items, href)
      }
      log.db(req.url, req.user, (Date.now() - start) )
    }) // end trade_item_db.getTradeItems
  }

  // retrieve list of items NOT including xml
  api.list_trade_items = function (req, res, next) {
    log.debug('list_items')

    var page = parseInt(req.param('page'))
    log.debug('page: ' + page)
    if (!page || page < 0) page = 0

    var per_page = parseInt(req.param('per_page'))
    log.debug('per_page: ' + per_page)
    //if (!per_page || per_page < 0) per_page = config.per_page_count                    // NO per_page LIMIT!
    //if (!per_page || per_page < 0 || per_page > 100) per_page = config.per_page_count  //      set max per_page to 100
    //if (!per_page || per_page < 0 || per_page > 1000) per_page = config.per_page_count // increase max per_page to 1000
    if (!per_page || per_page < 0 || per_page > 10000) per_page = config.per_page_count  // increase max per_page to 10000

    log.info('req params: ' + JSON.stringify(req.query))
    var query = item_utils.get_query(req)

    var start = Date.now()
    trade_item_db.getTradeItems(query, page, per_page, false, function (err, items) {
      if (err) return next(err)
      log.info('list_trade_items getTradeItems returned ' + (items && items.length) + ' items in ' + (Date.now() - start) + 'ms')
      var item_count = (page * per_page) + 1
      items = items.map(function (item) {
        item.href         = item_utils.get_item_href(item, '/items')
        item.history_href = item_utils.get_item_href(item, '/items/history')
        item.cin_href     = item_utils.get_item_href(item, '/gdsn-cin')
        item.item_count_num = item_count++
        populateItemImageUrls(item)
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
    })
  }

  // retrieve list of items including xml
  api.find_trade_items = function (req, res, next) {
    log.info('find_trade_items req.path: ' + req.path)
    log.info('find_trade_items req.query: ' + JSON.stringify(req.query))

    var query = item_utils.get_query(req)

    var page = parseInt(req.param('page'))
    log.debug('page ' + page)
    if (!page || page < 0) page = 0

    var per_page = parseInt(req.param('per_page'))
    log.debug('per_page ' + per_page)
    if (!per_page || per_page < 0 || per_page > 100) per_page = config.per_page_count

    var start = Date.now()
    trade_item_db.getTradeItems(query, page, per_page, true, function (err, items) {
      if (err) return next(err)
      log.info('find_trade_items getTradeItems found ' + items.length + ' items in ' + (Date.now() - start) + 'ms')

      if (req.param('callback') || req.param('json')) { // json override
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
          }

        },

        json: function () { // serve item list as 'Content-Type: application/json'

          items = items.map(function (item) {

            item.req_user    = req.user
            item.client_name = client_config.client_name
            item.href         = item_utils.get_item_href(item, '/items')
            item.history_href = item_utils.get_item_href(item, '/items/history')
            item.cin_href     = item_utils.get_item_href(item, '/gdsn-cin')

            // run digest at request time?
            //var itemDigest = xml_digest.digest(item.xml)
            //item.tradeItem = itemDigest.tradeItem

            delete item.xml

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
    }) // end getTradeItems callback
  }

  api.post_trade_items = function (req, res, next) {
    log.debug('))))))))))))))))))))))) post_trade_items handler called')
    var xml = ''
    req.setEncoding('utf8')
    req.on('data', function (chunk) {
      log.debug('post_trade_items chunk.length: ' + (chunk && chunk.length) || 0)
      xml += chunk
      if (xml.length > 5 * 1000 * 1000) return res.end('msg xml too big - larger than 5 MB')
    })
    req.on('end', function () {
      log.info('Received msg xml of length ' + (xml && xml.length || '0'))
      msg_archive.saveMessage(xml, function (err, msg_info) {
        if (err) return next(err)
        log.info('Message info saved to archive: ' + msg_info.msg_id + ', modified: ' + new Date(msg_info.modified_ts))
      })
    })

    var unique_items = []
    var tasks = []

    config.gdsn.getEachTradeItemFromStream(req, function (err, item) {
      if (err) return next(err)

      if (item) {
        if (!item.gtin) item.gtin = config.item_default_gtin
        if (!item.gpc)  item.gpc  = config.item_default_gpc

        log.debug('received item from stream callback with gtin ' + item.gtin)

        item.slug = item_utils.get_item_slug(item)
        log.debug('item slug: ' + item.slug)

        if (unique_items.indexOf(item.slug) == -1) {
          unique_items.push(item.slug)

          try {
            var itemDigest = xml_digest.digest(item.xml)
            item.tradeItem = itemDigest && itemDigest.tradeItem
          }
          catch (e) {
            log.debug('failed digest xml: ' + item.xml)
            return next(e)
          }

          tasks.push(function (callback) {
            trade_item_db.saveTradeItem(item, callback)
          })
        }
        else {
          // skip duplicate item
          log.warn('skipping apparent item duplicate: ' + item.slug)
        }
      }
      else { // null item is passed when there are no more items in the stream
        log.debug('no more items from stream callback, final item count: ' + tasks.length)
        if (!tasks.length) return res.jsonp({msg: 'No items were found or created'})

        async.parallel(tasks, function (err, async_results) { // async_results is an array of results arrays, one per task
          log.debug('parallel async_err,     if any: ' + JSON.stringify(err))
          log.debug('parallel async_results, if any: ' + JSON.stringify(async_results))
          if (err) return next(err)
          if (!async_results || !async_results.length) return res.jsonp({msg: 'No items were found or created'})
          var results = _.flatten(async_results) // _.flatten will always return at least an empty array http://underscorejs.org/#flatten
          if (!results.length) return res.jsonp({msg: 'No items were found or created'})
          //return res.jsonp({ msg: 'Created ' + results.length + ' items with GTINs: ' + results.join(', ') , gtins: results }) 
          return res.jsonp({ msg: 'Created ' + results.length + ' items with GTINs: ' + results.join(', ')}) 
        }) // end if async.parallel
      } // end else
    }) // end gdsn.getTradeItemsFromStream
  } // end api.post_trade_items

  api.migrate_trade_items = function (req, res, next) {
    log.debug('migrate_trade_items handler called')

    var query = {}
    query.tradeItem = {$exists: false}
    query.archived_ts = { $in : ['', null] }

    var gtinsMigrated = []

    var intervalId = setInterval(function () {
      trade_item_db.getTradeItems(query, 0, 10, true, function (err, items) {
        if (err) return next(err)
        log.info('migrate_trade_items getTradeItems return item count: ' + items.length)

        if (!items.length) {
          clearInterval(intervalId)
          res.jsonp({msg: 'Migrated ' + gtinsMigrated.length + ' items, GTINs: ' + gtinsMigrated.join(', ')})
          return res.end()
        }

        var tasks = []
        items.forEach(function (item) {
          log.debug('migrating tradeitem with gtin ' + item.gtin)

          try {
            var itemDigest = xml_digest.digest(item.xml)
            item.tradeItem = itemDigest.tradeItem
            tasks.push(function (callback) {
              trade_item_db.saveTradeItem(item, callback)
            })
          }
          catch (e) {
            log.debug('failed digest xml: ' + item.xml)
            return next(e)
          }
        })
        async.parallel(tasks, function (err, results) {
          log.debug('parallel err: ' + JSON.stringify(err))
          log.debug('parallel results: ' + JSON.stringify(results))
          if (err) return next(err)
          results = _.flatten(results) // async.parallel returns an array of results arrays
          gtinsMigrated = gtinsMigrated.concat(results)
        })

      })
    }, 100)
  }

  // retrieve single trade item with historic versions
  api.get_trade_item_history = function (req, res, next) {
    log.debug('get_trade_item_history')

    var req_id = req.param('req_id')
    log.debug('using req_id ' + req_id)
    if (!req_id) req_id = item_utils.get_auto_req_id()

    var info = item_utils.get_info_logger(log, req_id)

    info('req path: ' + req.url)
    info('req query params: ' + JSON.stringify(req.query))

    var db_query = item_utils.get_query(req)
    if (db_query.archived_ts) delete db_query.archived_ts // include archived items versions
    info('db query: ' + JSON.stringify(db_query))

    var start = Date.now()
    trade_item_db.getTradeItems(db_query, 0, 10, false, function (err, items) {
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

  return api
}
