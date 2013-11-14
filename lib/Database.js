(function () {

var log = require('./Logger.js')('database')

var mongojs = require('mongojs')

var db = module.exports = mongojs('gdsn', ['msg_in', 'msg_out'])

log.info('connected to mongo db instance')
for (var key in db) {
  if (db.hasOwnProperty(key)) log.info('db.' + key)
}

})()
