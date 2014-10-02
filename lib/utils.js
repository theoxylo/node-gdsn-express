module.exports = function (config) {

/*
  var _     = require('underscore')
  var async = require('async')
  var log   = require('./Logger')('util', {debug: true})
*/
  var api = {}

  api.MILLIS_PER_DAY = (24 * 60 * 60 * 1000) 

  api.get_collection_json = function (items, href) {
    items = items || []
    if (!Array.isArray(items)) items = [items]
    var result = {
      collection: {
        version: '1.0'
        , timestamp: Date.now()
        , href  : href
        , item_count: items.length
        , items : items
      }
    }
    return result
  }

  // digitPattern default is m/d/yyyy
  api.getDateTime = function (strDate, digitPattern) {
	digitPattern = digitPattern || /\d+/g
    var matches = strDate.match(digitPattern)
    var month = matches[0] - 1
	var day   = matches[1]
	var year  = matches[2]
    return (new Date(year, month, day)).getTime()
  }

  return api
}
