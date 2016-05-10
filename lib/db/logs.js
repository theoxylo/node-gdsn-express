module.exports = function (config) {

  var log = {
    debug: function (msg) { if (config.debug) console.log(msg) }
    , info: function (msg) { console.log(msg) }
  }

  var options = { timeout: config.db_timeout }

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
      try { result = JSON.stringify(result) }
      catch (e) {}
      log.info('saveLogEntry took ' + (Date.now() - start) + ' ms for result ' + result)
      if (err) return callback(err)
      callback(null, result)
    })
  }
  
  api.listLogs = function (query, page, perPage, callback) {
    var req_id = config.request_counter++
    try {
      log.info('listLogs() page=' + page)
      query = query || {}

      var start = Date.now()
      log.debug(req_id + ' db.logs.find( ' + JSON.stringify(query) + ' ) started at ' + start)
      config.database.logs
        .find(query, {}, options)
        .sort({timestamp: -1})
        .skip(page * perPage)
        .limit(perPage)
        .toArray(callback)
    }
    catch (err) {
      setImmediate(function () {
        callback(err)
      })
    }
  }

  return api;
}
