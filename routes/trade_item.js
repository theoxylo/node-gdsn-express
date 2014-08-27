module.exports = function (config) {
  
  var _          = require('underscore')
  var async      = require('async')
  var logw       = (require('../lib/log_utils.js')(config)).log

  var api = {}

  var log  = require('../lib/Logger')('rt_items', {debug: true})

  var item_utils = require('../lib/item_utils.js')(config)
  var xml_digest = require('../lib/xml_to_json.js')(config)

  var cheerio = require('cheerio')

  function populateItemImageUrls(item) {
    console.log('populateItemImageUrls with item ' + JSON.stringify(item))
    var urls = []
    log.debug('5555555555555 urls: ' + urls.join(' '))
    try {
      //tradeItem/tradeItemInformation/tradeItemDescriptionInformation/tradeItemExternalInformation[1]/uniformResourceIdentifier
      var dUrls = item.tradeItem.tradeItemInformation.tradeItemDescriptionInformation.tradeItemExternalInformation.map(function (extInfo) {
        console.log('dUrl: ' + extInfo.uniformResourceIdentifier)
        return extInfo.uniformResourceIdentifier
      })
      console.log('-------------------- dUrls: ' + JSON.stringify(dUrls))
      if (dUrls && dUrls.length) {
          dUrls.unshift(0)
          dUrls.unshift(dUrls.length -1)

          Array.prototype.splice.apply(urls, dUrls)

          console.log('dUrls urls: ', urls.join(' '))
      }
    }
    catch (e) {console.log(e)}

    log.debug('6666666666666 urls: ' + urls.join(' '))

    try {
      //tradeItem/extension/food:foodAndBeverageTradeItemExtension/tradeItemExternalInformation[1]/uniformResourceIdentifier
      var fUrls = item.tradeItem.extension.foodAndBeverageTradeItemExtension.tradeItemExternalInformation.map(function (extInfo) {
        return extInfo.uniformResourceIdentifier
      })
      if (fUrls && fUrls.length) {
          fUrls.unshift(0)
          fUrls.unshift(fUrls.length -1)

          Array.prototype.splice.apply(urls, fUrls)

          console.log('fUrls urls: ', urls.join(' '))
      }
    }
    catch (e) {console.log(e)}

    log.debug('7777777777777 urls: ' + urls.join(' '))
    item.images = urls
    log.debug('item ' + item.gtin + ' images: ', urls.join('\n'))
  }

  function serveCollectionRes(res, items, include_trade_item, href) {

    var item_count = 1
    items = items.map(function (item) {
      item.href = item_utils.get_item_href(item)
      item.item_count_num = item_count++
      populateItemImageUrls(item)
      if (!include_trade_item) delete item.tradeItem
      return item
    })

    var result = item_utils.get_collection_json(items, href)

    result.collection.page             = 0
    result.collection.per_page         = 100
    result.collection.item_range_start = 1
    result.collection.item_range_end   = items.length
    result.collection.total_item_count = items.length

    if (!res.finished) res.jsonp(result)
  }

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

    var include_trade_item = (req.param('include_trade_item') == 'true')
    info('include_trade_item  ' + include_trade_item)

    var db_query = item_utils.get_query(req)
    info('db query: ' + JSON.stringify(db_query))

    var start = Date.now()
    config.database.getTradeItem(db_query, function (err, items) {
      if (err) return next(err)

      info('found ' + items.length + ' total items for gtin ' + db_query.gtin + ' in ' + (Date.now() - start) + 'ms')

      items.forEach(function (item) {
        item.fetch_type = 'match'
      })

      start = Date.now(); // reset time
      var href = config.base_url + req.url

      if (children && items.length == 1) { // only get children for first item match
        var item = items[0]
        item_utils.fetch_all_children(item, req_id, function(err, items) {
          if (err) return next(err)
          items.unshift(item)
          info('found ' + items.length + ' total items for gtin ' + item.gtin + ' (with children) in ' + (Date.now() - start) + 'ms')
          serveCollectionRes(res, items, include_trade_item, href)
        })
      }
      else {
        info('skipping children for ' + items.length + ' item search results')
        serveCollectionRes(res, items, include_trade_item, href)
      }
      logw.info(req.url, {user: req.user, duration: (Date.now() - start)} )
    }) // end config.database.getTradeItem
  }

  // retrieve list view of items including total count but NOT including xml
  api.list_trade_items = function (req, res, next) {
    log.debug('list_items')

    var exclude_trade_item = req.param('exclude_trade_item') == 'true'
    log.debug('exclude_trade_item: ' + exclude_trade_item)

    var include_total_count = req.param('include_total_count') == 'true'
    log.debug('include_total_count: ' + include_total_count)

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
    var include_xml = true
    var tasks = []
    tasks.push(function (callback) {
      config.database.getTradeItems(query, page, per_page, !include_xml, callback)
    })
    if (include_total_count) tasks.push(function (callback) {
      config.database.getTradeItems(query, page, per_page, !include_xml, callback, include_total_count)
    })
    //async.series(tasks, function (err, results) { // I thought maybe db caching might make series faster, but no
    async.parallel(tasks, function (err, results) {
      if (err) return next(err)
      var items = results[0]
      var total_item_count = results[1]
      log.info('list_trade_items getTradeItems (with total item count ' + total_item_count + ') returned ' + items.length + ' items in ' + (Date.now() - start) + 'ms')
      var item_count = (page * per_page) + 1
      items = items.map(function (item) {
        item.href = item_utils.get_item_href(item)
        item.item_count_num = item_count++
        populateItemImageUrls(item)
        if (exclude_trade_item) delete item.tradeItem
        return item
      })
      var href = config.base_url + req.url
      var result = item_utils.get_collection_json(items, href)

      result.collection.page             = page
      result.collection.per_page         = per_page
      result.collection.item_range_start = (page * per_page) + 1
      result.collection.item_range_end   = (page * per_page) + items.length
      if (include_total_count) result.collection.total_item_count = total_item_count

      result.collection.links = [
          {rel: 'next', href: href + '[?|&]page=+1'}
        , {rel: 'prev', href: href + '[?|&]page=-1'}
      ]
      result.collection.queries = [
        {
          href   : '/items',
          rel    : 'search',
          prompt : 'Search by GTIN',
          data   : [
            {name : 'gtin', value : '/[0-9]{0-14}/'}
          ]
        }
      ]
      result.collection.template = {
        data : [
          {prompt: 'Item GTIN (required)', name: 'gtin', value: '/[0-9]{14}/'},
        ]
      }
      if (!res.finished) res.jsonp(result)
      logw.info(req.url, {user: req.user, duration: (Date.now() - start)} )
    })
  }

  api.find_trade_items = function (req, res, next) {
    log.debug('find_trade_items req.path: ' + req.path)

    if (req.url.indexOf('?') < 0) {
      return res.render('items_api_docs_10')
    }

    log.info('req params: ' + JSON.stringify(req.query))
    var query = item_utils.get_query(req)

    var page = parseInt(req.param('page'))
    log.debug('page ' + page)
    if (!page || page < 0) page = 0

    var per_page = parseInt(req.param('per_page'))
    log.debug('per_page ' + per_page)
    if (!per_page || per_page < 0 || per_page > 100) per_page = config.per_page_count

    var start = Date.now()
    var include_xml = true
    config.database.getTradeItems(query, page, per_page, include_xml, function (err, items) {
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
            item.href        = item_utils.get_item_href(item)

            //var itemDigest = xml_digest.digest(item.xml)
            //item.tradeItem = itemDigest.tradeItem
            delete item.xml

            item.data = [
              {
                prompt: 'Item GTIN (required)'
                , name: 'gtin'
                , value: item.gtin
              }
            ]
            item.links = [
              { rel: 'self', href: item.href }
            ]
            return item
          })

          var result = item_utils.get_collection_json(items, config.base_url + req.url)

          if (!res.finished) {
            if (req.query.download) {
              res.set('Content-Disposition', 'attachment; filename="items_' + Date.now() + '.json"')
              res.json(result)
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
      logw.info(req.url, {user: req.user, duration: (Date.now() - start)} )
    }) // end getTradeItems callback
  }

  api.post_trade_items = function (req, res, next) {
    log.debug('post_trade_items handler called')

    var content = ''
    req.setEncoding('utf8')
    req.on('data', function (chunk) {
      log.debug('post_trade_items.length: ' + chunk.length)
      if (content.length < 10 * 1000 * 1000) content += chunk // 10 MB limit for persisting raw message
    })
    req.on('end', function () {
      log.info('Received POST msg content of length ' + (content && content.length || '0'))
      config.database.saveMessageString(content, function (err, id) {
        if (err) return done(err)
        log.info('Message saved to archive with instance_id: ' + id)
        //res.end('post content archive with ts ' + id)
      })
    })

    // call saveTradeItem for each item in parallel (after stream read is complete)
    // how to submit while still streaming? maybe with async.queue
    var tasks = []
    config.gdsn.items.getEachTradeItemFromStream(req, function (err, item) {
      if (err) return next(err)

      if (item) {
        log.debug('received item from getEachTradeItemFromStream callback with gtin ' + item.gtin)

        var itemDigest = xml_digest.digest(item.xml)
        item.tradeItem = itemDigest.tradeItem

        tasks.push(function (callback) {
          config.database.saveTradeItem(item, callback)
        })
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
        })
      }

    })

  }

  api.post_log_item = function (req, res, next) {
    log.debug('post_log_item handler called')

    var content = ''
    req.setEncoding('utf8')
    req.on('data', function (chunk) {
      log.debug('post_log_item.length: ' + chunk.length + ' / ' + content.length)
      //log.debug(chunk)
      content += chunk 
      if (content.length > 10 * 1000 * 1000) next(Error('10 MB limit for persisting raw message'))
    })
    req.on('end', function () {
      log.info('Received POST msg content of length ' + (content && content.length || '0'))

      // cheerio testing
      var $ = cheerio.load(content, { 
        _:0
        , normalizeWhitespace: true
        , xmlMode: true
      })


      var item_count = 0
      console.log('recipient: ' + $('dataRecipient').first().text())
      console.log('version: ' + $('sh\\:HeaderVersion').text())

      $('tradeItem tradeItemIdentification').each(function () {
        console.log('args: ' + Array.prototype.join.call(arguments, ', '))
        item_count++
        console.log('trade item: ' )

        console.log('gtin: ' + $('gtin', this).text())
        console.log('tiid: ' + $(this).text())
        console.log('tiid: ' + $(this).html())

        $('tradeItemIdentification additionalTradeItemIdentification', this).each(function () {
          var el = $(this)
          console.log('item addl id: %s (type: %s)'
            , el.find('additionalTradeItemIdentificationValue').text()
            , el.find('additionalTradeItemIdentificationType').text()
          )
        })
      })

      $('tradeItem').each(function () {
        var en_name = $('functionalName description', this).filter(function () {
          return $('language languageISOCode', this).text() === 'en'
        }).find('shortText').text()
        console.log('english functional name: ' + en_name)
      })

      if (!res.finished) res.jsonp({msg: 'found item count ' + item_count})
    })
  }

  api.migrate_trade_items = function (req, res, next) {
    log.debug('migrate_trade_items handler called')

    var query = {}
    query.tradeItem = {$exists: false}
    query.archived_ts = { $in : ['', null] }

    var gtinsMigrated = []

    var intervalId = setInterval(function () {
      var include_xml = true
      config.database.getTradeItems(query, 0, 10, include_xml, function (err, items) {
        if (err) return next(err)
        log.info('migrate_trade_items getTradeItems return item count: ' + items.length)

        if (!items.length) {
          clearInterval(intervalId)
          res.json({msg: 'Migrated ' + gtinsMigrated.length + ' items, GTINs: ' + gtinsMigrated.join(', ')})
          return res.end()
        }

        var tasks = []
        items.forEach(function (item) {
          log.debug('migrating tradeitem with gtin ' + item.gtin)

          var itemDigest = xml_digest.digest(item.xml)
          item.tradeItem = itemDigest.tradeItem

          tasks.push(function (callback) {
            config.database.saveTradeItem(item, callback)
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

  return api
}
