module.exports = function (config) {

  var _              = require('underscore')
  var async          = require('async')
  var request        = require('request')

  var log            = require('../lib/Logger')('rt_msg_arch', {debug: true})
  var msg_archive_db = require('../lib/db/msg_archive.js')(config)
  var trade_item_db  = require('../lib/db/trade_item.js')(config)
  var xml_digest     = require('../lib/xml_to_json.js')(config)
  var utils          = require('../lib/utils.js')(config)

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
        log.info('Message info saved to archive: ' + JSON.stringify(msg_info))

        if (!res.finished) {
          if (msg_info) {
            res.jsonp(msg_info)
          }
          else {
            res.jsonp({msg: 'Message not saved'})
          }
        }
      })
    })

    var tasks = []
    config.gdsn.items.getEachTradeItemFromStream(req, function (err, item) {
      if (err) {
        log.error('Error getting trade items from stream: ' + err)
        return
      }

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
          if (err) {
            error = true
            log.error('Error saving trade items for message: ' + err)
            return
          }
          else {
            results = _.flatten(results) // async.parallel returns an array of results arrays
            log.info('Saved trade item count: ' + results.length)
          }
        })
      }

    })
  }

  api.list_archive = function(req, res, next) {
    log.debug('list_archive params=' + JSON.stringify(req.query))
    var query = get_query(req)
    log.debug('query= ' + JSON.stringify(query))

    var page = parseInt(req.param('page'))
    log.info('page ' + page)
    if (!page || page < 0) page = 0
    var per_page = parseInt(req.param('per_page'))
    if (!per_page || per_page < 0 || per_page > 10000) per_page = config.per_page_count  // increase max per_page to 10000
    
    msg_archive_db.listMessages(query, page, per_page, function (err, results) {
    	if (err) return next(err)

      var result = utils.get_collection_json(results, null)
      
      result.collection.page             = page
      result.collection.per_page         = per_page
      result.collection.item_range_start = (page * per_page) + 1
      result.collection.item_range_end   = (page * per_page) + results.length

      if (!res.finished) res.jsonp(result)
    })
  }

  api.find_archive = function(req, res, next) {
    log.debug('find_archive params=' + JSON.stringify(req.query))
    
    //var query = get_query(req)
    //log.debug('query= ' + JSON.stringify(query))
    var msg_id = req.params.msg_id
    log.debug('find_message called with msg_id ' + msg_id)
    msg_archive_db.findMessage(msg_id, function (err, results) {
      if (err) return next(err)
      var item = results && results[0]
      if (!item) return next(new Error('item not found'))

      var field = req.param('field')
      if (field) {
          res.send(item[field])
      } else {
          res.set('Content-Type', 'application/xml;charset=utf-8')
          if (req.query.download) {
            res.set('Content-Disposition', 'attachment; filename="item_' + item.gtin + '.xml"')
          }
          res.send(item.xml)
      }
    })
  }

  function get_query(req) {
    var query = {}
    
    var msg_id       = req.param('msg_id')
    if (msg_id) {
      query.msg_id = {$regex: msg_id}
    }

    var req_msg_id       = req.param('req_msg_id')
    if (req_msg_id) {
      query.request_msg_id = {$regex: req_msg_id}
    }

    // drop down (exact match) is 1st choice
    var msg_type     = req.param('msg_type')
    if (msg_type) {
      query.msg_type = msg_type
    } else {
      // free text is 2nd choice
      var msg_type_regex     = req.param('msg_type_regex')
      if (msg_type_regex) {
        query.msg_type = {$regex: msg_type_regex}
      }
    }

    var source_dp       = req.param('source_dp')
    if (source_dp) {
      query.source_dp = {$regex: source_dp}
    }
    var recipient       = req.param('recipient')
    if (recipient) {
      query.recipient = {$regex: recipient}
    }
    var provider       = req.param('provider')
    if (provider) {
      query.sender = {$regex: provider}
    }
    var receiver       = req.param('receiver')
    if (receiver) {
      query.receiver = {$regex: receiver}
    }
    
    var created_st_date       = req.param('created_st_date')
    var created_end_date       = req.param('created_end_date')
    if (created_st_date || created_end_date) {
    	query.created_ts = {}
        if (created_st_date) {
        	query.created_ts.$gt = utils.getDateTime(created_st_date)
        }
        if (created_end_date) {
        	query.created_ts.$lt = utils.getDateTime(created_end_date) + utils.MILLIS_PER_DAY
        }
    }
    var modified_st_date       = req.param('modified_st_date')
    var modified_end_date       = req.param('modified_end_date')
    if (modified_st_date || modified_end_date) {
    	query.modified_ts = {}
        if (modified_st_date) {
        	query.modified_ts.$gt = utils.getDateTime(modified_st_date)
        }
        if (modified_end_date) {
        	query.modified_ts.$lt = utils.getDateTime(modified_end_date) + utils.MILLIS_PER_DAY
        }
    }
    
    var xml_regex       = req.param('xml_regex')
    if (xml_regex) {
      query.xml = {$regex: xml_regex}
    }
    var exc_regex       = req.param('exc_regex')
    if (exc_regex) {
      query.exception = {$regex: exc_regex}
    }
    
    return query
  }

  api.migrate_msg_archive = function (req, res, next) {
    log.debug('migrate_msg_archive handler called')

    var query = {
      archived_ts : {$exists: false}
      , msg_type: {$exists: false}
      //, msg_type: {$exists:false}
      //, modified_ts : {$lt: Date.now() - (24*60*60*3000)}
      //, migrated_ts : {$exists:false}
      //, $or: [{migrated_ts: {$lt: Date.now()}}, {migrated_ts:{$exists:false}}]
    }

    var msgsMigrated = []

    function migrateMessageBatch() {
      var include_xml = true
      msg_archive_db.listMessages(query, 0, 1, function (err, messages) {
        if (err) return next(err)
        log.info('migrate_msg_archive listMessages return count: ' + messages.length)

        if (!messages.length) {
          res.jsonp({msg: 'Migrated ' + msgsMigrated.length + ' messages: ' + msgsMigrated.join(', ')})
          return res.end()
        }

        var tasks = []
        messages.forEach(function (msg_info) {
          log.debug('migrating msg ' + (msg_info.instance_id || msg_info.msg_id))

          tasks.push(function (callback) {
            msg_archive_db.saveMessage(msg_info.raw_xml, function (err, saved_msg_info) {
              //if (err) return callback(err)
              if (err) return callback(null, 'msg not save, no msg_id')
              else callback(null, saved_msg_info.msg_id)
            })
          })
        })
        async.parallel(tasks, function (err, results) {
          if (err) log.debug('parallel err: ' + JSON.stringify(err))
          else log.debug('parallel results: ' + JSON.stringify(results))

          if (err) return next(err)
          results = _.flatten(results) // async.parallel returns an array of results arrays
          msgsMigrated = msgsMigrated.concat(results)

          // repeat after 0.1 seconds
          setTimeout(migrateMessageBatch, 500)
        })

      }, include_xml)
    }
    migrateMessageBatch()
  }

  api.post_to_gdsn = function(req, res, next) {
    log.info('dp-post target url: ' + config.dp_post_url)

    var xml = ''
    req.setEncoding('utf8')
    req.on('data', function (chunk) {
      log.debug('dp-post chunk.length: ' + (chunk && chunk.length))
      xml += chunk
      if (xml.length > 10 * 1000 * 1000) return res.end('msg xml too big - larger than 10 MB')
    })
    req.on('end', function () {
      request.post({
          url: config.dp_post_url
        , preambleCRLF: true
        , postambleCRLF: true
        , body: xml
        , auth: {
            'user': 'admin',
            'pass': 'devadmin',
            'sendImmediately': true
          }
        }, 
        function (err, response, body) {
          if (err) return next(err)
          var result = {
            statusCode: response.statusCode,
            timestamp: Date.now()
          }
          var headers = response.headers
          for (var prop in headers) {
            if (headers.hasOwnProperty(prop)) {
              console.log(prop + ': ' + headers[prop])
              result[prop] = headers[prop]
            }
          }
          res.end(body)
        }
      )
    })
  }

  return api
}
