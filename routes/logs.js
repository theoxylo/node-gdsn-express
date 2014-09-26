module.exports = function (config) {
  
  var async      = require('async')
  var log        = require('../lib/Logger')('rt_logs', {debug: true})
  var item_utils = require('../lib/item_utils.js')(config)
  var logs     = require('../lib/db/logs.js')(config)

  var api = {}

  api.list_logs = function(req, res, next) {
    log.debug('list_logs() req params= ' + JSON.stringify(req.query))

    var include_total_count = req.param('include_total_count') == 'true'

    var page = parseInt(req.param('page'))
    if (!page || page < 0) page = 0
    var per_page = parseInt(req.param('per_page'))
    if (!per_page || per_page < 0 || per_page > 10000) per_page = config.per_page_count  // increase max per_page to 10000

    var query = get_query(req)
    log.debug('list_logs() query= ' + JSON.stringify(query))
    var start = Date.now()
    var tasks = []
    tasks.push(function (callback) {
        logs.listLogs(query, page, per_page, callback)
    })
    if (include_total_count) tasks.push(function (callback) {
        logs.listLogs(query, page, per_page, callback, include_total_count)
    })
    async.parallel(tasks, function (err, results) {
      if (err) return next(err)
      var items = results[0]
      var total_item_count = results[1]
      log.info('logs list_logs (with total item count ' + total_item_count + ') returned ' + items.length + ' items in ' + (Date.now() - start) + 'ms')
      var item_count = (page * per_page) + 1
      items = items.map(function (item) {
        item.item_count_num = item_count++
        return item
      })
      var href = config.base_url + req.url
      var result = item_utils.get_collection_json(items, href)

      result.collection.page             = page
      result.collection.per_page         = per_page
      result.collection.item_range_start = (page * per_page) + 1
      result.collection.item_range_end   = (page * per_page) + items.length
      if (include_total_count) result.collection.total_item_count = total_item_count

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
        	var digitpattern = /\d+/g
            var matches = date_start.match(digitpattern)
            var month = matches[0] - 1
        	var day   = matches[1]
        	var year  = matches[2]
        	log.info("date_start: month=" +month+ ", day=" +day+ ", year=" +year)
            query.timestamp.$gt = (new Date(year, month, day)).getTime()
//          mongos> db.logs.find( { "timestamp": {$gt: new Date(2014, 7, 1)} } )
//          query.timestamp = { $gt: new Date(2014, 7, 22)}
        }
        if (date_end) {
        	var digitpattern = /\d+/g
            var matches = date_end.match(digitpattern)
            var month = matches[0] - 1
        	var day   = matches[1]
        	var year  = matches[2]
        	log.info("date_end: month=" +month+ ", day=" +day+ ", year=" +year)
        	query.timestamp.$lt = (new Date(year, month, day)).getTime()
        }
    }

    return query
  }

  return api;
}
