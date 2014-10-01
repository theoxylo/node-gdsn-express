module.exports = function (config) {

  var log            = require('../lib/Logger')('rt_msg_arch', {debug: true})
  var msg_archive_db = require('../lib/db/msg_archive.js')(config)
  var xml_digest     = require('../lib/xml_to_json.js')(config)

  var api = {}

  api.post_archive = function(req, res, next) {
    log.debug('>>>>>>>>>>>>>>>>>>>> post_archive  handler called')
    var xml = ''
    req.setEncoding('utf8')
    req.on('data', function (chunk) {
      log.debug('archive_post_chunk.length: ' + (chunk && chunk.length))
      xml += chunk
      if (xml.length > 10 * 1000 * 1000) return res.end('msg xml too big - larger than 10 MB')
    })
    req.on('end', function () {
      log.info('Received msg xml of length ' + (xml && xml.length || '0'))
      msg_archive_db.saveMessage(xml, function (err, msg_info) {
        if (err) return next(err)
        log.info('Message saved to archive with instance_id: ' + msg_info.instance_id)

        if (msg_info.type == 'catalogItemNotification') {

          // call saveTradeItem for each item in parallel (after stream read is complete)
          var tasks = []
          config.gdsn.items.getEachTradeItemFromStream(req, function (err, item) {
            if (err) return next(err)

            if (item) {
              log.debug('received item from getEachTradeItemFromStream callback with gtin ' + item.gtin)

              var itemDigest = xml_digest.digest(item.xml)
              item.tradeItem = itemDigest.tradeItem

              tasks.push(function (callback) {
                trade_item_db.saveTradeItem(item, callback)
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
        } // end if (msg_info.type == 'catalogItemNotification') {
        else { // other message types
          /*
          if (msg_info.trade_items && msg_info.trade_items.length) {
            log.info('found item gtins: ' + msg_info.gtins.join(', '))
            var tasks = []
            msg_info.trade_items.forEach(function (item) {
              log.debug('callback with gtin ' + item.gtin)

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
            })
          }
          res.json(msg_info)
          */
        }
      })
    })

  }

  api.list_archive = function(req, res, next) {
    log.debug('list_archive params=' + JSON.stringify(req.query))
    var query = get_query(req)
    log.debug('query= ' + JSON.stringify(query))

    var page = parseInt(req.param('page'))
    log.info('page ' + page)
    if (!page || page < 0) page = 0
    msg_archive_db.listMessages(query, page, config.per_page_count, function (err, results) {
      if (err) return next(err)
      res.json(results)
    })
  }

  api.find_archive = function(req, res, next) {
    log.debug('find_archive params=' + JSON.stringify(req.query))
    
    var query = get_query(req)
    log.debug('query= ' + JSON.stringify(query))
    var instance_id = req.params.instance_id
    log.debug('find_message called with instance_id ' + instance_id)
    msg_archive_db.findMessage(instance_id, function (err, results) {
      if (err) return next(err)
      var item = results && results[0]

      if (!item) return next(new Error('item not found'))

      res.set('Content-Type', 'application/xml;charset=utf-8')
      if (req.query.download) {
        res.set('Content-Disposition', 'attachment; filename="item_' + item.gtin + '.xml"')
      }
      res.send(item.xml)
    })
  }

  function get_query(req) {
    var query = {}

    // drop down (exact match) is 1st choice
    var msg_type     = req.param('msg_type')
    if (msg_type) {
      query.type = msg_type
    } else {
      // free text is 2nd choice
      var msg_type_regex     = req.param('msg_type_regex')
      if (msg_type_regex) {
        query.type = {$regex: msg_type_regex}
      }
    }

    var instance_id       = req.param('instance_id')
    if (instance_id) {
      query.instance_id = {$regex: instance_id}
    }
    return query
  }

  return api
}
