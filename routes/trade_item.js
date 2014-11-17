module.exports = function (config) {
  
  var _              = require('underscore')
  var async          = require('async')
  var log            = require('../lib/Logger')('rt_items', config)
  var utils          = require('../lib/utils.js')(config)
  var item_utils     = require('../lib/item_utils.js')(config)
  var xml_digest     = require('../lib/xml_to_json.js')(config)
  var trade_item_db  = require('../lib/db/trade_item.js')(config)
  var msg_archive_db = require('../lib/db/msg_archive.js')(config)

  function populateItemImageUrls(item) {
    //log.debug('populateItemImageUrls with item ' + JSON.stringify(item))
    var urls = []
    if (item && item.tradeItem) {
      try {
        //tradeItem/tradeItemInformation/tradeItemDescriptionInformation/
        //tradeItemExternalInformation[1]/uniformResourceIdentifier
        var dUrls = item.tradeItem.tradeItemInformation.tradeItemDescriptionInformation.tradeItemExternalInformation.map(function (extInfo) {
          console.log('external Url: ' + extInfo.uniformResourceIdentifier)
          return extInfo.uniformResourceIdentifier
        })
        if (dUrls && dUrls.length) {
          dUrls.unshift(0)
          dUrls.unshift(dUrls.length -1)
          Array.prototype.splice.apply(urls, dUrls)
        }
      }
      catch (e) {console.log(e)}

      log.debug('urls: ' + urls.join(' '))

      try {
        //tradeItem/extension/food:foodAndBeverageTradeItemExtension/
        //tradeItemExternalInformation[1]/uniformResourceIdentifier
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
    log.debug('all item external file urls: ' + urls.join(' '))
    item.images = urls
  }

  function serveCollection(req, res, items, href) {

    var item_count = 1
    items = items.map(function (item) {
      item.href         = item_utils.get_item_href(item, '/items')
      item.history_href = item_utils.get_item_href(item, '/items/history')
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

            if (client_config.xml_mappings && item.xml) {
              info('applying server profile xpath mappings for client ' + req.user + ' to item GTIN ' + item.gtin)
              try {
                //log.debug('applying xpath to xml: ' + item.xml)
                item.tradeItem = config.gdsn.getCustomTradeItemInfo(item.xml, client_config.xml_mappings)
                //log.debug(JSON.stringify(item.tradeItem))
              }
              catch (e) {
                log.error('Error applying server profile xpath mappings to item: ' + e)
              }
            }
            //else info('SKIPPING server profile xpath mappings for client ' + req.user + ' to item GTIN ' + item.gtin)

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
      msg_archive_db.saveMessage(xml, function (err, msg_info) {
        if (err) return next(err)
        log.info('Message info saved to archive: ' + JSON.stringify(msg_info))
      })
    })

    var unique_items = []
    var tasks = []

    config.gdsn.items.getEachTradeItemFromStream(req, function (err, item) {
      if (err) return next(err)

      if (item) {
        log.debug('received item from getEachTradeItemFromStream callback with gtin ' + item.gtin)

        item.slug = item_utils.get_item_slug(item)

        if (unique_items.indexOf(item.slug) == -1) {
          unique_items.push(item.slug)
          var itemDigest = xml_digest.digest(item.xml)
          item.tradeItem = itemDigest.tradeItem

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
        log.debug('no more items from getEachTradeItemFromStream callback')
        async.parallel(tasks, function (err, results) {
          log.debug('parallel err: ' + JSON.stringify(err))
          log.debug('parallel results: ' + JSON.stringify(results))
          if (err) return next(err)

          results = _.flatten(results) // async.parallel returns an array of results arrays

          if (!res.finished) {
            if (results && results.length) {
              res.jsonp({
                msg: 'Created ' + results.length + ' items with GTINs: ' + results.join(', ')
                , gtins: results
              }) 
            }
            else {
              res.jsonp({msg: 'No items were created'})
            }
          }
        }) // end async.parallel
      } // end else
    }) // end getEachTradeItemFromStream
  } // end api.post_trade_items

  api.post_trade_item = function (req, res, next) {
    log.debug('post_trade_item handler called')
    var xml = ''
    req.setEncoding('utf8')

    req.on('data', function (chunk) {
      log.debug('post_trade_item chunk.length: ' + chunk.length + ' / ' + xml.length)
      xml += chunk 
      if (xml.length > 5 * 1000 * 1000) next(Error('5 MB limit for raw message'))
    })

    req.on('end', function () {
      log.info('post_trade_item received msg xml of length ' + (xml && xml.length || '0'))

      config.gdsn.item_string_to_item_info(xml, function (err, item) {
        if (err) return next(err)
        if (!item) return next(Error('no item info was derived'))

        log.debug('received item from item_string_to_item_info callback with gtin ' + item.gtin)

        item.slug = item_utils.get_item_slug(item)

        var itemDigest = xml_digest.digest(item.xml)
        item.tradeItem = itemDigest.tradeItem

        trade_item_db.saveTradeItem(item, function (err, results) {
          log.debug('save item err: ' + JSON.stringify(err))
          log.debug('save item results: ' + JSON.stringify(results))
          if (err) return next(err)
          if (!res.finished) {
            if (results && results.length) {
              res.jsonp({
                msg: 'Created ' + results.length + ' items with GTINs: ' + results.join(', ')
                , gtins: results
              }) 
            }
            else {
              res.jsonp({msg: 'No item was created'})
            }
          }
        })
      })
    }) // end req on end

  } // end api.post_trade_item

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

          var itemDigest = xml_digest.digest(item.xml)
          item.tradeItem = itemDigest.tradeItem

          tasks.push(function (callback) {
            trade_item_db.saveTradeItem(item, callback)
          })
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
