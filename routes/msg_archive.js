module.exports = function (config) {

  var log            = require('../lib/Logger')('rt_msg_arch', {debug: true})
  var msg_archive_db = require('../lib/db/msg_archive.js')(config)
  var xml_digest     = require('../lib/xml_to_json.js')(config)

  var api = {}

  api.post_archive = function(req, res, next) {
    console.log('post_archive  handler called')
    var xml = ''
    req.setEncoding('utf8')
    req.on('data', function (chunk) {
      //log.debug('archive_post_chunk: ' + chunk)
      xml += chunk
      if (xml.length > 10 * 1000 * 1000) return res.end('msg xml too big - larger than 10 MB')
    })
    req.on('end', function () {
      log.info('Received POST msg xml of length ' + (xml && xml.length || '0'))
      msg_archive_db.saveMessage(xml, function (err, msg_info) {
        if (err) return next(err)
        //log.debug(JSON.stringify(msg_info))
        log.info('Message saved to archive with instance_id: ' + msg_info.instance_id)

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
      })
    })
  }

  api.list_archive = function(req, res, next) {
    log.debug('list_archive')
    var page = parseInt(req.param('page'))
    log.info('page ' + page)
    if (!page || page < 0) page = 0
    msg_archive_db.listMessages(page, config.per_page_count, function (err, results) {
      if (err) return next(err)
      res.json(results)
    })
  }

  api.find_archive = function(req, res, next) {
    log.debug('find_archive params ' + req.params) 
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

  return api
}
