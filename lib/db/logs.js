module.exports = function (config) {

  var log = {
    debug: function (msg) { if (config.debug) console.log(msg) }
    , info: function (msg) { console.log(msg) }
  }

  var api = {}

  api.saveLogEntry = function (msg, username, duration, callback) {
    var start = Date.now()
    var entry = {
        message   : msg
      , username  : username
      , duration  : duration
      , timestamp : start
    }
    config.database.logs.save(entry, function (err, result) {
      log.info('saveLogEntry took ' + (Date.now() - start) + ' ms for result ' + result)
      if (err) return callback(err)
      callback(null, result, entry)
    })
  }
  
  api.listLogs = function (query, page, perPage, callback, count_only) {
    var req_id = config.request_counter++
    try {
      log.info('listLogs() page=' + page)
      query = query || {}

      var slow_warn = config.slow_warn_ms || 1000
      var max_count = config.total_item_count_limit || 500

      var start = Date.now()
      log.debug(req_id + ' db.logs.find( ' + JSON.stringify(query) + ' ) started at ' + start + (count_only ? ' (counting ' + max_count + ')' : ''))

      if (count_only) {
        config.database.logs
        .find(query, {})
        .sort({timestamp: -1})
        .skip(max_count)
        .limit(1)
        .toArray(function (err, result) {
          var time = Date.now() - start
          log.info(req_id + ' query ' + JSON.stringify(query) + ' found count over ' + max_count + ': ' + (result && result.length) +  ' in ' + time + 'ms' + (time > slow_warn ? ' SLOW' : ''))

          if (err) return callback(err)
          if (result && result.length) return callback(null, max_count + '+')

          // if max_count or less, get actual total count (slow)
          var start2 = Date.now()
          log.debug(req_id + ' db.logs.find.count( ' + JSON.stringify(query) + ' ) started at ' + start2)
          config.database.logs
          .find(query, {})
          .sort({timestamp: -1})
          .count(function (err, result) { // very very slow!
            var time = Date.now() - start2
            log.info(req_id + ' query ' + JSON.stringify(query) + ' found count ' + result +  ' in ' + time + 'ms' + (time > slow_warn ? ' SLOW' : ''))
            callback(err, result)
          })
        })
      } else {
          config.database.logs
          .find(query)
          .sort({timestamp: -1})
          .skip(page * perPage)
          .limit(perPage)
          .toArray(callback)
      }
    }
    catch (err) {
      setImmediate(function () {
        callback(err)
      })
    }
  }

  return api;
}
