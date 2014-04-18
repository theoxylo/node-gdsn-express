module.exports = function (config) {
  
  var api = {}

  var log  = require('./Logger')('item_ut', {debug: true})

  api.de_dupe_items = function (items) {
    log.info('de_dupe_items called with item count ' + items.length)
    if (!items || items.length < 2) return items
    var most_recent = {}
    var slugs = []
    items.forEach(function (item) {
      var slug = item.recipient + '_' + item.gtin + '_' + item.provider + '_' + item.tm + '_' + item.tm_sub
      //item.slug = slug
      var index = slugs.indexOf(slug)
      if (index === -1) { // first item occurence
        slugs.push(slug)
        most_recent[slug] = item
      }
      else { // repeated occurence, check timestamp
        if (most_recent[slug].modified_ts < item.modified_ts) {
          most_recent[slug] = item
        }
      }

    })
    var results = slugs.map(function (e) {
      return most_recent[e]
    })
    log.info('dedup after count ' + results.length)
    return results
  }

  api.get_query = function (req) {
    var query = {}

    var gtin      = req.param('gtin')
    var provider  = req.param('provider')
    var tm        = req.param('tm')
    var tm_sub    = req.param('tm_sub')
    var recipient = req.param('recipient')

    if (gtin) {
      if (gtin.length == 14) query.gtin = gtin
      else query.gtin = { $regex: gtin }
    }
    if (provider) {
      if (provider.length == 13) query.provider = provider
      else query.provider = { $regex: provider }
    }
    if (tm) {
      if (tm.length == 3) query.tm = tm
      else query.tm = { $regex: tm }
    }
    if (tm_sub) {
      if (tm_sub.length == 5 || tm_sub == 'na') query.tm_sub = tm_sub
      else query.tm_sub = { $regex: tm_sub }
    }
    if (recipient) {
      if (recipient.length == 13) query.recipient = recipient
      else query.recipient = { $regex: recipient }
    }
    return query
  }

  api.get_item_href = function (item) {
    var href = config.base_url 
    href += '/items'
    href += '/' + item.recipient
    href += '/' + item.gtin 
    href += '/' + item.provider 
    href += '/' + item.tm 
    href += '/' + item.tm_sub
    return href
  }

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

  api.fetch_children = function (item, query, cb, results, parents) {

    parents = parents || []
    results = results || []

    if (!item) return cb(null, results)

    var self = this
    if (item.child_gtins && item.child_gtins.length) {
      if (item.child_gtins.length > 1) {
        query.gtin = { $in: item.child_gtins }
      }
      else {
        query.gtin = item.child_gtins[0]
      }
      config.database.getTradeItems(query, 0, 100, true, false, function (err, items) {
        if (err) return cb(err)
        log.info('db found children: ' + items.length)
        items = api.de_dupe_items(items)
        results = results.concat(items)
        parents = parents.concat(items)
        self.fetch_children(parents.shift(), query, cb, results, parents)
      })
    }
    else {
      self.fetch_children(parents.shift(), query, cb, results, parents)
    }
  }

  api.fetch_parents = function (item, query, cb, all_items, items_to_check) {

    items_to_check = items_to_check || []
    all_items = all_items || []

    if (!item) return cb(null, all_items)

    query.child_gtins = item.gtin

    var self = this
    config.database.getTradeItems(query, 0, 100, true, false, function (err, items) {
      if (err) return cb(err)
      log.info('db found parents: ' + items.length)
      items = api.de_dupe_items(items)
      all_items = all_items.concat(items)
      items_to_check = items_to_check.concat(items)
      self.fetch_parents(items_to_check.shift(), query, cb, all_items, items_to_check)
    })
  }

  return api

}
