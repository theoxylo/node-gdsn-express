module.exports = function (config) {
  
  var async      = require('async')
  var log        = require('../lib/Logger')('rt_logs', config)
  var utils      = require('../lib/utils.js')(config)
  var logs       = require('../lib/db/logs.js')(config)

  var api = {}

  api.list_logs = function(req, res, next) {
    //log.debug('list_logs() req params= ' + JSON.stringify(req.query))
    var page = parseInt(req.param('page'))
    if (!page || page < 0) page = 0
    var per_page = parseInt(req.param('per_page'))
    if (!per_page || per_page < 0 || per_page > 10000) per_page = config.per_page_count  // increase max per_page to 10000

    var query = get_query(req)
    log.debug('list_logs() query= ' + JSON.stringify(query))
    var start = Date.now()
    logs.listLogs(query, page, per_page, function (err, items) {
      if (err) return next(err)
      log.info('logs list_logs returned ' + items.length + ' items in ' + (Date.now() - start) + 'ms')
      var item_count = (page * per_page) + 1
      items = items.map(function (item) {
        item.item_count_num = item_count++
        return item
      })
      var href = config.base_url + req.url
      var result = utils.get_collection_json(items, href)

      result.collection.page             = page
      result.collection.per_page         = per_page
      result.collection.item_range_start = (page * per_page) + 1
      result.collection.item_range_end   = (page * per_page) + items.length

      if (!res.finished) res.jsonp(result)
    })
  }

  function get_query(req) {
    var query = {}

    var message     = req.param('regex')
    if (message) {
      query.message = {$regex: message}
    }

    var level       = req.param('level')
    if (level) {
      query.level = level
    }

    var username       = req.param('username')
    if (username) {
//    	query["meta.user"] = username
    	query.username = username
    }

    var duration       = parseInt( req.param('duration') )
    if (duration) {
//    	query["meta.duration"] = { $gt: duration }
    	query.duration = { $gt: duration }
    }

    var date_start       = req.param('date_start')
    var date_end       = req.param('date_end')
    if (date_start || date_end) {
    	query.timestamp = {}
        if (date_start) {
        	query.timestamp.$gt = utils.getDateTime(date_start)
//          mongos> db.logs.find( { "timestamp": {$gt: new Date(2014, 7, 1)} } )
//          query.timestamp = { $gt: new Date(2014, 7, 22)}
        }
        if (date_end) {
        	query.timestamp.$lt = utils.getDateTime(date_end) + utils.MILLIS_PER_DAY
        }
    }

    return query
  }

  return api;
}
