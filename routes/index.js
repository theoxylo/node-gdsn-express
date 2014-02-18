(function () {

  var _    = require('underscore')
  var log  = require('../lib/Logger')('routes', {debug: true})

  exports.getSnoopHandler = function getSnoopHandler(count) {
    console.log('getSnoopHandler called')
    count = count || 0
    return function(req, res, next) {
      console.log('getSnoopHandler  handle req function called')
      res.cookie('test_response_cookie', 'some cookie data, count ' + count++)
      req.session.count = count
      req.session.timestamp = Date.now()
      res.contentType('text/html')
      res.render('snoop', {
        title: "Node HTTP Snoop",
        req: req,
        res: res
      })
    }
  }

  exports.post_archive = function (gdsn, database) {
    return function(req, res, next) {
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
          , content     : content
          , preview     : content && content.slice(0, 100)
          , content_type: req.headers['content-type']
        }
        database.saveMessage(info, function (err, id) {
          if (err) return done(err)
          log.info('Message saved to archive with instance_id: ' + id)
        })
        res.end('post content archive with ts ' + info.archive_ts)
      })
    }
  }

  exports.list_archive = function (gdsn, database) {
    return function(req, res, next) {
      log.debug('list_archive')
      database.listMessages(function (err, docs) {
        if (err) return next(err)
        res.json(docs);
      })
    }
  }

  exports.find_archive = function (gdsn, database) {
    return function(req, res, next) {
      log.debug('find_archive params ' + req.params) 
      var archive_id = req.params.archive_id
      log.debug('find_message called with archive_id ' + archive_id)
      //db.archive.find({instance_id: archive_id}, {content: 1}, function (err, docs) {
      database.findMessage(archive_id, function (err, docs) {
        if (err) return next(err)
        res.json(docs && docs[0] && docs[0].content);
      })
    }
  }

  exports.list_trade_items = function (gdsn, database) {
    return function(req, res, next) {
      log.debug('list_items')
      database.listTradeItems(function (err, docs) {
        if (err) return next(err)
        res.json(docs);
      })
    }
  }

  exports.find_trade_item = function (gdsn, database) {
    return function (req, res, next) {
      log.debug('find_item params ' + req.params)
      var item_id = req.params.item_id
      log.debug('find_item called with item ' + item_id)
      database.findTradeItem(item_id, function (err, docs) {
        res.json(docs && docs[0] && docs[0].xml);
      })
    }
  }

  exports.post_trade_items = function (gdsn, database) {
    return function (req, res, next) {
      console.log('post_trade_items handler called')
      var items = []

      //gdsn.getTradeItemsFromStream(req, function (err, items) {
      gdsn.getEachTradeItemFromStream(req, function (err, item) {
        if (err) return next(err)
        if (item) {
          database.saveTradeItem(item, function (err, gtin) {
            if (err) return next(err)
            items.push(gtin)
          })
        }
        else res.end('Saved ' + items.length + ' items: ' + items.join(', '))
      })
    }
  }

})()
