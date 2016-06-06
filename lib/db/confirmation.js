module.exports = function (config) {

  var log = require('../Logger')('db_cic', config)

  var options = { timeout: config.db_timeout }
  
  var api = {}

  api.save_cic = function (cic, callback) {

      var query = {
          recipient: cic.recipient
        , provider : cic.provider
        , gtin     : cic.gtin
        , tm       : cic.tm
        , tm_sub   : cic.tm_sub
        //, msg_id   : cic.msg_id
      }

      try {
        config.database.confirmations.update(query, cic, {upsert: true})
        log.debug('Persisted cic: ' + JSON.stringify(cic))
        log.info('Persisted cic: ' + cic.msg_id)
        return callback(null, cic)
      }
      catch (err) {
        log.error('Error persisting cic: ' + err)
        return callback(err)
      }
  }

  api.list_cic = function (page, perPage, callback) {
      config.database.confirmations
        .find({}, {_id: 0}, options) // include xml
        .sort({modified_ts: -1})
        .skip(page * perPage)
        .limit(perPage)
        .toArray(callback)
  }

  return api
}
