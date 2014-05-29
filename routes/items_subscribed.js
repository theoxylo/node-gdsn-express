module.exports = function (config) {
  
  var log  = require('../lib/Logger')('rt_subsc', {debug: true})

  var item_utils = require('../lib/item_utils.js')(config)
  var xml_digest = require('../lib/xml_to_json.js')(config)

  var data = {}

  function processFoundItems(err, items) {
    if (err) return data.next(err)
    log.info('get_subscribed_item returned item count: ' + items.length)

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
        result.collection.links = []
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

    item_utils.fetch_children(items_with_children, function (err, results1) {
      if (err) return presentResults(err)
      results1 = results1.map(function (e) { if (!e.fetch_type) e.fetch_type = 'child' ; return e })
      item_utils.fetch_parents(items_with_parents, function (err, results2) {
        if (err) return presentResults(err)
        results2 = results2.map(function (e) { if (!e.fetch_type) e.fetch_type = 'parent' ; return e })
        presentResults(null, items.concat(results1.concat(results2)))
      })
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

      try {
        item.food_and_bev = !!(item.tradeItem.extension.foodAndBeverageTradeItemExtension)
      }
      catch (food_error) {
        item.food_and_bev = false
      }

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

      if (data.client_config.mappings) {
        log.info('applying server profile xpath mappings for client ' + data.req.user + ' to item GTIN ' + item.gtin)
        try {
          item.tradeItem = config.gdsn.getCustomTradeItemInfo(item.xml, data.client_config.mappings)
        }
        catch (e) {
          log.error('Error applying server profile xpath mappings to item: ' + e)
        }
      }

      if (data.req_param['transform']) {
        if (data.client_config.transform) {
          log.info('applying server profile transform for client ' + data.req.user + ' to item GTIN ' + item.gtin)
          try {
            item = data.client_config.transform(item)
          }
          catch (e) {
            log.error('Error applying server profile transform to item: ' + e)
          }
        }
      }

      delete item.xml
      return item
    })

    if (data.req_param['food']) {
      result_items = result_items.filter(function (item) {
        return item.food_and_bev
      })
    }

    if (data.req_param['transform']) {
      if (data.req_param['reduce'] && data.client_config.reduce) {
        console.log('applying server profile reduce for client ' + data.req.user)
        try {
          result_items = [data.client_config.reduce(result_items)] // condense to single item
        }
        catch (e) {
          console.log('Error applying server profile reduce to item: ' + e)
        }
      }
    }

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
      try {

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

        data.req_param['food']      = req.param('food') == 'true'
        data.req_param['multi']     = req.param('multi') == 'true'
        data.req_param['children']  = req.param('children') == 'true'
        data.req_param['parents']   = req.param('parents') == 'true'
        data.req_param['download']  = req.param('download') == 'true'
        data.req_param['transform'] = req.param('transform') == 'server'
        data.req_param['reduce']    = req.param('reduce') == 'true'

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
          log.warn('server profile config "recipients" not found, no filter applied')
        }

        config.database.getTradeItems(query, 0, 100, true, processFoundItems)
      }
      catch (error) {
        log.error('Failed returning subscribed items: ' + JSON.stringify(error))
        next(error)
      }
    }
  }
}
