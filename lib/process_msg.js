module.exports = function (config) {

  var async          = require('async')
  var request        = require('request')
  var log            = require('../lib/Logger')('proc_msg', config)
  var outbox         = require('../lib/outbox.js')(config)
  var db_trade_item  = require('../lib/db/trade_item.js')(config)
  var db_party       = require('../lib/db/trading_party.js')(config)

  var api = {}
    
  api.workflow = function (msg, callback) {

    if (msg.receiver != config.homeDataPoolGln) {
      return callback(Error('to initiate workflow, the message receiver must be the datapool and not ' + msg.receiver))
    }

    log.info('starting workflow for ' + msg.msg_id + ', msg_type: ' + msg.msg_type + ', modified: ' + new Date(msg.modified_ts))
    //log.debug('msg xml: ' + msg.xml)
    log.debug('msg xml length: ' + msg.xml.length)

    // if it's already a response to a previous message, don't generate any new messages and finish early
    if (msg.msg_type == 'GDSNResponse') {

      // CIRR - update catalog item status to REGISTERED if this is an ACCEPTED reponse from GR to an RCI
      if (msg.gtin) { // most reponses don't (yet) have a gtin! TODO
        var start_cirr_api_call = Date.now()
        request.post({
          url   : config.url_gdsn_api + '/ci/' + msg.provider + '/' + msg.gtin + '/' + msg.tm + '/' + msg.tm_sub || 'na' 
          , form: {cmd: (msg.exception ? 'ERROR' : 'REGISTERED'), error: msg.exception}
          , auth: {
            user: 'admin'
            , pass: 'devadmin'
            , sendImmediately: true
          }
        }, 
        function (err, response, body) {
          log.info('cirr api call took ' 
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
      else { // not CIRR
        callback(null, 'non-CIRR response, no workflow action taken')
      }
      return
    } // end GDSNResponse

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
              var bpr_xml = config.gdsn.populateBprToGr(msg)
              outbox.send_from_dp(bpr_xml, function (err, result) {
                if (err) return task_done(err)
                task_done(null, 'done sending BPR to gr for original msg: ' + msg.msg_id)
              })
            }
            else {
              task_done(null, 'nothing to send to gr for each party update, send response below')
            }

          }) // end request.post
        }) // end tasks.push
      }) // end msg.data.forEach party

      async.parallelLimit(tasks, config.concurrency, function (err, results) {
        log.debug('parallel party results count: ' + results && results.length)
        log.debug('all party submissions complete for msg_id ' + msg.msg_id)
        var response_xml = config.gdsn.populateResponseToSender(err && err.msg, msg, msg.sender)
        outbox.send_from_dp(response_xml, callback)
      }) // end async.parallelLimit

      return
    } // end BPR and RPDD

    // MDS tradeItems list format
    if (msg.msg_type == 'tradeItems') {
      msg.note = '>>> custom list of publisher tradeItem elements'
      log.info('found MDS <tradeItems> with msg_id: ' + msg.msg_id)
      msg.data.forEach(function (tradeItem) {
        log.info('found MDS tradeItem: ' + tradeItem.gtin + ' from provider gln ' + tradeItem.provider)
        if (!msg.sender  ) msg.sender   = tradeItem.provider
        if (!msg.receiver) msg.receiver = config.homeDataPoolGln  
        if (!msg.msg_id  ) msg.msg_id   = 'mds_tradeItems_' + Date.now()
      })
      return
    } // end tradeItems msg_type

    // handle CIN cin messages in all directions
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
          log.debug('DP received CIN from other DP with msg_id: ' + msg.msg_id)

          if (config.auto_cic) { // auto send CIC received message back to publisher
            var cic_state = 'RECEIVED'
            var cic_xml = config.gdsn.populateRdpCicRecForSdpCin(msg, cic_state)
            outbox.send_from_dp(cic_xml, function (err, result) {
              if (err) log.error('Error populating CIC back to SDP for CIN: ' + msg.msg_id + ', err: ' + err)
              log.info('Generated CIC to SDP direct from RDP for CIN: ' + msg.msg_id + ' with stat ' + cic_state)
            })
          }

          // forward CIN to local subscriber
          var cin_xml = config.gdsn.forward_cin_to_subscriber(msg.xml, msg.recipient, msg.provider, msg.gtin)
          outbox.send_from_dp(cin_xml, function (err, result) {
            if (err) log.error('Error populating and send CIN to local subscriber: ' + msg.msg_id)
            log.info('Generated subscriber CIN for CIN: ' + msg.msg_id)
          }, 'skip-biz-objects')

          var response_xml = config.gdsn.populateResponseToSender(null, msg, /* original contentOwner */ msg.provider)
          outbox.send_from_dp(response_xml, callback)

          return
        }
      }

      var skipMatchingProcess = false
      var tasks = []

      // process each derived biz-object in msg data[] , ie tradeItem in CIN
      msg.data.forEach(function (item) {
        if (item) tasks.push(function (task_done) {

          log.debug('...............................................................................skip matching: ' + skipMatchingProcess)
          log.debug('trade item data: ' + item)

          var start_cin_api_call = Date.now()
          log.debug('posting CIN data to GDSN Server API for msg_id  ' + msg.msg_id)

          var form_data = {
              brandName                 : item.brand
            , classCategoryCode         : item.gpc
            , unitDescriptor            : item.unit_type
            , ts                        : new Date()
            , cmd                       : msg.status // to allow CORRECT value in synch list queue after matching process
            , ci_state: 'REGISTERED' // always, for now
            , test_msg: 'hello ' + Date.now()
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

          if (skipMatchingProcess) form_data.skipMatchingProcess = 'true'
          else skipMatchingProcess = true

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

            // generate RCI to GR conditional upon DP API response
            var send_rci = false
            var rci_cmd = msg.status
            try {
              var info = JSON.parse(body).info
              send_rci = info.p_sendRciMsg
              if (send_rci == 'false') send_rci = false
              rci_cmd = info.p_documentCommandHeader || rci.cmd
            }
            catch (e) {
              log.debug('getRciIsNeeded: ' + body)
              log.debug('check sendRci parse error: ' + e)
            }
            if (send_rci || config.send_rci) { 
              log.info('generating RCI for GR for GTIN ' + item.gtin + ' with cmd ' + rci_cmd)
              var rci_xml = config.gdsn.create_rci_to_gr(item, rci_cmd)
              outbox.send_from_dp(rci_xml, function (err, result) {
                if (err) log.error('Error populating and sending RCI to GR: ' + err)
                task_done(null, 'done sending RCI to gr for gtin ' + item.gtin)
              })
            }
            else {
              task_done(null, 'no rci to gr needed, all done')
            }

          }) // end request.post

        }) // end tasks.push
      }) // end msg.data.forEach biz-object processing

      async.parallelLimit(tasks, config.concurrency, function (err, results) {
        log.debug('parallel item submit results count: ' + results && results.length)
        log.debug('all item submissions complete for msg_id ' + msg.msg_id)
        var response_xml = config.gdsn.populateResponseToSender(err && err.msg, msg, msg.provider)
        outbox.send_from_dp(response_xml, callback)
      }) // end async.parallelLimit

      return
    } // end CIN

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

      async.parallelLimit(tasks, config.concurrency, function (err, results) {
        log.debug('parallel cip results count: ' + results && results.length)
        log.debug('all cip submissions complete for msg_id ' + msg.msg_id)
        var response_xml = config.gdsn.populateResponseToSender(err && err.msg, msg, msg.provider)
        outbox.send_from_dp(response_xml, callback)
      }) // end async.parallelLimit

      return
    } // end CIP

    // CIS cis
    if (msg.msg_type == 'catalogueItemSubscription') {

      var tasks = []
      msg.data.forEach(function (sub) {

        tasks.push(function (task_done) {
          log.debug('updating sub data for sub/pub ' + sub.recipient + '/' + sub.provider)

          var form_data = { 
              gtin  : sub.gtin || ''
            , gpc   : sub.gpc  || ''
            , tm    : sub.tm   || ''
            , ts    : new Date()
            , isFromGR: (msg.sender == config.gdsn_gr_gln) ? 'true' : ''
          }
          if (msg.status == 'DELETE') form_data.mode = 'Unsubscribe'
          else form_data.mode = 'Subscribe'

          try { log.debug('cis form data: ' + JSON.stringify(form_data)) }
          catch (e) {}

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
              var cis_xml = config.gdsn.populateCisToGr(msg)
              outbox.send_from_dp(cis_xml, function (err, result) {
                if (err) log.error('Error populating and sending CIS to gr: ' + err)
                task_done(null, 'done sending CIS to gr: ' + msg.msg_id)
              })
            }
            else {
              task_done(null, body)
            }

          }) // end request.post
        }) // end tasks.push
      }) // end msg.data.forEach sub

      async.parallelLimit(tasks, config.concurrency, function (err, results) {
        log.debug('parallel cis results count: ' + results && results.length)
        log.debug('all cis submissions complete for msg_id ' + msg.msg_id)
        var response_xml = config.gdsn.populateResponseToSender(err && err.msg, msg, msg.recipient)
        outbox.send_from_dp(response_xml, callback)
      }) // end async.parallelLimit

      return
    } // end CIS cis

    // CIC cic from local TP subscriber or other DP
    if (msg.msg_type == 'catalogueItemConfirmation') {

      log.debug('found CIC message for workflow')

      var tasks = []

      if (msg.sender != config.homeDataPoolGln) msg.data.forEach(function (cic) { // save CIC not forwarded by home DP
      
        tasks.push(function (task_done) {

          // need to determine source dp for item that will recieve CIC on behalf of publisher
          // process CIC from local TP subscriber, generate CIC to SDP (could be self dp)
          db_trade_item.findTradeItem(cic.recipient, cic.gtin, cic.provider, cic.tm, cic.tm_sub, function (err, item) {
            if (err) {
              log.error('Could not locate trade item for cic: ' + JSON.stringify(cic))
              return task_done(err)
            }
            log.debug('found trade item sourceDataPool: ' + item.source_dp)

            cic.source_dp    = item.source_dp
            msg.source_dp    = cic.source_dp
            msg.confirm_code = cic.confirm_code
            msg.confirm_desc = cic.confirm_desc

            if (cic.source_dp != config.homeDataPoolGln) { // generate CIC to other DP
              var cic_xml = config.gdsn.populateCicToSourceDP(msg)
              return outbox.send_from_dp(cic_xml, function (err, result) {
                if (err) log.error('Error populating and sending CIC to other DP: ' + err)
                task_done(null, 'done sending CIC to other DP: ' + msg.msg_id)
              })
            }
            // apply synch list status to local DP items // call to update synch list/pub status
            log.debug('updating DP cic synch list data for sub/pub ' + cic.recipient + '/' + cic.provider)
            var start_cic_api_call = Date.now()
            request.post({
              url: config.url_gdsn_api + '/cics/' + cic.recipient + '/' + cic.gtin + '/' + cic.provider + '/' + cic.tm + '/' + cic.tm_sub
              , form: { 
                  status   : cic.state
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

              // send CIC to local publisher
              var cic_xml = config.gdsn.populateCicToLocalPub(msg)
              outbox.send_from_dp(cic_xml, function (err, result) {
                if (err) log.error('Error populating and sending CIC to local publisher: ' + err)
                task_done(null, 'done sending CIC to local publisher: ' + msg.msg_id)
              })
            }) // end request.post
          }) // end findTradeItem

          // process CIC from other DP for local TP publisher, step TT_8.5
          log.debug('expect msg source_dp to be home dp for cic from other dp: ' + msg.source_dp)

        }) // end tasks.push
      }) // end data.forEach cic

      async.parallelLimit(tasks, config.concurrency, function (err, results) {
        log.debug('parallel cic results count: ' + results && results.length)
        log.debug('all cic submissions complete for msg_id: ' + msg.msg_id + ', sender: ' + msg.sender)
        var response_xml = config.gdsn.populateResponseToSender(err && err.msg, msg, msg.recipient)
        outbox.send_from_dp(response_xml, callback)
      }) // end async.parallelLimit

      return
    } // end CIC

    // RFCIN rfcin
    if (msg.msg_type == 'requestForCatalogueItemNotification') {

      // from local subscriber TP, so generate and send new RFCIN to GR:
      if (msg.recipient == msg.sender) {
        msg.recipient_dp = config.homeDataPoolGln
        var rfcin_xml = config.gdsn.populateRfcinToGr(msg)
        return outbox.send_from_dp(rfcin_xml, callback)
      }

      // else from GR for this SDP, so call GDSN Server API
      if (msg.sender != config.gdsn_gr_gln) {
        var response_xml = config.gdsn.populateResponseToSender('incorrect RFCIN GR sender', msg, msg.sender)
        outbox.send_from_dp(response_xml, callback)
        return
      }

      log.debug('updating RFCIN data for sub/pub ' + msg.recipient + '/' + msg.provider)

      msg.source_dp = config.homeDataPoolGln

      var start_rfcin_api_call = Date.now()
      request.post({
        url          : config.url_gdsn_api + '/rfcin/' + msg.recipient + '/' + msg.provider
        , form: { 
            gtin  : msg.gtin || ''
          , gpc   : msg.gpc  || ''
          , tm    : msg.tm   || ''
          , isFromGR: (msg.sender == config.gdsn_gr_gln) ? 'true' : ''
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

        var response_xml = config.gdsn.populateResponseToSender(err && err.msg, msg, msg.recipient)
        outbox.send_from_dp(response_xml, callback)

      }) // end request.post

      return
    } // end RFCIN

    // CIH cih CIHW cihw
    if (msg.msg_type == 'catalogueItemHierarchicalWithdrawal') {
      log.debug('cihw: ' + msg.msg_id)
      // generate new CIHR for RDP:
      if (msg.sender == msg.provider) { // forward from local DS to RDP
        log.debug('workflow for cihw from local tp ' + msg.sender)
        var cihw_xml = config.gdsn.populateCihwToOtherSDP(msg)
        outbox.send_from_dp(cihw_xml, function (err, result) {
          var response_xml = config.gdsn.populateResponseToSender(err && err.msg, msg, msg.provider)
          outbox.send_from_dp(response_xml, callback)
        })
      }
      else if (msg.sender != config.homeDataPoolGln) {
        var response_xml = config.gdsn.populateResponseToSender(null, msg, msg.provider)
        outbox.send_from_dp(response_xml, callback)
      }
      else {
        callback(null, {success:true,msg:'generic cih workflow for sender ' + msg.sender})
      }
      return
    } // end CIH

    // new message types?
    log.info('=========================================>>> found new? message type ' + msg.msg_type + ' with id ' + msg.msg_id)
    callback(Error('unkown msg_type: ' + msg.msg_type))

  } // end api.workflow

  function getSuccess(body) {
    try {
      return JSON.parse(body).success == 'true'
    }
    catch (e) {
      log.debug('getSuccess json parse error: ' + e)
    }
    return false
  }

  return api
}

