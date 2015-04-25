module.exports = function (config) {

  var log            = require('../lib/Logger')('rt_msg_arch', {debug: true})
  var utils          = require('../lib/utils.js')(config)
  var db_msg_archive = require('../lib/db/msg_archive.js')(config)

  var api = {}

  // mark all versions of a msg with an archived_ts, hiding them (soft-delete)
  api.archive_msg = function (req, res, next) {
    log.debug('archive_msg params=' + JSON.stringify(req.query))
    var msg_id = req.param('msg_id')
    var sender = req.param('sender')
    if (!msg_id || !sender) return next(Error('archive_msg: msg_id and sender are required'))

    db_msg_archive.findMessage(sender, msg_id, function (err, msg) {
      if (err) return next(err)
      if (!msg) return next(Error('message xml not found for msg_id: ' + msg_id + ', sender: ' + sender))

      db_msg_archive.saveMessage(msg.xml, function (err, results) {
        if (err) return next(err)
        if (!res.finished) {
          res.jsonp(results)
          res.end()
        }
      }
      , true) // add archived_ts to latest version of message (all versions are hidden)
    })
  }

  // remove archive_ts from latest version of msg_id/sender, making it available again
  api.unarchive_msg = function (req, res, next) {
    log.debug('unarchive_msg params=' + JSON.stringify(req.query))
    var msg_id = req.param('msg_id')
    var sender = req.param('sender')
    if (!msg_id || !sender) return next(Error('archive_msg: msg_id and sender are required'))

    db_msg_archive.findMessage(sender, msg_id, function (err, msg) {
      if (err) return next(err)
      if (!msg) return next(Error('message xml not found for msg_id: ' + msg_id + ', sender: ' + sender))

      db_msg_archive.saveMessage(msg.xml, function (err, results) {
        if (err) return next(err)
        if (!res.finished) {
          res.jsonp(results)
          res.end()
        }
      }
      , false) // add archived_ts to current message
    })
  }

  // 
  api.post_archive = function (req, res, next) {
    log.debug('>>>>>>>>>>>>>>>>>>>> post_archive  handler called')

    var xml = ''
    req.setEncoding('utf8')
    req.on('data', function (chunk) {
      log.debug('archive_post_chunk.length: ' + (chunk && chunk.length))
      xml += chunk
      if (xml.length > 10 * 1024 * 1024 && !res.finished) res.end('msg.xml too big - larger than 10 MB')
    })
    req.on('end', function () {
      log.info('Received msg.xml of length ' + (xml && xml.length || '0'))
      db_msg_archive.saveMessage(xml, function (err, msg_info) {
        if (err) return next(err)
        log.info('Message info saved to archive: ' + msg_info.msg_id + ', modified: ' + new Date(msg_info.modified_ts))

        if (!res.finished) {
          res.jsonp({msg:'Message info saved to archive: ' + msg_info.msg_id + 'sender: ' + msg_info.sender + ', modified: ' + new Date(msg_info.modified_ts)})
          res.end()
        }
      })
    })

  }

  // returns pages of msg_info
  api.msg_history = function (req, res, next) {
    log.debug('msg_history req query string: ' + JSON.stringify(req.query))
    var query = get_query(req)
    query.msg_id = req.param('msg_id') // change to exact match, 
    query.sender = req.param('sender') // since getQuery uses a regex
    log.debug('query= ' + JSON.stringify(query))

    var page = parseInt(req.param('page'))
    log.info('page ' + page)
    if (!page || page < 0) page = 0

    var per_page = parseInt(req.param('per_page'))
    if (!per_page || per_page < 0 || per_page > 10000) per_page = config.per_page_count  // max per_page is 10k
    log.info('per_page ' + per_page)
    
    db_msg_archive.listMessages(query, page, per_page, function (err, results) {
      if (err) return next(err)

      results = results || []
      results.forEach(function (msg) {
        msg.gdsn_repostable = (msg.receiver == config.homeDataPoolGln)
      })

      var result = utils.get_collection_json(results, null)
      result.collection.page             = page
      result.collection.per_page         = per_page
      result.collection.item_range_start = (page * per_page) + 1
      result.collection.item_range_end   = (page * per_page) + results.length

      if (!res.finished) {
        res.jsonp(result)
        res.end()
      }
    }, /* all fields */ true, /* include history */ true)
  }

  // returns pages of msg_info
  api.list_archive = function (req, res, next) {
    log.debug('list_archive req query string: ' + JSON.stringify(req.query))
    var query = get_query(req)
    log.debug('query= ' + JSON.stringify(query))

    var page = parseInt(req.param('page'))
    log.info('page ' + page)
    if (!page || page < 0) page = 0

    var per_page = parseInt(req.param('per_page'))
    if (!per_page || per_page < 0 || per_page > 10000) per_page = config.per_page_count  // max per_page is 10k
    log.info('per_page ' + per_page)
    
    db_msg_archive.listMessages(query, page, per_page, function (err, results) {
      if (err) return next(err)

      results = results || []
      results.forEach(function (msg) {
        msg.gdsn_repostable = (msg.receiver == config.homeDataPoolGln)
      })

      var result = utils.get_collection_json(results, null)
      
      result.collection.page             = page
      result.collection.per_page         = per_page
      result.collection.item_range_start = (page * per_page) + 1
      result.collection.item_range_end   = (page * per_page) + results.length

      if (!res.finished) {
        res.jsonp(result)
        res.end()
      }
    })
  }

  // finds single message only
  api.find_archive = function (req, res, next) {
    log.debug('find_archive params=' + JSON.stringify(req.query))
    
    var msg_id = req.param('msg_id')
    var sender = req.param('sender')
    log.debug('find_message called for msg_id: ' + msg_id + ', and sender: ' + sender)

    db_msg_archive.findMessage(sender, msg_id, function (err, msg) {
      if (err) return next(err)
      if (!msg) return next(Error('message not found for msg_id: ' + msg_id + ', and sender: ' + sender))

      var field = req.param('field')
      if (field) {
          res.send(msg[field])
      } else {
        res.set('Content-Type', 'application/xml;charset=utf-8')
        if (req.query.download) {
          res.set('Content-Disposition', 'attachment; filename="item_' + msg.gtin + '.xml"')
        }
        if (!res.finished) {
          res.send(msg.xml)
          res.end()
        }
      }
    })
  }

  return api
}

// private utility functions

function get_query(req) {
  var query = {}
  
  var sender       = req.param('sender')
  if (sender) {
    query.sender = {$regex: sender}
  }
  else query.sender = {$exists: true} // every message must have a msg_id and sender

  var msg_id       = req.param('msg_id')
  if (msg_id) {
    query.msg_id = {$regex: msg_id}
  }
  else query.msg_id = {$exists: true} // every message must have a msg_id and sender

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
    query.provider = {$regex: provider}
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

