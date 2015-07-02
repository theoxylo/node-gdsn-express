var async   = require('async')
var request = require('request')

module.exports = function (config) {

  var log            = require('../lib/Logger')('rt_publish', {debug: true})
  var utils          = require('../lib/utils.js')(config)
  var db_msg_archive = require('../lib/db/msg_archive.js')(config)
  var process_msg    = require('../lib/process_msg.js')(config)

  var api = {}

  api.process = function (req, res, next) {
    log.debug('>>>>>>>>>>>>>>>>>>>> gdsn publish  handler called')

    var provider = req.params.provider
    if (!provider) { 
      return next(Error('provider gln is required, e.g. /validate_register/1100001111000'))
    }

    var content = ''
    req.setEncoding('utf8')
    req.on('data', function (chunk) {
      log.debug('mds_post_chunk length: ' + (chunk && chunk.length))
      content += chunk
      if (content.length > 10 * 1024 * 1024 && !res.finished) res.end('content too big - larger than 10 MB')
    })

    req.on('end', function () {

      try {
        log.info('Received content of length ' + (content && content.length || '0'))

        console.log('req.body:')
        console.log(content)
        var body = ''
        body = JSON.parse(content)
        console.log('parsed:')
        console.dir(body)

        if (!body.gtin || body.gtin.length == 0 || !body.gln || body.gln.length == 0) {
          throw Error('at least 1 gtin and 1 gln are required')
        }
        // do async api calls:
        var tasks = []
        var errorCount = 0
        body.gtin.forEach(function (gtin) {
          body.gln.forEach(function (gln) {
            try {
              var start_cip_api_call = Date.now()
              tasks.push(function (task_done) {
                log.debug('update pub data for gtin ' + gtin + ', pub to: ' + gln)

                var form_data = { 
                    ds       : publisher
                  , dr       : gln
                  , gtin     : gtin
                  , tm       : '840'
                  , tms      : ''
                  , il       : body.load ? 'true' : ''
                  , ts       : new Date()
                }
                //if (pub['delete']) form_data['delete'] = 'true'

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

                  //if (err) return task_done(err)

                  /*
                  if (!getSuccess(body, log)) {
                    log.debug('body: ' + body)
                    return task_done(body)
                  }
                  */
     
                  //if (response.statusCode != '200') return task_done(Error('bad status code ' + response.statusCode))


                  var error = getError(res_body, log)
                  if (error) errorCount++

                  //task_done(null, response.statusCode)
                  task_done(null, {
                    success   : !err && response.statusCode == '200'
                    ,error    : error
                    ,gln      : gln
                    ,gtin     : gtin
                  })

                }) // end request.post
              }) // end tasks.push
            }
            catch (err) {
              task_done(err)
            }
          }) // end forEach gln
        }) // end forEach gtin

        async.parallel(tasks, function (err, results) {
          log.debug('parallel cip results count: ' + results && results.length)
          if (!res.finished) {
            res.json({
                error_count: errorCount
                ,provider  : provider
                ,results   : results
            })
            res.end()
            return
          }
        }, 10) // concurrency 10, end async.parallel
      }
      catch (err) {
        next(err)
      }
    }) // end req.on('end'
  }

  api.get_publication_list = function (req, res, next) {
    var publisher = req.params.publisher
    if (!publisher) { 
      return next(Error('publisher gln is required as second to last path element, e.g. /mds/publish/1100001111000/1100001011278'))
    }
    var subscriber = req.params.subscriber || ''
    if (!subscriber) { 
      log.debug('get all pubs for publisher ' + publisher)
    }
    var start_get_pub_list = Date.now()
    log.debug('fetching pub data for publisher ' + publisher + ', subscriber ' + subscriber)

    request.get({
      url   : config.url_gdsn_api + '/publicationList?publisher=' + publisher + '&publishToGln=' + subscriber + '&ts=' + Date.now()
      , auth: {
          user: 'admin'
          , pass: 'devadmin'
          , sendImmediately: true
      }
    }, 
    function (err, response, body) {
      log.info('get publication list api call took ' 
        + (Date.now() - start_get_pub_list ) 
        + ' ms with response: '
        + (response ? response.statusCode : 'NO_RESPONSE')
        + ', body: '
        + body)

      if (err || response.statusCode != '200') next(Error('failed with status code ' + response.statusCode))

      if (!res.finished) {
        res.send(body)
        res.end()
      }
    }) // end request.get
    log.debug('get publication list request initiated')
  }// end get_publication_list

  return api
}

function getSuccess(body, log) {
  try {
    var success = JSON.parse(body).success
    console.log('success: ' + success)
    return success && success != 'false'
  }
  catch (e) {
    log.debug('json parse error: ' + e)
  }
  return false
}
function getError(body, log) {
  try {
    var res = JSON.parse(body)
    console.log('error: ' + res.error)
    return res.error ? JSON.stringify([res.error]) : ''
  }
  catch (e) {
    log.debug('json parse error: ' + e)
    log.debug('json parse text: ' + body)
    console.dir(body)
    return body
  }
  return ''
}
