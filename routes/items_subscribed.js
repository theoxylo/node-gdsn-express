module.exports = function (config) {
  
  var _            = require('underscore')
  var async        = require('async')
  var log          = require('../lib/Logger')('rt_subscr', config)
  var utils        = require('../lib/utils.js')(config)
  var item_utils   = require('../lib/item_utils.js')(config)
  var trade_item_db = require('../lib/db/trade_item.js')(config)

  function get_item_href(item) {
    var href = config.base_url 
    href += '/subscribed'
    href += '/' + item.gtin 
    href += '/' + item.provider 
    href += '/' + item.tm 
    href += '/' + item.tm_sub
    return href
  }

  return {
    
    get_subscribed_item : function (req, res, next) {

      log.debug('get_subscribed_item req.path: ' + req.url)

      try {

        var req_id = req.param('req_id')
        log.debug('using req_id ' + req_id)
        if (!req_id) req_id = item_utils.get_auto_req_id()

        var info = item_utils.get_info_logger(log, req_id)
        info('get_subscribed_item req.path: ' + req.url)

        var query = {}
        
        var gtin = req.param('gtin')
        if (gtin) query.gtin = gtin
        else {
          var result = utils.get_collection_json([], config.base_url + req.url)
          result.collection.error = {
            title    : 'gtin parameter is required'
            , code   : '596'
            , message: 'please provide a gtin for your search'
          }
          if (!res.finished) res.jsonp(result)
          return
        }

        var provider = req.param('provider')
        if (provider) query.provider = provider

        var tm = req.param('tm')
        if (tm) query.tm = tm

        var tm_sub = req.param('tm_sub')
        if (tm_sub) query.tm_sub = tm_sub

        query.archived_ts = { $exists : false }

        var req_param = {}
        req_param['food']      = req.param('food') == 'true'
        req_param['multi']     = req.param('multi') == 'true'
        req_param['children']  = req.param('children') == 'true'
        req_param['parents']   = req.param('parents') == 'true'
        req_param['download']  = req.param('download') == 'true'
        req_param['transform'] = req.param('transform') == 'server'
        req_param['reduce']    = req.param('reduce') == 'true'

        var lang = req.param('lang')
        if (lang && lang.indexOf('-')) lang = lang.split('-')[0] // 'en-us' => 'en'


        var client_config = config.user_config[req.user] || { client_name: 'Default Client' }

        try {
          var recipients = client_config.recipients
          if (recipients && recipients.length) {
            info('limited subscription query results to configured recipients: ' + recipients.join(', '))
            if (recipients.length > 1) query.recipient = { $in: recipients }
            else query.recipient = recipients[0]
          }
        }
        catch (e) {
          log.warn('server profile config "recipients" not found, no filter applied')
        }

        var start = Date.now()
        log.debug(req_id + ' fetching all items for gtin ' + gtin + ' at time ' + start)

        trade_item_db.getTradeItems(query, 0, 100, function process_found_items(err, items) {
          if (err) return next(err)

          info('db found ' + (items && items.length) + ' items for gtin ' + gtin + ' in ' + (Date.now() - start) + 'ms')

          items = item_utils.de_dupe_items(items)

          if (items.length == 0) {
            var result = utils.get_collection_json([], config.base_url + req.url)
            result.collection.error = {
              title    : 'Item not found'
              , code   : '598'
              , message: 'no item was found for the given criteria'
            }
            if (!res.finished) res.jsonp(result)
            return
          }

          var allow_multiple = req_param['multi']
          if (items.length > 1 && !allow_multiple) {
            var href = config.base_url + req.url
            var result = utils.get_collection_json([], href)
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
            if (!res.finished) res.jsonp(result)
            return
          }

          var tasks = []
          items.forEach(function (item) {

            item.fetch_type = 'match'

            if (req_param['parents']) tasks.push(
              function (callback) {
                var start = Date.now()
                item_utils.fetch_all_parents(item, req_id, function (err, item_and_parents) {
                  if (err) return callback(err)
                  info('utils found ' + (item_and_parents && item_and_parents.length) + ' parent items for gtin ' + gtin + ' in ' + (Date.now() - start) + 'ms')
                  callback(null, item_and_parents)
                })
              }
            )
            else log.debug(req_id + ' skipping parent search for item ' + gtin)

            if (req_param['children']) tasks.push(
              function (callback) {
                var start = Date.now()
                item_utils.fetch_all_children(item, req_id, function (err, item_and_children) {
                  if (err) return callback(err)
                  info('utils found ' + (item_and_children && item_and_children.length) + ' child items for gtin ' + gtin + ' in ' + (Date.now() - start) + 'ms')
                  callback(null, item_and_children)
                })
              }
            )
            else log.debug(req_id + ' skipping child search for item ' + gtin)
          })

info('starting async for task count: ' + tasks.length)

          async.parallel(tasks, function (err, results) {
              if (err) return next(err)
              results = _.flatten(results) // async.parallel returns an array of results arrays

              //results.unshift(items[0])
              items = items.concat(results)

              items = item_utils.de_dupe_items(items)
              log.debug(req_id + ' parallel tasks final item count: ' + items.length)

              items = items.map(function (item) {

                //log.debug(req_id + ' augmenting gtin ' + item.gtin)

                try {
                  item.food_and_bev = !!(item.tradeItem.extension.foodAndBeverageTradeItemExtension)
                }
                catch (food_error) {
                  item.food_and_bev = false
                }

                item.req_user    = req.user
                item.client_name = client_config.client_name

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

                if (req_param['transform']) {
                  if (client_config.transform) {
                    info('applying server profile transform for client ' + req.user + ' to item GTIN ' + item.gtin)
                    try {
                      item = client_config.transform(item, lang)
                    }
                    catch (e) {
                      log.error('Error applying server profile transform to item: ' + e)
                    }
                  }
                  //else info('SKIPPING server profile transform for client ' + req.user + ' to item GTIN ' + item.gtin)
                }

                return item
              })

              if (req_param['food']) {
                items = items.filter(function (item) {
                  return item.food_and_bev
                })
              }

              if (req_param['transform']) {
                if (req_param['reduce'] && client_config.reduce) {
                  console.log('applying server profile reduce for client ' + req.user)
                  try {
                    items = [client_config.reduce(items)] // condense to single item
                  }
                  catch (e) {
                    console.log('Error applying server profile reduce to item: ' + e)
                  }
                }
              }

              if (req_param['download']) {
                res.set('Content-Disposition', 'attachment; filename="items_' + Date.now() + '.json"')
                res.jsonp(items)
              }
              else {
                var result = utils.get_collection_json(items, config.base_url + req.url)
                if (!res.finished) res.jsonp(result)
              }
              log.db(req.url, req.user, (Date.now() - start))
            } // end async.parallel callback
          ) // end async.parallel invocation
        }) // end db getTradeItems callback and invocation
      }
      catch (error) {
        log.error('Failed returning subscribed items: ' + JSON.stringify(error))
        next(error)
      }
    }
  }
}
