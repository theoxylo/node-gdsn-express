var async   = require('async')
var request = require('request')

module.exports = function (config) {

  var log            = require('../lib/Logger')('route_wf', config)
  var db_msg_archive = require('../lib/db/msg_archive.js')(config)
  var db_trade_item  = require('../lib/db/trade_item.js')(config)
  var db_party       = require('../lib/db/trading_party.js')(config)
    
  var api = {}

  api.lookup_and_process = function (req, res, next) {

    log.debug('>>> route handler called with path ' + req.path)

    var sender = req.params.sender
    if (!config.gdsn.validateGln(sender)) {
      res.end('sender must be a valid GLN')
      return
    }
    var msg_id = req.params.msg_id
    if (!msg_id) { 
      res.end('msg_id param is required')
      return
    }

    // send cic only if state is specified in request
    var state = req.param('state', 'DEFAULT') // from query string, not url template /:blah

    // fetch existing msg xml and submit to dp
    log.debug('locate existing message with id: ' + msg_id + ', sender: ' + sender)

    db_msg_archive.findMessage(sender, msg_id, function (err, msg) {

      if (err) return next(err)

      if (!msg || !msg.msg_id || !msg.xml) {
        log.error('msg problem with data:' + JSON.stringify(msg))
        return next(Error('missing msg xml/info'))
      }

      // RE-parse original msg xml to generate parties, trade items, subscriptions, publications using latest logic
      var start_parse = Date.now()
      msg = config.gdsn.get_msg_info(msg.xml)
      log.debug('reparse of db msg xml took ' + (Date.now() - start_parse) + ' ms for ' + msg.xml.length + ' new length')

      api.process(msg, state, function (err, result) {
        respond(err, msg, res, msg.provider, next)
      })
    })

  }

    
  api.process = function (msg, state, callback) {

    if (msg.receiver != config.homeDataPoolGln) {
      return callback(Error('to initiate workflow, the message receiver must be the datapool and not ' + msg.receiver))
    }

    log.info('starting workflow for ' + msg.msg_id + ', msg_type: ' + msg.msg_type + ', modified: ' + new Date(msg.modified_ts))
    //log.debug('msg xml: ' + msg.xml)
    log.debug('msg xml length: ' + msg.xml.length)

    // if it's alrelady a response to a previous message, don't generate any new messages and finish early
    if (msg.msg_type == 'GDSNResponse') {

      // update catalog item status to REGISTERED if this is an ACCEPTED reponse from GR to an RCI
      if (msg.gtin) { // most reponses don't (yet) have a gtin! TODO
        var start_cirr_api_call = Date.now()
        request.post({
          url   : config.url_gdsn_api + '/ci/' + msg.provider + '/' + msg.gtin + '/' + msg.tm + '/' + msg.tm_sub || 'na' 
          //, form: {cmd: 'ADD' } // BPRR from GR is not needed, but might be out of sync
          , form: {cmd: 'REGISTERED' } // BPRR from GR is not needed, but might be out of sync
          , auth: {
            user: 'admin'
            , pass: 'devadmin'
            , sendImmediately: true
          }
        }, 
        function (err, response, body) {
          log.info('cin cirr api call took ' 
            + (Date.now() - start_cirr_api_call) 
            + ' ms with response: '
            + (response ? response.statusCode : 'NO_RESPONSE')
            + ', body: '
            + body)

          if (err) return callback(err)

          if (response.statusCode != '200') return callback(Error('bad status code ' + response.statusCode))

          if (!getSuccess(body)) return callback(Error(body))

          callback(null, body)

        }) // end request.post
      }
      return
    }

    if (msg.msg_type == 'basicPartyRegistration'
      || msg.msg_type == 'registryPartyDataDump') {

      var tasks = []
      msg.data.forEach(function (party) {

        if (party.source_dp == config.homeDataPoolGln) {
          if (msg.msg_type == 'registryPartyDataDump') {
            log.debug('skipping rpdd update for own party with gln ' + party.gln)
            return // don't update our own parties based on rpdd, only bpr
          }
        }
        else {
          if (msg.msg_type == 'basicPartyRegistration') {
            log.debug('skipping bpr update for other data pool party with gln ' + party.gln)
            return // don't update other dp's parties based on bpr, only rpdd
          }
        }

        tasks.push(function (task_done) {

          log.debug('update party data for gln ' + party.gln + ', ' + party.name)

          var start_party_api_call = Date.now()
          request.post({
            url             : config.url_gdsn_api + '/party/' + party.gln 
            , form          : { 
                sourcedp    : party.source_dp
              , partyRole   : party.role || 'DISTRIBUTOR'
              , name        : party.name
              , address1    : party.address1
              , address2    : party.address2
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
              user: 'admin'
              , pass: 'devadmin'
              , sendImmediately: true
            }
          }, 
          function (err, response, body) {
            log.info('party api call took ' 
              + (Date.now() - start_party_api_call) 
              + ' ms with response: '
              + (response ? response.statusCode : 'NO_RESPONSE')
              + ', body: '
              + body)
            if (err) return task_done(err)
            if (response.statusCode != '200') return task_done(Error('bad status code ' + response.statusCode))
            if (!getSuccess(body)) return task_done(Error(body))

            if (msg.msg_type == 'basicPartyRegistration') {
              var bpr_xml = config.gdsn.populateBprToGr(config, msg)
              db_msg_archive.saveMessage(bpr_xml, function (err, gen_msg_info) {
                if (err) return callback(err)
                log.info('Generated bpr to gr message saved to archive: ' + gen_msg_info.msg_id + ', modified: ' + new Date(gen_msg_info.modified_ts))
              })
            }
            task_done(null, body)
          }) // end request.post
        }) // end tasks.push
      }) // end msg.data.forEach party

      async.parallel(tasks, function (err, results) {
        log.debug('parallel party results count: ' + results && results.length)
        log.debug('all party submissions complete for msg_id ' + msg.msg_id)
        callback(err, msg)
      }, 10) // concurrency

      return
    } // end BPR and RPDD


    // CIN cin
    if (msg.msg_type == 'catalogueItemNotification') {
      
      // analyze CIN message variant:

            // there are 4 subtypes of CIN, 2 _from_ home DP (to TP or other DP)
            if (msg.sender == config.homeDataPoolGln) { // from home DP
              if (msg.receiver == msg.recipient) {
                msg.note = '>>> subscribed item forwarded from home DP to local TP'
              }
              else {
                msg.note = '>>> subscribed item forwarded from home DP to other DP for remote TP'
              }
            }
            else if (msg.receiver == config.homeDataPoolGln) { // to home DP
              // ...and 3 more _to_ home DP, 2 from TP, or from other DP.
              // These should be repostable to DP
              if (msg.sender == msg.provider) { // from local TP
                if (msg.provider == msg.recipient) { // 3. from TP (private draft item)
                  msg.note = '>>> private draft item from local TP'
                }
                else if (config.homeDataPoolGln == msg.recipient) { //4. TP item registration
                  msg.note = '>>> item registration/update attempt from local TP'
                }
              }
              else { // from other dp
                msg.note = '>>> subscribed item received from other DP for local TP'
              }
            }

      if (msg.sender != msg.provider) { // sent by other SDP, so generate gS1Response AND cic RECEIVED if state
        log.debug('DP received CIN from other DP with msg_id: ' + msg.msg_id)

        // send cic only if state is specified in request
        if (state != 'DEFAULT') {
          var cic_xml = config.gdsn.populateRdpCicRecForSdpCin(config, msg, state)
          db_msg_archive.saveMessage(cic_xml, function (err, new_cic) {
            if (err)log.error('Error populating CIC back to SDP for CIN: ' + msg.msg_id + ', err: ' + err)
            log.info('Generated CIC to SDP direct from RDP for CIN: ' + msg.msg_id + ', message saved to archive: ' + new_cic.msg_id)
          })
        }
        return callback(null, msg.provider)
      }

      // CIN from local TP/publisher/DS
      // update local provider item in DP and post RCI to GR if needed
      if (msg.sender != msg.provider) {
        return callback(Error('msg sender CIN issue for gln: ' + msg.sender))
      }

      var tasks = []
      msg.data.forEach(function (item) {

        tasks.push(function (task_done) {

          log.debug('trade item data: ')
          console.dir(item)

          if (!item) return callback(Error('item data not found for gtin ' + item.gtin + ', please check file or db'))

          var start_cin_api_call = Date.now()
          log.debug('posting CIN data to GDSN Server API for msg_id  ' + msg.msg_id)

          var form_data = {
              brandName                 : item.brand
            , classCategoryCode         : item.gpc
            , unitDescriptor            : item.unit_type
            , ts                        : new Date()
            , cmd                       : msg.status // to allow CORRECT value in synch list queue after matching process
            , ci_state: 'REGISTERED' // always, for now
          }
          if (item.cancelledDate)    form_data.canceledDate     = item.cancelledDate // iso string
          if (item.discontinuedDate) form_data.discontinuedDate = item.discontinuedDate // iso string

          if (msg.status == 'ADD') { // fill in some required values if missing
            form_data.brand             = form_data.brand             || 'generic'
            form_data.classCategoryCode = form_data.classCategoryCode || '99999999'
            form_data.unitDescriptor    = form_data.unitDescriptor    || 'CASE'
          }

          var children = item.child_gtins && item.child_gtins.join(',')
          form_data.children = '[' + children + ']'

          request.post({
            url   : config.url_gdsn_api + '/ci/' + item.provider + '/' + item.gtin + '/' + item.tm + '/' + item.tm_sub || 'na' 
            , form: form_data
            , auth: {
              user: 'admin'
              , pass: 'devadmin'
              , sendImmediately: true
            }
          }, 
          function (err, response, body) {
            log.info('cin api call took ' 
              + (Date.now() - start_cin_api_call) 
              + ' ms with response: '
              + (response ? response.statusCode : 'NO_RESPONSE')
              + ', body: '
              + body)
            if (err) return task_done(err)
            if (response.statusCode != '200') return task_done(Error('bad status code ' + response.statusCode))
            if (!getSuccess(body)) return task_done(Error(body))

            //if (getRciIsNeeded(body)) { // generate RCI to GR conditional upon DP API response
              var rci_xml = config.gdsn.populateRciToGr(config, msg)
              db_msg_archive.saveMessage(rci_xml, function (err, rci_msg_info) {
                if (err) return task_done(err)
                log.info('Generated rci message saved to archive: ' + rci_msg_info.msg_id + ', modified: ' + new Date(rci_msg_info.modified_ts))
                task_done(null, body)
              })
            //}
            //else task_done(null, body) // no rci needed
          }) // end request.post
        }) // end tasks.push
      }) // end msg.data.forEach item

      async.parallel(tasks, function (err, results) {
        log.debug('parallel item submit results count: ' + results && results.length)
        log.debug('all item submissions complete for msg_id ' + msg.msg_id)
        callback(err, msg)
      }, 10) // concurrency

      return
    } // end CIN from local TP

    if (msg.msg_type == 'catalogueItemPublication') {

      // call GDSN Server API to publish item:
      // /gdsn-server/api/publish?gln={\\d13}&dr={\\d13}&gtin={\\d14}&tm={\\d3}[&tms=us-ca][&il=true][&delete=true]"

      var tasks = []
      msg.data.forEach(function (pub) {

        log.debug('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> pub gln :::::::::::::::: ' + pub.provider)
        var start_cip_api_call = Date.now()

        tasks.push(function (task_done) {

          log.debug('update pub data for gtin ' + pub.gtin + ', pub to: ' + pub.recipient)

          var form_data = { 
              ds       : pub.provider
            , dr       : pub.recipient
            , gtin     : pub.gtin
            , tm       : pub.tm
            , tms      : pub.tm_sub != 'na' ? pub.tm_sub : ''
            , il       : pub.initial_load
            , ts       : new Date()
          }
          if (pub['delete']) form_data['delete'] = 'true'

          request.post({
            url          : config.url_gdsn_api + '/publish'
            , form: form_data
            , auth: {
                user: 'admin'
                , pass: 'devadmin'
                , sendImmediately: true
            }
          }, 
          function (err, response, body) {
            log.info('cip api call took ' 
              + (Date.now() - start_cip_api_call) 
              + ' ms with response: '
              + (response ? response.statusCode : 'NO_RESPONSE')
              + ', body: '
              + body)
            if (err) return task_done(err)
            if (response.statusCode != '200') return task_done(Error('bad status code ' + response.statusCode))
            if (!getSuccess(body)) return task_done(Error(body))
            task_done(null, body)
          }) // end request.post
        }) // end tasks.push
      }) // end msg.data.forEach pub

      async.parallel(tasks, function (err, results) {
        log.debug('parallel cip results count: ' + results && results.length)
        log.debug('all cip submissions complete for msg_id ' + msg.msg_id)
        callback(err, msg)
      }, 10) // concurrency

      return
    } // end CIP

    if (msg.msg_type == 'catalogueItemSubscription') { // CIS cis

      var tasks = []
      msg.data.forEach(function (sub) {

        tasks.push(function (task_done) {
          log.debug('updating sub data for sub/pub ' + sub.recipient + '/' + sub.provider)

          var form_data = { 
              gtin  : sub.gtin || ''
            , gpc   : sub.gpc  || ''
            , tm    : sub.tm   || ''
            , ts    : new Date()
            , isFromGR: 'true' // always true for testing and to trigger matching process upon local subscription create
            //, isFromGR: (sub.sender == config.gdsn_gr_gln) ? 'true' : ''
          }
          if (msg.status == 'DELETE') form_data.mode = 'Unsubscribe'
          else form_data.mode = 'Subscribe'

          var start_cis_api_call = Date.now()
          request.post({
            url   : config.url_gdsn_api + '/cis/' + sub.recipient + '/' + sub.provider
            , form: form_data
            , auth: {
                user: 'admin'
                , pass: 'devadmin'
                , sendImmediately: true
              }
          }, 
          function (err, response, body) {
            log.info('cis api call took ' 
              + (Date.now() - start_cis_api_call) 
              + ' ms with response: '
              + (response ? response.statusCode : 'NO_RESPONSE')
              + ', body: '
              + body)
            if (err) return task_done(err)
            if (response.statusCode != '200') return task_done(Error('bad status code ' + response.statusCode))
            if (!getSuccess(body)) return task_done(Error(body))

            if (msg.sender != config.gdsn_gr_gln) {
              var cis_xml = config.gdsn.populateCisToGr(config, msg)
              db_msg_archive.saveMessage(cis_xml, function (err, cis_msg_info) {
                if (err) return callback(err)
                log.info('Generated cis to gr message saved to archive: ' + cis_msg_info.msg_id + ', modified: ' + new Date(cis_msg_info.modified_ts))
                task_done(null, body)
              })
            }
          }) // end request.post
        }) // end tasks.push
      }) // end msg.data.forEach sub

      async.parallel(tasks, function (err, results) {
        log.debug('parallel cis results count: ' + results && results.length)
        log.debug('all cis submissions complete for msg_id ' + msg.msg_id)
        callback(err, msg) // msg.recipient
      }, 10) // concurrency

      return
    } // end CIS cis

    // CIC cic from local TP subscriber or other DP
    if (msg.msg_type == 'catalogueItemConfirmation') {

      log.debug('found CIC message for workflow')

      var tasks = []

      msg.data.forEach(function (cic) {
      
        tasks.push(function (task_done) {

          // from local subscriber TP
          if (msg.sender == cic.recipient) {

            // need to determine source dp for item that will recieve CIC on behalf of publisher
            // process CIC from local TP subscriber, generate CIC to SDP (could be self dp)
            db_trade_item.findTradeItem(cic.recipient, cic.gtin, cic.provider, cic.tm, cic.tm_sub, function (err, item) {
              if (err) {
                log.error('Could not locate trade item for cic: ' + JSON.stringify(cic))
                return task_done(err)
              }
              log.debug('found trade item sourceDataPool: ' + item.source_dp)

              cic.source_dp         = item.source_dp
              msg.source_dp    = cic.source_dp
              msg.confirm_code = cic.confirm_code
              msg.confirm_desc = cic.confirm_desc

              var cic_xml = config.gdsn.populateCicToSourceDP(config, msg)
              db_msg_archive.saveMessage(cic_xml, function (err, cic_msg_info) {
                if (err) return task_done(err)
                log.info('Generated CIC to publisher DP, message saved to archive: ' + cic_msg_info.msg_id + ', modified: ' + new Date(cic_msg_info.modified_ts))
                task_done(null, cic_msg_info)
              })
            })
            return
          }

          // process CIC from other DP for local TP publisher, step TT_8.5
          console.log('expect msg source_dp to be home dp for cic from other dp: ' + msg.source_dp)

          // only generate ACCEPTED response and call to update synch list/pub status
          log.debug('updating DP cic synch list data for sub/pub ' + cic.recipient + '/' + cic.provider)
          var start_cic_api_call = Date.now()
          request.post({
            url: config.url_gdsn_api + '/cic/' + cic.recipient + '/' + cic.gtin + '/' + cic.provider + '/' + cic.tm + '/' + cic.tm_sub
            , form: { 
                status   : (cic.state == 'RECEIVED' ? 'ACCEPTED' : cic.state) // changed from 2.8 to 3.1
               , reason  : cic.reason
               , ts      : new Date()
              }
            , auth: {
                user: 'admin'
                , pass: 'devadmin'
                , sendImmediately: true
              }
          }, 
          function (err, response, body) {
            log.info('cic api call took ' 
              + (Date.now() - start_cic_api_call) 
              + ' ms with response: '
              + (response ? response.statusCode : 'NO_RESPONSE')
              + ', body: '
              + body)
            if (err) return task_done(err)
            if (response.statusCode != '200') return task_done(Error('bad status code ' + response.statusCode))
            if (!getSuccess(body)) return task_done(Error(body))
            task_done(null, body)
          }) // end request.post
        }) // end tasks.push
      }) // end data.forEach cic

      async.parallel(tasks, function (err, results) {
        log.debug('parallel cic results count: ' + results && results.length)
        log.debug('all cic submissions complete for msg_id: ' + msg.msg_id + ', sender: ' + msg.sender)
        callback(err, msg) // msg.recipient
      }, 10) // concurrency

      return
    } // end CIC



    // RFCIN rfcin
    if (msg.msg_type == 'requestForCatalogueItemNotification') {

      // from local TP to DP...
      if(msg.recipient == msg.sender) {
        
        msg.recipient_dp = config.homeDataPoolGln

        // generate new RFCIN for GR:
        var xml = config.gdsn.populateRfcinToGr(config, msg)
        db_msg_archive.saveMessage(xml, function (err, new_rfcin) {
          log.info('Generated RFCIN to GR, message saved to archive: ' + new_rfcin.msg_id + ', modified: ' + new Date(new_rfcin.modified_ts))
          callback(err, msg) // msg.recipient
        })
        return
      }

      // else from GR for this SDP, so call GDSN Server API
      if (msg.sender != config.gdsn_gr_gln) return callback(Error('incorrect RFCIN GR sender GLN: ' + msg.sender))

      log.debug('updating RFCIN data for sub/pub ' + msg.recipient + '/' + msg.provider)

      msg.source_dp = config.homeDataPoolGln

      var start_rfcin_api_call = Date.now()
      request.post({
        url          : config.url_gdsn_api + '/rfcin/' + msg.recipient + '/' + msg.provider
        , form: { 
            gtin  : msg.gtin || ''
          , gpc   : msg.gpc  || ''
          , tm    : msg.tm   || ''
          , isFromGR: 'true' // always true for testing and to trigger matching process upon local subscription create
          , isReload: msg.reload // boolean string
          , ts    : new Date()
        }
        , auth: {
            user: 'admin'
          , pass: 'devadmin'
          , sendImmediately: true
        }
      }, 
      function (err, response, body) {
        log.info('rfcin api call took ' 
          + (Date.now() - start_rfcin_api_call) 
          + ' ms with response: '
          + (response ? response.statusCode : 'NO_RESPONSE')
          + ', body: '
          + body)

        if (!err && response.statusCode != '200') err = Error('bad status code ' + response.statusCode + ' received')
        if (!err && !getSuccess(body))            err = Error(body) // object, not a string

        callback(err, msg) // msg.recipient

      }) // end request.post

      return
    } // end RFCIN



    // CIH cih CIHW cihw
    if (msg.msg_type == 'catalogueItemHierarchicalWithdrawal') {

      // generate new CIHR for RDP:
      if (msg.sender == msg.provider) { // forward from local DS to RDP
        
        log.debug('workflow for cihw from local tp ' + msg.sender)

        // lookup recipient's dp
        db_party.findParty(msg.recipient, function (err, party) {

          if (err) return callback(err)

          msg.recipient_dp = party.source_dp // registering home dp of party, not source_dp of item!
          msg.receiver = msg.recipient_dp

          var xml = config.gdsn.populateCihwToOtherSDP(config, msg)
          log.debug('GENERATED new CIHW to other RDP: ' + msg.receiver)

          db_msg_archive.saveMessage(xml, function (err, new_cihw) {
            log.info('Generated RFCIN to RDP, message saved to archive: ' + new_cihw.msg_id + ', modified: ' + new Date(new_cihw.modified_ts))
            callback(err, new_cihw) // msg.provider
          })
        })
      }
      else { // msg.sender == msg.source_dp
        callback(err, msg) // msg.provider
      }
    } // end CIH

  } // end process

  function getSuccess(body) {
    try {
      return JSON.parse(body).success == 'true'
    }
    catch (e) {
      log.debug('json parse error: ' + e)
    }
    return false
  }

  function getRciIsNeeded(body) {
    try {
      var body = JSON.parse(body)
      return body.info.p_sendRciMsg == 'true' || body.info.send_rci == 'true'
    }
    catch (e) {
      log.debug('json parse error: ' + e)
    }
    return false
  }

  function respond(error, req_msg_info, res, contentOwner, callback) {

      log.debug('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>       respond called for msg: ' + req_msg_info.msg_id)
      log.debug('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>       respond called for msg: ' + req_msg_info.msg_id)
      log.debug('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>       respond called for msg: ' + req_msg_info.msg_id)
      log.debug('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>       respond called for msg: ' + req_msg_info.msg_id)
      log.debug('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>       respond called for msg: ' + req_msg_info.msg_id)
      log.debug('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>       respond called for msg: ' + req_msg_info.msg_id)
      log.debug('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>       respond called for msg: ' + req_msg_info.msg_id)
      log.debug('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>       respond called for msg: ' + req_msg_info.msg_id)
      log.debug('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>       respond called for msg: ' + req_msg_info.msg_id)

    var response_xml = config.gdsn.populateResponseToSender(error && error.msg, config, req_msg_info, contentOwner)

    if (!error && req_msg_info.sender == req_msg_info.provider) { // local TP, so don't persist simple ACCEPTED responses from DP
      if (!res.finished) {
        res.jsonp({msg: 'local TP message was processed with msg_id: ' + req_msg_info.msg_id + ', sender: ' + req_msg_info.sender})
        return res.end()
      }
    }
    db_msg_archive.saveMessage(response_xml, function (err, saved_resp) {
      if (err) return callback(err)
      log.info('Generated response to message: ' + saved_resp.msg_id)
      log.info('Generated response message saved to archive: ' + saved_resp)
      if (!res.finished) {
        res.jsonp(saved_resp)
        res.end()
      }
    })
  }

  return api
}
