(function () {

  var mongojs = require('mongojs')
  var log = require('./Logger.js')('database', {debug: true})

  var connect = function(config) {
      if (!config.url) throw new Error('db url is required')
      log.debug('db url: ' + config.url)

      var mdb = mongojs(config.url, ['msg_in', 'msg_out', 'archive', 'trade_items'])

      //var mdb = mongojs('gdsn', ['msg_in', 'msg_out', 'archive'])
      //var mdb = mongojs('data_pool_user:data_pool@plt-elas01.itradenetwork.com', ['msg_in', 'msg_out', 'archive'])
      //var mdb = mongojs('toneill:toneill@plt-elas01.itradenetwork.com', ['msg_in', 'msg_out', 'archive'])

      mdb.msg_out.ensureIndex({id: 1})

      log.info('connected to mongo db instance')
      for (var key in mdb) {
        if (mdb.hasOwnProperty(key) && !mdb[key].apply) {
          log.info(key + ': ' + mdb[key])
        }
      }
      return mdb
  }

  module.exports = connect

})()
