module.exports = function (config) {
  
  var _ = require('underscore')

  var api = {}

  var log  = require('../lib/Logger')('routes_item', {debug: true})

  var get_query = function (req) {
    var query = {}

    var gtin      = req.param('gtin')
    var provider  = req.param('provider')
    var tm        = req.param('tm')
    var tm_sub    = req.param('tm_sub')
    var recipient = req.param('recipient')

    if (gtin)      query.gtin      = { $regex: gtin }
    if (provider)  query.provider  = { $regex: provider }
    if (tm)        query.tm        = { $regex: tm }
    if (tm_sub)    query.tm_sub    = { $regex: tm_sub }
    if (recipient) query.recipient = { $regex: recipient }

    return query
  }

  api.list_trade_items = function (req, res, next) {
    log.debug('list_items')

    var page = parseInt(req.param('page'))
    log.info('page ' + page)
    if (!page || page < 0) page = 0

    var per_page = parseInt(req.param('per_page'))
    log.info('per_page ' + per_page)
    if (!per_page || per_page < 0 || per_page > 100) per_page = config.per_page_count

    log.info('req params: ' + JSON.stringify(req.query))
    var query = get_query(req)

    config.database.getTradeItems(query, page, per_page, false, false, function (err, items) {
      if (err) return next(err)
      res.json(items);
    })
  }

  api.find_trade_items = function (req, res, next) {
    log.debug('find_trade_items')
    log.info('req params: ' + JSON.stringify(req.query))
    var query = get_query(req)

    if (req.path.indexOf('/subscribed') > 0) {
      try {
        var recipients = req.session.config.recipients
        if (recipients) {
          log.info('limited result to configured recipients: ' + recipients.join(', '))
          query.recipient = { $in: recipients }
        }
      }
      catch (e) {
        log.warn('profile config "recipients" not found, skipping check')
      }
    }

    config.database.getTradeItems(query, 0, 100, true, true, function (err, items) {
      if (err) return next(err)

      if (req.param('json')) { // json override
        req.headers.accept = 'application/json'
      }

      res.format({
        xml: function () {
          res.set('Content-Type', 'application/xml;charset=utf-8')
          if (req.query.download) {
            res.set('Content-Disposition', 'attachment; filename="item_' + item.gtin + '.xml"')
          }
          // send just first item in xml format
          res.end(items && items[0] && items[0].xml)
        },
        json: function () { // json

          // apply custom view filter if client config is present in session
          var mappings
          var client = 'n/a'
          try {
            mappings = req.session.config.xml_mappings
            client = req.session.config.client_name
          }
          catch (e) {
            log.warn('problem reading client config: ' + e)
          }

          items = _.map(items, function (item) {
            var json = {}
            if (mappings) {
              json = config.gdsn.getCustomTradeItemInfo(item.xml, mappings, item)
              delete json.xml
              delete json.json
            }
            else {
              json = item.json
            }
            json.client_name = client
            return json
          })

          if (req.query.download) {
            res.set('Content-Disposition', 'attachment; filename="items_' + Date.now() + '.json"')
            res.json(items);
          }
          else {
            res.jsonp(items);
          }
        },
        default: function () {
          res.end('Unknown format requested in Accept header: ' + req.headers.accept)
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

    var items = []

    config.gdsn.items.getEachTradeItemFromStream(req, function (err, item) {
      if (err) return next(err)

      if (item) {
        convertToJson(item.xml, function (err, json) {
          if (err) return next(err)
          item.json = json
          config.database.saveTradeItem(item, function (err, gtin) {
            if (err) return next(err)
            items.push(gtin)
          })
        })
      }
      else res.end('Saved ' + items.length + ' items: ' + items.join(', '))
    })

  }

  var convertToJson = function (xml, cb) {
    var xml_digester = require("xml-digester");
    var digester = xml_digester.XmlDigester({});
    digester.digest(xml, cb)
  }
  

  return api;
}
