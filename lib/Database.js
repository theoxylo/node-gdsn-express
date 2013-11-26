(function () {

  var mongojs = require('mongojs')
  var log = require('./Logger.js')('database')

  var mdb = mongojs('gdsn', ['msg_in', 'msg_out'])

  log.info('connected to mongo db instance')
  for (var key in mdb) {
    if (mdb.hasOwnProperty(key) && !mdb[key].apply) {
      log.info(key + ': ' + mdb[key])
    }
  }

  module.exports = mdb

})()
