module.exports = function (config) {

  var _     = require('underscore')
  var async = require('async')
  var log   = require('./Logger')('item_utils', {debug: true})
  var trade_item_db = require('../lib/db/trade_item.js')(config)

  var req_id_seq = 0

  var api = {}

  api.get_auto_req_id = function () { 
    return ("req_" + req_id_seq++) 
  }

  api.get_info_logger = function(logger, req_id) {
    if (!logger) logger = log
    if (!req_id) req_id = this.get_auto_req_id()
    return function (msg) {
      logger.info(req_id + ' ' + msg)
    }
  }

  api.de_dupe_items = function (items) {
    //log.debug('dedup start: ' + _.pluck(items, 'gtin').join())
    var length = items ? items.length : 0
    if (length < 2) return items
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
          log.debug('excluding older item with gtin ' + most_recent[slug].gtin)
          most_recent[slug] = item
        }
      }

    })
    var results = slugs.map(function (e) {
      return most_recent[e]
    })
    //log.debug('dedup end: ' + _.pluck(results, 'gtin').join())
    log.debug('de_dupe_items: ' + length + ' -> ' + results.length)
    return results
  }

  api.get_query = function (req) {
    var query = {}

    var req_id      = req.param('req_id')
    var gtin        = req.param('gtin')
    var provider    = req.param('provider')
    var tm          = req.param('tm')
    var tm_sub      = req.param('tm_sub')
    var recipient   = req.param('recipient')
    var xml_text    = req.param('xml_text')
    var msg_id_text = req.param('msg_id_text')
    var unit_type   = req.param('unit_type')

    if (!req_id) req_id = this.get_auto_req_id()
    if (config.enable_query_req_id) query['req_id_' + req_id] = {"$exists":false}
    //if (config.enable_query_req_id) query = {$query: query, $comment: 'req_id ' + req_id} //query['req_id_' + req_id] = {"$exists":false}

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
    if (xml_text) {
      query.xml = {$regex: xml_text}
    }
    if (msg_id_text) {
      query.msg_id = {$regex: msg_id_text}
    }

    if (unit_type) {
      query.unit_type = unit_type
    }

    //query.archived_ts = { $in : ['', null] }
    query.archived_ts = { $exists : false }
    return query
  }

  api.get_item_href = function (item) {
    var href = config.base_url 
    href += '/items'
    if (item.recipient) {
      href += '/' + item.recipient
      if (item.gtin) {
        href += '/' + item.gtin 
        if (item.provider) {
          href += '/' + item.provider 
          if (item.tm) {
            href += '/' + item.tm 
            if (item.tm_sub) {
              href += '/' + item.tm_sub
            }
          }
        }
      }
    }
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

  api.fetch_all_children = function (item, req_id, callback) {
    this.get_item_and_children(item, 0, req_id, [], callback)
  }

  api.get_item_and_children = function (item, count, req_id, searched_gtins, callback) {

    log.debug('get_item_and_children called with item gtin ' + (item ? item.gtin : 'n/a') + ' and count ' + count)

    var info = this.get_info_logger(log, req_id)

    if (!item) {
      return setImmediate(function () {
        callback(Error('get_item_and_children item argument is missing'))
      })
    }

    if (searched_gtins.indexOf(item.gtin) == -1) searched_gtins.push(item.gtin)

    if (count > 100) {
      return setImmediate(function () {
        callback(Error('hierarchy too large or endless for gtin ' + item.gtin))
      })
    }

    if (count) item.fetch_type = 'child'

    var child_gtins = item.child_gtins || []

    child_gtins = child_gtins.filter(function (gtin) {
      if (gtin == item.gtin) {
        info('skipping self child gtin ' + item.gtin)
        return false
      }
      if (searched_gtins.indexOf(gtin) > -1) {
        info('skipping already queried child gtin ' + item.gtin)
        return false
      }
      else {
        searched_gtins.push(gtin)
        return true
      }
    })

    if (!child_gtins.length) {
      info('get_item_and_children found 0 unvisited children for parent item ' + item.gtin)
      return setImmediate(function () {
        callback(null, [item]) // no further unvisited, but include self!
      })
    }

    var query = {
        gtin        : (child_gtins.length == 1 ? child_gtins[0] : { $in: child_gtins })
      , recipient   : item.recipient
      , provider    : item.provider
      , tm          : item.tm
      , tm_sub      : item.tm_sub
      , archived_ts : { $exists : false }
    }  
    if (config.enable_query_req_id && req_id) query['req_id_' + req_id] = {"$exists":false}

    var start = Date.now()
    log.debug('fetching children for item ' + item.gtin + ' -> ' + child_gtins.join() + ' at time ' + start)

    var include_xml = false // for db projection

    var self = this

    trade_item_db.getTradeItems(query, 0, 100, include_xml, function (err, children) { // only support up to 100 children per child
      if (err) return callback(err)

      info('db found ' + (children && children.length) + ' children for gtin ' + item.gtin + ' in ' + (Date.now() - start) + 'ms')

      if (!children || !children.length) {
        log.warn('no items found for specified child gtins: ' + child_gtins.join())
        return callback(null, [])
      }

      if (children.length != child_gtins.length) { // only warn, no error for incomplete hierarchy
        log.warn('incomplete hierarchy found, some of specified child gtins were not found: ' + child_gtins.join())
      }

      if (children.length == 1) {
        return self.get_item_and_children(children[0], count + 1, req_id, searched_gtins, function (err, results) {
          if (err) return callback(err)
          log.debug(req_id + ' get_item_and_children single task final child count: ' + results.length)
          if (count) results.unshift(item) // include the original item in first position
          callback(null, results)
        })
      }

      var tasks = []
      children.forEach(function (child) {
        tasks.push(function (callback) {
          self.get_item_and_children(child, count + 1, req_id, searched_gtins, callback)
        })
      })
      async.parallel(tasks, function (err, results) {
        if (err) return callback(err)
        results = _.flatten(results) // async.parallel returns an array of results arrays
        log.debug(req_id + ' get_item_and_children parallel tasks final child count: ' + results.length)
        if (count) results.unshift(item) // include the original item in first position
        callback(null, results)
      })
    })
  }

  api.fetch_all_parents = function (item, req_id, callback) {
    this.get_item_and_parents(item, 0, req_id, [], callback)
  }

  api.get_item_and_parents = function (item, count, req_id, searched_gtins, callback) {

    log.debug('get_item_and_parents called with item gtin ' + (item ? item.gtin : 'n/a') + ' and count ' + count)

    var info = this.get_info_logger(log, req_id)

    if (!item) {
      return setImmediate(function () {
        callback(Error('get_item_and_parents item argument is missing'))
      })
    }

    if (searched_gtins.indexOf(item.gtin) == -1) {
      searched_gtins.push(item.gtin)
    }
    else {
      info('get_item_and_parents skipping already searched item ' + item.gtin)
      return setImmediate(function () {
        callback(null, []) // already included
      })
    }

    if (count > 100) {
      return setImmediate(function () {
        callback(Error('get_item_and_parents hierarchy too large or endless for gtin ' + item.gtin))
      })
    }

    if (count) item.fetch_type = 'parent'

    var query = {
        child_gtins : { $all:[item.gtin] }
      , recipient   : item.recipient
      , provider    : item.provider
      , tm          : item.tm
      , tm_sub      : item.tm_sub
      , archived_ts : { $exists : false }
    }

    if (config.enable_query_req_id && req_id) query['req_id_' + req_id] = {"$exists":false}

    var start = Date.now()
    log.debug('fetching all parents for item ' + item.gtin + ' at time ' + start)

    var include_xml = false // for db projection

    var self = this

    trade_item_db.getTradeItems(query, 0, 100, include_xml, function (err, parents) { // only support up to 100 children per child
      if (err) return callback(err)

      info('db found ' + (parents && parents.length) + ' parents for gtin ' + item.gtin + ' in ' + (Date.now() - start) + 'ms')

      if (count > 100) {
        return callback(Error('hierarchy too large or endless for gtin ' + item.gtin))
      }

      if (!parents || !parents.length) {
        return callback(null, [item])
      }

      if (parents.length == 1) {
        return self.get_item_and_parents(parents[0], count + 1, req_id, searched_gtins, function (err, results) {
          if (err) return callback(err)
          log.debug(req_id + ' get_item_and_parents single task final parent count: ' + results.length)
          if (count) results.unshift(item) // include the original parent item in first position
          callback(null, results)
        })
      }

      var tasks = []
      parents.forEach(function (parent) {
        tasks.push(function (callback) {
          self.get_item_and_parents(parent, count + 1, req_id, searched_gtins, callback)
        })
      })
      async.parallel(tasks, function (err, results) {
        if (err) return callback(err)
        results = _.flatten(results) // async.parallel returns an array of results arrays
        log.debug(req_id + ' get_item_and_parents parallel tasks final parent count: ' + results.length)
        if (count) results.unshift(item) // include the original child item in first position
        callback(null, results)
      })
    })
  }

  return api

}
