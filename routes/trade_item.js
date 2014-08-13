module.exports = function (config) {
  
  var _          = require('underscore')
  var async      = require('async')

  var api = {}

  var log  = require('../lib/Logger')('rt_items', {debug: true})

  var item_utils = require('../lib/item_utils.js')(config)
  var xml_digest = require('../lib/xml_to_json.js')(config)

  var cheerio = require('cheerio')

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
    //if (!per_page || per_page < 0 || per_page > 100) per_page = config.per_page_count
    if (!per_page || per_page < 0 || per_page > 1000) per_page = config.per_page_count // increase max to 1000

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
    }, 1000)
  }

  return api
}
