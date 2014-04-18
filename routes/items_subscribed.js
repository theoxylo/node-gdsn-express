module.exports = function (config) {
  
  var log  = require('../lib/Logger')('rt_subsc', {debug: true})

  var item_utils = require('../lib/item_utils.js')(config)
  var xml_digest = require('../lib/xml_to_json.js')(config)

  var data = {}

  function processFoundItems(err, items) {
    if (err) return data.next(err)
    log.info('get_subscribed_item  getTradeItems return item count: ' + items.length)

    items = item_utils.de_dupe_items(items)

    if (items.length == 0) {
      var result = item_utils.get_collection_json([], config.base_url + data.req.url)
      result.collection.error = {
        title    : 'Item not found'
        , code   : '598'
        , message: 'no item was found for the given criteria'
      }
      data.res.jsonp(result)
      return
    }

    var allow_multiple = data.req_param['multi']
    if (!allow_multiple) {
      if (items.length > 1) {
        var href = config.base_url + data.req.url
        var result = item_utils.get_collection_json([], href)
        result.collection.error = {
          title    : 'Unique item not found'
          , code   : '597'
          , message: 'more than one item was found for the given criteria'
        }
        href += ((href.indexOf('?') == -1) ? '?' : '&')
        result.collection.links = [
            {rel: 'multi', href: href + 'multi=true'}
        ]
        items.forEach(function (item) {
          item.href = get_item_href(item)
          result.collection.links.push({rel: 'match', href: item.href})
        })
        data.res.jsonp(result)
        return
      }
    }

    items = items.map(function (e) { e.fetch_type = 'match' ; return e })

    var items_with_children = (data.req_param['children'] ? items.slice() : [])
    var items_with_parents = (data.req_param['parents'] ? items.slice() : [])

    expandChildren(items_with_children, items, function (err, items) {
      expandParents(items_with_parents, items, presentResults)
    })
  }

  function expandChildren (root_items, all_items, cb) {
    var item = root_items.shift()
    if (!item) return cb(null, all_items)
    log.debug(item)
    var child_query = {
      recipient : item.recipient,
      provider  : item.provider,
      tm        : item.tm,
      tm_sub    : item.tm_sub
    }

    item_utils.fetch_children(item, child_query, function (err, children) {
      if (err) return cb(err)
      log.info('fetch children callback with children length: ' + children.length)
      children = children.map(function (e) { e.fetch_type = 'child'; return e })
      all_items = all_items.concat(children)
      log.info('items length after adding some children: ' + all_items.length)
      expandChildren(root_items, all_items, cb)
    })
  }

  function expandParents (root_items, all_items, cb) {
    var item = root_items.shift()
    if (!item) return cb(null, all_items)
    log.debug(item)
    var parent_query = {
      recipient : item.recipient,
      provider  : item.provider,
      tm        : item.tm,
      tm_sub    : item.tm_sub
    }

    item_utils.fetch_parents(item, parent_query, function (err, parents) {
      if (err) return cb(err)
      log.info('fetch parents callback with parents length: ' + parents.length)
      parents = parents.map(function (e) { e.fetch_type = 'parent'; return e })
      all_items = all_items.concat(parents)
      log.info('items length after adding some parents: ' + all_items.length)
      expandParents(root_items, all_items, cb)
    })
  }

  function get_item_href(item) {
    var href = config.base_url 
    href += '/subscribed'
    href += '/' + item.gtin 
    href += '/' + item.provider 
    href += '/' + item.tm 
    href += '/' + item.tm_sub
    return href
  }

  function presentResults(err, result_items) {
    if (err) return data.next(err)

    result_items = item_utils.de_dupe_items(result_items)

    result_items = result_items.map(function (item) {

      log.debug('augmenting gtin ' + item.gtin)

      var itemDigest = xml_digest.digest(item.xml)
      item.tradeItem = itemDigest.tradeItem

      item.req_user    = data.req.user
      item.client_name = data.client_config.client_name

      item.href = get_item_href(item)

      item.data = [
        {
          prompt: 'Item GTIN (required)'
          , name: 'gtin'
          , value: item.gtin
        }
      ]
      item.links = [
        { rel: 'self', href: item.href }
      ]

      if (data.req_param['transform'] == 'server') {
        log.debug('applying server transforms for client ' + data.req.user)

        if (data.client_config.mappings) {
          log.info('applying profile xpath mappings for client ' + data.req.user + ' to item GTIN ' + item.gtin)
          try {
            item.tradeItem = config.gdsn.getCustomTradeItemInfo(item.xml, data.client_config.mappings)
          }
          catch (e) {
            log.error('Error applying profile xpath mappings to item: ' + e)
          }
        }
        else {
          if (data.client_config.transform) {
            log.info('applying profile json transform for client ' + data.req.user + ' to item GTIN ' + item.gtin)
            try {
              item = data.client_config.transform(item)
            }
            catch (e) {
              log.error('Error applying profile json transform to item: ' + e)
            }
          }
        }
      }
      else {
        log.debug('no server transform applied')
      }

      delete item.xml
      return item
    })

    if (data.req_param['download']) {
      data.res.set('Content-Disposition', 'attachment; filename="items_' + Date.now() + '.json"')
      data.res.json(result_items)
    }
    else {
      var result = item_utils.get_collection_json(result_items, config.base_url + data.req.url)
      data.res.jsonp(result)
    }
  }

  return {

    get_subscribed_item : function (req, res, next) {

      log.debug('find_subscribed_items req.path: ' + req.path)

      data.req = req
      data.res = res
      data.next = next

      data.req_param = {}

      var query = {}

      var gtin = req.param('gtin')
      if (gtin) {
        query.gtin = gtin
        data.req_param['gtin'] = gtin
      }
      else {
        var result = item_utils.get_collection_json([], config.base_url + data.req.url)
        result.collection.error = {
          title    : 'gtin parameter is required'
          , code   : '596'
          , message: 'please provide a gtin for your search'
        }
        data.res.jsonp(result)
        return
      }

      var provider = req.param('provider')
      if (provider) query.provider = provider
      data.req_param['provider'] = provider

      var tm = req.param('tm')
      if (tm) query.tm = tm
      data.req_param['tm'] = tm

      var tm_sub = req.param('tm_sub')
      if (tm_sub) query.tm_sub = tm_sub
      data.req_param['tm_sub'] = tm_sub

      data.req_param['multi']     = req.param('multi') == 'true'
      data.req_param['children']  = req.param('children') == 'true'
      data.req_param['parents']   = req.param('parents') == 'true'
      data.req_param['download']  = req.param('download') == 'true'
      data.req_param['transform'] = req.param('transform')
      log.debug('transform param: ' + data.req_param['transform'])

      var client_config = config.user_config[req.user] || { client_name: 'Default Client' }
      data.client_config = client_config

      try {
        var recipients = client_config.recipients
        if (recipients && recipients.length) {
          log.info('limited subscription query results to configured recipients: ' + recipients.join(', '))
          if (recipients.length > 1) query.recipient = { $in: recipients }
          else query.recipient = recipients[0]
        }
      }
      catch (e) {
        log.warn('profile config "recipients" not found, no filter applied')
      }

      config.database.getTradeItems(query, 0, 100, true, false, processFoundItems)
    }
  }
}
