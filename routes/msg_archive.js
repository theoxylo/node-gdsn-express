module.exports = function (config) {

  var api = {}
  var log  = require('../lib/Logger')('routes_archive', {debug: true})

  api.post_archive = function(req, res, next) {
    console.log('post_archive  handler called')

    var content = ''
    req.setEncoding('utf8')
    req.on('data', function (chunk) {
      log.debug('archive_post_chunk: ' + chunk)
      content += chunk
      if (content.length > 10 * 1000 * 1000) return res.end('content too big - larger than 10 MB')
    })
    req.on('end', function () {
      log.info('Received POST msg content of length ' + (content && content.length || '0'))
      config.database.saveMessageString(content, function (err, id) {
        if (err) return done(err)
        log.info('Message saved to archive with instance_id: ' + id)
        res.end('post content archive with ts ' + id)
      })
    })
  }

  api.list_archive = function(req, res, next) {
    log.debug('list_archive')
    var page = parseInt(req.param('page'))
    log.info('page ' + page)
    if (!page || page < 0) page = 0
    config.database.listMessages(page, config.per_page_count, function (err, results) {
      if (err) return next(err)
      res.json(results)
    })
  }

  api.find_archive = function(req, res, next) {
    log.debug('find_archive params ' + req.params) 
    var instance_id = req.params.instance_id
    log.debug('find_message called with instance_id ' + instance_id)
    config.database.findMessage(instance_id, function (err, results) {
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
