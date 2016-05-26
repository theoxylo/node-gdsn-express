var async   = require('async')
var request = require('request')

var Logger  = require('../lib/Logger')

module.exports = function (config) {

  var log = new Logger('rt_publish', config)

  var api = {}

  api.publish = function (req, res, next) {
    log.debug('>>>>>>>>>>>>>>>>>>>> gdsn publish  handler called')

    var provider = req.params.provider
    if (!provider) {
      return next(Error('provider gln is required, e.g. /publish/1100001011292'))
    }
    log.debug('post publish path provoider: ' + provider)

    var content = ''
    req.setEncoding('utf8')
    req.on('data', function (chunk) {
      log.debug('mds_post_chunk length: ' + (chunk && chunk.length))
      content += chunk
      if (content.length > 10 * 1024 * 1024 && !res.finished) res.end('content too big - larger than 10 MB')
    })

    req.on('end', function () {

      log.info('Received content of length ' + (content && content.length || '0'))

      //console.log('req.body:')
      //console.log(content)
      var body = ''
      body = JSON.parse(content)
      //console.log('parsed:')
      //console.dir(body)

      if (!body.items || body.items.length == 0 || !body.gln || body.gln.length == 0) {
        throw Error('at least 1 item and 1 gln are required')
      }
      // do async api calls:
      var tasks = []
      var errorCount = 0

      body.items.forEach(function (item) {
        body.gln.forEach(function (gln) {
          tasks.push(function (task_done) {

            if (!item) return
            log.debug('update pub data for item gtin ' + item.gtin + ', tm: ' + item.tm + ', tm_sub: ' + item.tm_sub + ', pub to: ' + gln)

            var start_cip_api_call = Date.now()

            var form_data = {
                ds       : provider
              , dr       : gln
              , gtin     : item.gtin || item // in case item is simple gtin string like before
              , tm       : item.tm || '840'
              , tms      : item.tm_sub || ''
              , il       : body.load ? 'true' : ''
              , ts       : new Date()
            }
            if (body['delete'] == 'true') form_data['delete'] = 'true'

            request.post({
              url          : config.url_gdsn_api + '/publish'
              , form: form_data
              , auth: {
                  user: 'admin'
                  , pass: 'devadmin'
                  , sendImmediately: true
              }
            },
            function (err, response, res_body) {
              log.info('cip api call took '
                + (Date.now() - start_cip_api_call)
                + ' ms with response: '
                + (response ? response.statusCode : 'NO_RESPONSE')
                + ', body: '
                + res_body)

              if (err) return task_done(err) // this will prevent construction of meaningful api response, short-circuit

              //if (response.statusCode != '200') return task_done(Error('bad status code ' + response.statusCode))


              var error = err || get_error_message(res_body, log)
              if (error) errorCount++

              task_done(null, {
                //success   : !err && !error && response.statusCode == '200'
                success   : !err && !error && response.statusCode == '200'
                ,error    : error || ''
                ,gln      : gln
                ,gtin     : item.gtin || item
                ,tm       : item.tm || '840'
                ,tm_sub   : item.tm_sub || ''
              })

            }) // end request.post
          }) // end tasks.push
        }) // end forEach gln
      }) // end forEach item gtin

      async.parallelLimit(tasks, config.concurrency, function (err, results) {
        log.debug('parallel cip results count: ' + results && results.length)
        if (!res.finished) {
          res.json({
            results_count: (results ? results.length : 0)
            ,all_published: !errorCount
            ,error_count : errorCount
            ,provider    : provider
            ,results     : results || []
          })
          res.end()
          return
        }
      }) // end async.parallelLimit
    }) // end req.on('end'
  }

  api.get_publication_list = function (req, res, next) {

    var provider = req.params.provider
    if (!provider) {
      return next(Error('provider gln is required, recipient is optional, e.g. publish/1100001011292 or publish/1100001011292/1100001011339'))
    }
    var subscriber = req.params.subscriber || ''
    if (!subscriber) {
      log.debug('get all pubs for provider ' + provider)
    }
    var start_get_pub_list = Date.now()
    log.debug('fetching pub data for provider ' + provider + ', subscriber ' + subscriber)

    request.get({
      url   : config.url_gdsn_api + '/publicationList?publisher=' + provider + '&publishToGln=' + subscriber // + '&ts=' + Date.now()
    },
    function (err, response, body) {

      if (res.finished) return next(Error('original response already finished'))

      if (err) return next(err)

      log.info('get publication list api call took '
        + (Date.now() - start_get_pub_list )
        + ' ms with response: '
        + (response ? response.statusCode : 'NO_RESPONSE')
        + ', body length: '
        + (body && body.length))

      if (response.statusCode >= 400) return next(Error('failed with status code ' + response.statusCode))

      var results = []
      try {
        JSON.parse(body).publications.forEach(function(pub) {
          results.push({
            provider  : pub.gln
            ,gtin     : pub.gtin
            ,recipient: pub.publishToGLN
            ,tm       : pub.tm
            ,tm_sub   : pub.tmSub
          })
        })
      }
      catch (e) {
        log.error('json parse error: ' + e)
        log.error('json parse error source text: ' + body)
        next(error)
      }

      res.json({publications: results})
      res.end()
      return
    }) // end request.get
  }// end get_publication_list

  return api
}

function get_error_message(body, log) {
  try {
    body = body.replace(/\(/g, '')
    var res_body = JSON.parse(body)
    //console.log('error: ' + res_body.error)
    //console.dir(res_body)
    return res_body.error ? JSON.stringify([res_body.error]) : ''
  }
  catch (e) {
    log.error('json parse error: ' + e)
    log.error('json parse error source text: ' + body)
    //console.dir(body)
    return body
  }
  return ''
}
