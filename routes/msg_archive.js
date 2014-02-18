module.exports = function (config) {

  var api = {}
  var log  = require('../lib/Logger')('routes_archive', {debug: true})

  api.post_archive = function(req, res, next) {
    var content = ''
    req.setEncoding('utf8')
    req.on('data', function (chunk) {
      log.debug('archive_post_chunk: ' + chunk)
      content += chunk
      if (content.length > 10 * 1000 * 1000) return res.end('content too big - larger than 10 MB')
    })
    req.on('end', function () {
      log.info('Received POST content of length ' + (content && content.length || '0'))
      //log.debug('Received POST content: ' + content)

      var ts = Date.now()

      var tagName = 'InstanceIdentifier'
      var matches = content.match(RegExp(tagName + '>([^<.]*)'))
      var id = (matches && matches[1]) || 'id_' + ts
      log.info('posted instance id: ' + id)

      var info = {
        archive_ts    : ts
        , instance_id : id
        , xml         : content
      }
      config.database.saveMessage(info, function (err, id) {
        if (err) return done(err)
        log.info('Message saved to archive with instance_id: ' + id)
      })
      res.end('post content archive with ts ' + info.archive_ts)
    })
  }

  api.list_archive = function(req, res, next) {
    log.debug('list_archive')
    config.database.listMessages(function (err, results) {
      if (err) return next(err)
      res.json(results);
    })
  }

  api.find_archive = function(req, res, next) {
    log.debug('find_archive params ' + req.params) 
    var instance_id = req.params.instance_id
    log.debug('find_message called with instance_id ' + instance_id)
    config.database.findMessage(instance_id, function (err, results) {
      if (err) return next(err)
      res.json(results && results[0] && results[0].xml);
    })
  }

  return api
}
