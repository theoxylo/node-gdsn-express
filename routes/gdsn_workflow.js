var async   = require('async')
var request = require('request')

module.exports = function (config) {

  var msg_archive_db  = require('../lib/db/msg_archive.js')(config)
  var log             = require('../lib/Logger')('route_wf', config)
    
  return function (req, res, next) {

    var sender = req.params.sender
    if (!config.gdsn.validateGln(sender)) {
      res.end('sender must be a valid GLN')
      return
    }
  
    if (req.method != 'POST') {
      var msg_id = req.params.msg_id
      var sender = req.params.sender
      if (msg_id) { // fetch existing msg xml and submit to dp
        log.debug('gdsn-wf will use existing message with id ' + msg_id)
        msg_archive_db.findMessage(sender, msg_id, function (err, db_msg_info) {
          if (err) return next(err)
          if (db_msg_info.length > 1) return next(Error('found multiple messages with id ' + msg_id))
          do_gdsn_workflow(db_msg_info[0], res, next)
        })
      }
      else {
        res.end('msg_id param is required')
      }
      return
    }

    log.debug('>>> route handler called with path ' + req.path)
    var xml = ''
    req.setEncoding('utf8')
    req.on('data', function (chunk) {
      log.debug('archive_post_chunk.length: ' + (chunk && chunk.length))
      xml += chunk
      if (xml.length > 10 * 1000 * 1000) return res.jsonp({msg: 'msg xml too big - larger than 10 MB'})
    })
    req.on('end', function () {
      log.info('Received msg xml POST of length ' + (xml && xml.length || '0'))
      msg_archive_db.saveMessage(xml, function (err, db_msg_info) {
        if (err) return next(err)
        do_gdsn_workflow(db_msg_info, res, next)
      }) 
    })
  }

  function do_gdsn_workflow(db_msg_info, res, next) {

    if (!db_msg_info || !db_msg_info.msg_id || !db_msg_info.xml) {
      log.error('msg_info problem with data:' + JSON.stringify(db_msg_info))
      return next(Error('missing msg_info'))
    }

    if (db_msg_info.receiver != config.homeDataPoolGln) return next(Error('to initiate workflow, the message receiver must be the datapool'))

    // db_msg_info representation might not reflect latest parsing logic...
    // so reparse original msg xml to generate parties and trade items
    //var start_reparse = Date.now()
    //var msg_info = config.gdsn.get_msg_info(db_msg_info.xml)
    //log.debug('reparse of db msg xml took ' + (Date.now() - start_reparse) + ' ms for ' + msg_info.xml.length + ' new length')

    // ... or just trust the object tree as stored in db at message persist time:
    var msg_info = db_msg_info

    log.info('starting workflow for ' + msg_info.msg_id + ', msg_type: ' + msg_info.msg_type + ', modified: ' + new Date(msg_info.modified_ts))
    log.debug('msg xml: ' + msg_info.xml)
    log.debug('msg xml length: ' + msg_info.xml.length)


    // if it's a response to a previous message, we are done very early
    if (msg_info.msg_type == 'GDSNResponse') {
      //gdsn.msg_response(msg_info.requesting_msg_id, msg_info.status == 'ACCEPTED')

      // TODO: call GDSN Server API to record response
      // CIRR
      // BPRR

      return res.end('response received to original msg_id ' + msg_info.requesting_msg_id + ' with status ' + msg_info.status)
    }

    // each message type may or may not have additional downstream messages to generate

    if (msg_info.sender == msg_info.source_dp) { // messages from other data pools

      if (msg_info.msg_type == 'catalogueItemConfirmation') {
        // TODO: call GDSN Server API to update dp cic status for this published item
        var cic = config.gdsn.populateCicToTp(config, msg_info)
        res.write(cic)

        var response_xml = config.gdsn.populateResponseToSender(config, msg_info)
        res.write(response_xml)
        return res.end()
      }

      if (msg_info.msg_type == 'catalogueItemNotification') {
        // TODO: call GDSN Server API to to inform that GTIN received?
        var cin = config.gdsn.populateCinToTp(config, msg_info)
        res.write(rci)
        return res.end()
      }
      // only CIC and CIN are sent by other data pools
      return next(Error('wrong message type from other dp? ' + msg_info.sender + ', ' + msg_info.msg_type))
    }

    // messages from local registered trading parties:

    if (msg_info.msg_type == 'basicPartyRegistration'
     || msg_info.msg_type == 'registryPartyDataDump') {

      var tasks = []
      msg_info.party.forEach(function (party) {

        console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> party gln:::::::::::::::: ' + party.gln)

        tasks.push(function (callback) {

          console.log('update party data for gln ' + party.gln + ', ' + party.name)

          var start_party_api_call = Date.now()
          request.post({
            url             : config.url_gdsn_api + '/party/' + party.gln 
            , form          : { 
                sourcedp    : party.source_dp
              , partyRole   : party.role
              , name        : party.name
              , address1    : party.address1
              , address2    : party.address1
              , city        : party.city
              , state       : party.state
              , zip         : party.zip
              , country     : party.tm
              , contactName : party.contact_name
              , contactEmail: party.contact_email
              , contactPhone: party.contact_phone
              //, status      : 'PTY_IN_PROGRESS' // will require BPRR from GR to activate
              , status      : 'PTY_REGISTERED' // BPRR from GR is not needed, but might be out of sync
              , ts          : new Date()
            }
            , auth: {
                'user': 'admin'
                , 'pass': 'devadmin'
                , 'sendImmediately': true
            }
            , body: config.gdsn.populateBprToGr(config, msg_info)
          }, 
          function (err, response, body) {
            log.info('party api call took ' 
              + (Date.now() - start_party_api_call) 
              + ' ms with response: '
              + (response ? response.statusCode : 'NO_RESPONSE')
              + ', body: '
              + body)
            if (err) return callback(err)
            if (response.statusCode != '200' || !getSuccess(body)) return callback(Error(body))
            callback(null, body)
          }) // end request.post
        }) // end tasks.push
      }) // end msg_info.party.forEach

      async.parallel(tasks, function (err, results) {
        console.log('all party submissions complete for msg_id ' + msg_info.msg_id)

        if (err) {
          console.log('async party api err: ')
          console.dir(err)
          var orig_msg_info = msg_info

          // don't modify original msg_info object
          msg_info = {
              msg_id: orig_msg_info.msg_id
            , sender: orig_msg_info.sender
            , receiver: orig_msg_info.receiver
            , status: 'ERROR'
            , exception: err.toString()
          }
        }

        var response_xml = config.gdsn.populateResponseToSender(config, msg_info)
        res.write(response_xml)
        res.end()
      }, 10) // concurrency
      return
    }

    // post RCI for GR along with API request
    if (msg_info.msg_type == 'catalogueItemNotification') {

      var tasks = []
      msg_info.item.forEach(function (item) {

        console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> item gtin:::::::::::::::: ' + item.gtin + ', valid: ' + config.gdsn.validateGtin(item.gtin))

        tasks.push(function (callback) {

          console.log('trade item data: ')
          console.dir(item)

          if (!item) return next(Error('item data not found for gtin ' + item.gtin + ', please check file or db'))

          var start_cin_api_call = Date.now()
          console.log('posting CIN data to GDSN Server API for msg_id  ' + msg_info.msg_id)

          //var is_new = (msg_info.status == 'ADD')

          request.post({
            url        : config.url_gdsn_api + '/ci/' + item.provider + '/' + item.gtin + '/' + item.tm + '/' + item.tm_sub || 'na' 
            , form       : { 
                brandName                 : item.brand || 'generic'
              , classCategoryCode         : item.gpc
              , unitDescriptor            : item.unit_type
              , documentCommandHeader     : msg_info.status 
              //, lastChangeDateTime        : new Date().toISOString() // now

              //, skipMatchingProcess       : true              // should probably never skip the matching process...
              //, status                    : is_new ? 'IN_PROGRESS' : 'REGISTERED'
              , status                    : 'REGISTERED'
              , ts                        : new Date()
              //, canceledDate:
              //, discontinuedDate:
              //[&isBaseUnit=true]
              //[&isConsumerUnit=false]
              //[&isDispatchUnit=true]
              //[&isInvoiceUnit=false]
              //[&isMarkedReturnable=true]
              //[&isOrderableUnit=false]
              //[&isVariableUnit=true]
            }
            , auth: {
                'user': 'admin'
                , 'pass': 'devadmin'
                , 'sendImmediately': true
              }
            , body: config.gdsn.populateRciToGr(config, msg_info)
          }, 
          function (err, response, body) {
            log.info('cin api call took ' 
              + (Date.now() - start_cin_api_call) 
              + ' ms with response: '
              + (response ? response.statusCode : 'NO_RESPONSE')
              + ', body: '
              + body)
            if (err) return callback(err)
            if (response.statusCode != '200' || !getSuccess(body)) return callback(Error(body))
            callback(null, body)
          }) // end request.post
        }) // end tasks.push
      }) // end msg_info.party.forEach

      async.parallel(tasks, function (err, results) {
        log.debug('all item submissions complete for msg_id ' + msg_info.msg_id)

console.log('async api ci results: ')
console.dir(results)

        if (err) {
          log.debug('async cin api err: ' + err)
          var orig_msg_info = msg_info

          // don't modify original msg_info object
          msg_info = {
              msg_id: orig_msg_info.msg_id
            , sender: orig_msg_info.sender
            , receiver: orig_msg_info.receiver
            , status: 'ERROR'
            , exception: err.toString()
          }
        }

        var response_xml = config.gdsn.populateResponseToSender(config, msg_info)
        res.write(response_xml)
        res.end()
      }, 10) // concurrency

      return
    } // end CIN

    if (msg_info.msg_type == 'catalogueItemPublication') {

      // call GDSN Server API to publish item:
      // /gdsn-server/api/publish?gln={\\d13}&dr={\\d13}&gtin={\\d14}&tm={\\d3}[&il=true}][&delete=true}]"

      var tasks = []
      msg_info.pub.forEach(function (pub) {

        console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> pub gln :::::::::::::::: ' + pub.provider)

        tasks.push(function (callback) {

          console.log('update pub data for gtin ' + pub.gtin + ', ' + pub.name)

          var start_cip_api_call = Date.now()
          request.post({
            url          : config.url_gdsn_api + '/publish'
            , form       : { 
                ds       : pub.provider
              , dr       : pub.recipient
              , gtin     : pub.gtin
              , tm       : pub.tm
              , tms      : pub.tm_sub != 'na' ? pub.tm_sub : ''
              , il       : pub.initial_load
              , ts       : new Date()
            }
            , auth: {
                'user': 'admin'
                , 'pass': 'devadmin'
                , 'sendImmediately': true
            }
          }, 
          function (err, response, body) {
            log.info('cip api call took ' 
              + (Date.now() - start_cip_api_call) 
              + ' ms with response: '
              + (response ? response.statusCode : 'NO_RESPONSE')
              + ', body: '
              + body)
            if (err) return callback(err)
            if (response.statusCode != '200' || !getSuccess(body)) return callback(Error(body))
            callback(null, body)
          }) // end request.post
        }) // end tasks.push
      }) // end msg_info.pub.forEach

      async.parallel(tasks, function (err, results) {
        console.log('all cip submissions complete for msg_id ' + msg_info.msg_id)

        if (err) {
          console.log('async cip api err: ')
          console.dir(err)
          var orig_msg_info = msg_info

          // don't modify original msg_info object
          msg_info = {
              msg_id: orig_msg_info.msg_id
            , sender: orig_msg_info.sender
            , receiver: orig_msg_info.receiver
            , status: 'ERROR'
            , exception: err.toString()
          }
        }

        var response_xml = config.gdsn.populateResponseToSender(config, msg_info)
        res.write(response_xml)
        res.end()
      }, 10) // concurrency
      return
    }

    if (msg_info.msg_type == 'catalogueItemSubscription') {

      var tasks = []
      msg_info.sub.forEach(function (sub) {

        console.log('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> subscriber gln :::::::::::::::: ' + sub.recipient)

        tasks.push(function (callback) {

          console.log('updating sub data for sub/pub ' + sub.recipient + '/' + sub.provider)
           

          var start_cis_api_call = Date.now()
          request.post({
            url          : config.url_gdsn_api + '/cis/' + sub.recipient + '/' + sub.provider
            , form       : { 
                gtin  : ''
              , gpc   : ''
              , tm    : ''
              , ts    : new Date()
              //, mode: 'unsubscribe'
              //, is_from_gr: 'true'
            }
            , auth: {
                'user': 'admin'
                , 'pass': 'devadmin'
                , 'sendImmediately': true
              }
            , body: (msg_info.sender != config.gdsn_gr_gln) ? config.gdsn.populateCisToGr(config, msg_info) : ''
          }, 
          function (err, response, body) {
            log.info('cis api call took ' 
              + (Date.now() - start_cis_api_call) 
              + ' ms with response: '
              + (response ? response.statusCode : 'NO_RESPONSE')
              + ', body: '
              + body)
            if (err) return callback(err)
            if (response.statusCode != '200' || !getSuccess(body)) return callback(Error(body))
            callback(null, body)
          }) // end request.post
        }) // end tasks.push
      }) // end msg_info.sub.forEach

      async.parallel(tasks, function (err, results) {
        console.log('all cis submissions complete for msg_id ' + msg_info.msg_id)

        if (err) {
          console.log('async cis api err: ')
          console.dir(err)
          var orig_msg_info = msg_info

          // don't modify original msg_info object
          msg_info = {
              msg_id: orig_msg_info.msg_id
            , sender: orig_msg_info.sender
            , receiver: orig_msg_info.receiver
            , status: 'ERROR'
            , exception: err.toString()
          }
        }

        var response_xml = config.gdsn.populateResponseToSender(config, msg_info)
        res.write(response_xml)
        res.end()
      }, 10) // concurrency
      return
    }

    if (msg_info.msg_type == 'catalogueItemConfirmation') {

      // TODO: call GDSN Server API to confirm item

      //var cic = config.gdsn.populateCicToOtherDP(config, msg_info)

      var response_xml = config.gdsn.populateResponseToSender(config, msg_info)
      res.write(response_xml)
      return res.end()
    }

    if (msg_info.msg_type == 'requestForCatalogueItemNotification') {
      // TODO: call GDSN Server API to manage subscription
      //var rfcin = config.gdsn.populateRfcin(config, msg_info)
      var response_xml = config.gdsn.populateResponseToSender(config, msg_info)
      res.write(response_xml)
      return res.end()
    }
  }

  function getSuccess(body) {
    try {

        var obj = JSON.parse(body)
        console.log('getSuccess debug ' + body)
        console.dir(obj)

      return JSON.parse(body).success == 'true'
    }
    catch (e) {
      console.log('json parse error: ' + e)
    }
    return false
  }
}
