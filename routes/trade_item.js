module.exports = function (config) {
  
  var api = {}

  var log  = require('../lib/Logger')('rt_items', {debug: true})

  var item_utils = require('../lib/item_utils.js')(config)
  var xml_digest = require('../lib/xml_to_json.js')(config)

  api.list_trade_items = function (req, res, next) {
    log.debug('list_items')

    var page = parseInt(req.param('page'))
    log.info('page ' + page)
    if (!page || page < 0) page = 0

    var per_page = parseInt(req.param('per_page'))
    log.info('per_page ' + per_page)
    if (!per_page || per_page < 0 || per_page > 100) per_page = config.per_page_count

    log.info('req params: ' + JSON.stringify(req.query))
    var query = item_utils.get_query(req)

    config.database.getTradeItems(query, page, per_page, false, function (err, items) {
      if (err) return next(err)
      log.info('list_trade_items getTradeItems return item count: ' + items.length)
      items = items.map(function (item) {
        item.href = item_utils.get_item_href(item)
        return item
      })
      var href = config.base_url + req.url
      var result = item_utils.get_collection_json(items, href)
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
      res.json(result)
    })
  }

  api.find_trade_items = function (req, res, next) {
    log.debug('find_trade_items req.path: ' + req.path)

    log.info('req params: ' + JSON.stringify(req.query))
    var query = item_utils.get_query(req)

    var page = parseInt(req.param('page'))
    log.info('page ' + page)
    if (!page || page < 0) page = 0

    var per_page = parseInt(req.param('per_page'))
    log.info('per_page ' + per_page)
    if (!per_page || per_page < 0 || per_page > 100) per_page = config.per_page_count

    config.database.getTradeItems(query, page, per_page, true, function (err, items) {
      if (err) return next(err)
      log.info('find_trade_items getTradeItems return item count: ' + items.length)

      if (req.param('callback') || req.param('json')) { // json override
        req.headers.accept = 'application/json'
      }
      else if (req.param('xml')) { // xml override
        req.headers.accept = 'application/xml'
      }
      log.debug('Accept header: ' + req.headers['accept'])

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

          var client_config = config.user_config[req.user] || { client_name: 'Default Client' }

          items = items.map(function (item) {

            item.req_user    = req.user
            item.client_name = client_config.client_name
            item.href        = item_utils.get_item_href(item)

            var itemDigest = xml_digest.digest(item.xml)
            item.tradeItem = itemDigest.tradeItem
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

          if (req.query.download) {
            res.set('Content-Disposition', 'attachment; filename="items_' + Date.now() + '.json"')
            res.json(result)
          }
          else {
            res.jsonp(result)
          }
        },

        default: function () {
          res.end('Unsupported format requested in Accept header: ' + req.headers.accept)
        }

      }) // end res.format

    }) // end getTradeItems callback
  }

  api.post_trade_items = function (req, res, next) {
    console.log('post_trade_items handler called')

    var content = ''
    req.setEncoding('utf8')
    req.on('data', function (chunk) {
      log.debug('archive_post_chunk.length: ' + chunk.length)
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

    var saved_gtins = []

    config.gdsn.items.getEachTradeItemFromStream(req, function (err, item) {
      if (err) return next(err)

      if (item) {
        //var itemDigest = xml_digest.digest(item.xml)
        //item.tradeItem = itemDigest.tradeItem
        config.database.saveTradeItem(item, function (err, gtin) {
          if (err) return next(err)
          saved_gtins.push(gtin)
        })
      }
      else { // null item is passed when there are no more items in the stream
        res.json({msg: 'Saved ' + saved_gtins.length + ' items', saved_gtins: saved_gtins})
        res.end()
      }

    })

  }

  return api
}
