var async   = require('async')
var request = require('request')

module.exports = function (config) {

  var log            = require('../lib/Logger')('route_wf', config)
  var db_msg_archive = require('../lib/db/msg_archive.js')(config)
  var db_trade_item  = require('../lib/db/trade_item.js')(config)
    
  return function (req, res, next) {

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
    var state = req.param('state', 'DEFAULT') // from query string, not url template /:blah

    // fetch existing msg xml and submit to dp
    log.debug('gdsn-wf will try to locate existing message with id: ' + msg_id + ', sender: ' + sender)

    db_msg_archive.findMessage(sender, msg_id, function (err, msg) {
      if (err) return next(err)

      if (!msg || !msg.msg_id || !msg.xml) {
        log.error('msg_info problem with data:' + JSON.stringify(msg))
        console.dir(arguments)
        return next(Error('missing msg_info'))
      }

      // RE-parse original msg xml to generate parties, trade items, subscriptions, publications using latest logic
      var start_parse = Date.now()
      var msg_info = config.gdsn.get_msg_info(msg.xml)
      log.debug('reparse of db msg xml took ' + (Date.now() - start_parse) + ' ms for ' + msg_info.xml.length + ' new length')

      if (msg_info.receiver != config.homeDataPoolGln) {
        return next(Error('to initiate workflow, the message receiver must be the datapool and not ' + msg_info.receiver))
      }

      log.info('starting workflow for ' + msg_info.msg_id + ', msg_type: ' + msg_info.msg_type + ', modified: ' + new Date(msg_info.modified_ts))
      //log.debug('msg xml: ' + msg_info.xml)
      log.debug('msg xml length: ' + msg_info.xml.length)

      // if it's alrelady a response to a previous message, don't generate any new messages or responses and finish early
      // if it's alrelady a response to a previous message, don't generate any new messages or responses and finish early
      // if it's alrelady a response to a previous message, don't generate any new messages or responses and finish early
      // if it's alrelady a response to a previous message, don't generate any new messages or responses and finish early
      if (msg_info.msg_type == 'GDSNResponse') {

        // TODO: call GDSN Server API to record response? e.g. party or item reg response from gr
        // CIRR
        // BPRR

        var result_msg = 'response received to original msg_id ' + msg_info.request_msg_id + ' with status ' + msg_info.status
        log.debug(result_msg)
        if (!res.finished) {
          res.jsonp({msg:result_msg})
          res.end()
        }
        return 
      }

      if (msg_info.msg_type == 'basicPartyRegistration'
        || msg_info.msg_type == 'registryPartyDataDump') {

        var tasks = []
        msg_info.data.forEach(function (party) {

          if (party.source_dp == config.homeDataPoolGln) {
            if (msg_info.msg_type == 'registryPartyDataDump') {
              log.debug('skipping rpdd update for own party with gln ' + party.gln)
              return // don't update our own parties based on rpdd, only bpr
            }
          }
          else {
            if (msg_info.msg_type == 'basicPartyRegistration') {
              log.debug('skipping bpr update for other data pool party with gln ' + party.gln)
              return // don't update other dp's parties based on bpr, only rpdd
            }
          }

          tasks.push(function (callback) {

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
                'user': 'admin'
                , 'pass': 'devadmin'
                , 'sendImmediately': true
              }
            }, 
            function (err, response, body) {
              log.info('party api call took ' 
                + (Date.now() - start_party_api_call) 
                + ' ms with response: '
                + (response ? response.statusCode : 'NO_RESPONSE')
                + ', body: '
                + body)
              if (err) return callback(err)
              if (response.statusCode != '200') return callback(Error('bad status code ' + response.statusCode))
              if (!getSuccess(body)) return callback(Error(body))

              if (msg_info.msg_type == 'basicPartyRegistration') {
                var bpr_xml = config.gdsn.populateBprToGr(config, msg_info)
                db_msg_archive.saveMessage(bpr_xml, function (err, gen_msg_info) {
                  if (err) return next(err)
                  log.info('Generated bpr to gr message saved to archive: ' + gen_msg_info.msg_id + ', modified: ' + new Date(gen_msg_info.modified_ts))
                })
              }
              callback(null, body)
            }) // end request.post
          }) // end tasks.push
        }) // end msg_info.data.forEach party

        async.parallel(tasks, function (err, results) {
          log.debug('parallel party results count: ' + results && results.length)
          log.debug('all party submissions complete for msg_id ' + msg_info.msg_id)
          respond(err, msg_info, res, next)
        }, 10) // concurrency

        return
      } // end BPR and RPDD


      if (msg_info.msg_type == 'catalogueItemNotification') {
        
        // sent by SDP, other data pool, so generate gS1Response AND cic RECEIVED back to remote publisher
        if (msg_info.sender != msg_info.provider) { 
          log.debug('DP received CIN from other DP with msg_id: ' + msg_info.msg_id)
          var cic_xml = config.gdsn.populateRdpCicRecForSdpCin(config, msg_info, state)
          db_msg_archive.saveMessage(cic_xml, function (err, new_cic) {
            if (err)log.error('Error populating CIC back to SDP for CIN: ' + msg_info.msg_id + ', err: ' + err)
            log.info('Generated CIC to SDP direct from RDP for CIN: ' + msg_info.msg_id + ', message saved to archive: ' + new_cic.msg_id)
          })
          return respond(err, msg_info, res, next)
        }

        // update local provider item in DP and post RCI to GR
        // expect(msg_info.sender === msg_info.provider)
        var tasks = []
        msg_info.data.forEach(function (item) {

          tasks.push(function (callback) {

            log.debug('trade item data: ')
            console.dir(item)

            if (!item) return next(Error('item data not found for gtin ' + item.gtin + ', please check file or db'))

            var start_cin_api_call = Date.now()
            log.debug('posting CIN data to GDSN Server API for msg_id  ' + msg_info.msg_id)

            var form_data = {
                brandName                 : item.brand
              , classCategoryCode         : item.gpc
              , unitDescriptor            : item.unit_type
              , ts                        : new Date()
              , cmd                       : msg_info.status // to allow CORRECT value in synch list queue after matching process
              //, canceledDate: will cause IN_PROGRESS
              //, discontinuedDate: will cause IN_PROGRESS
            }
            //[&ci_state=REGISTERED]
            //[&isConsumerUnit=false]
            //[&isDispatchUnit=true]
            //[&isInvoiceUnit=false]
            //[&isMarkedReturnable=true]
            //[&isOrderableUnit=false]
            //[&isVariableUnit=true]

            if (msg_info.status == 'ADD') { // fill in some required values if missing
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
                'user': 'admin'
                , 'pass': 'devadmin'
                , 'sendImmediately': true
              }
            }, 
            function (err, response, body) {
              log.info('cin api call took ' 
                + (Date.now() - start_cin_api_call) 
                + ' ms with response: '
                + (response ? response.statusCode : 'NO_RESPONSE')
                + ', body: '
                + body)
              if (err) return callback(err)
              if (response.statusCode != '200') return callback(Error('bad status code ' + response.statusCode))
              if (!getSuccess(body)) return callback(Error(body))

              if (getRciIsNeeded(body)) { // TODO generate RCI to GR conditional upon DP API response
                var rci_xml = config.gdsn.populateRciToGr(config, msg_info)
                db_msg_archive.saveMessage(rci_xml, function (err, msg_info) {
                  if (err) return callback(err)
                  log.info('Generated rci message saved to archive: ' + msg_info.msg_id + ', modified: ' + new Date(msg_info.modified_ts))
                  callback(null, body)
                })
              }
              else callback(null, body) // no rci needed
            }) // end request.post
          }) // end tasks.push
        }) // end msg_info.data.forEach item

        async.parallel(tasks, function (err, results) {
          log.debug('parallel item submit results count: ' + results && results.length)
          log.debug('all item submissions complete for msg_id ' + msg_info.msg_id)
          respond(err, msg_info, res, next)
        }, 10) // concurrency

        return
      } // end CIN from local TP

      if (msg_info.msg_type == 'catalogueItemPublication') {

        // call GDSN Server API to publish item:
        // /gdsn-server/api/publish?gln={\\d13}&dr={\\d13}&gtin={\\d14}&tm={\\d3}[&tms=us-ca][&il=true][&delete=true]"

        var tasks = []
        msg_info.data.forEach(function (pub) {

          log.debug('>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>> pub gln :::::::::::::::: ' + pub.provider)
          var start_cip_api_call = Date.now()

          tasks.push(function (callback) {

            log.debug('update pub data for gtin ' + pub.gtin + ', pub to: ' + pub.recipient)

            var form = { 
                ds       : pub.provider
              , dr       : pub.recipient
              , gtin     : pub.gtin
              , tm       : pub.tm
              , tms      : pub.tm_sub != 'na' ? pub.tm_sub : ''
              , il       : pub.initial_load
              , ts       : new Date()
            }
            if (pub['delete']) form['delete'] = 'true'

            request.post({
              url          : config.url_gdsn_api + '/publish'
              , form: form
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
              if (response.statusCode != '200') return callback(Error('bad status code ' + response.statusCode))
              if (!getSuccess(body)) return callback(Error(body))
              callback(null, body)
            }) // end request.post
          }) // end tasks.push
        }) // end msg_info.data.forEach pub

        async.parallel(tasks, function (err, results) {
          log.debug('parallel cip results count: ' + results && results.length)
          log.debug('all cip submissions complete for msg_id ' + msg_info.msg_id)
          respond(err, msg_info, res, next)
        }, 10) // concurrency

        return
      } // end CIP

      if (msg_info.msg_type == 'catalogueItemSubscription') {

        var tasks = []
        msg_info.data.forEach(function (sub) {

          tasks.push(function (callback) {
            log.debug('updating sub data for sub/pub ' + sub.recipient + '/' + sub.provider)

            var start_cis_api_call = Date.now()
            request.post({
              url          : config.url_gdsn_api + '/cis/' + sub.recipient + '/' + sub.provider
              , form       : { 
                  gtin  : sub.gtin || ''
                , gpc   : sub.gpc  || ''
                , tm    : sub.tm   || ''
                , ts    : new Date()
                , isFromGR: 'true' // always true for testing and to trigger matching process upon local subscription create
                //, isFromGR: (sub.sender == config.gdsn_gr_gln) ? 'true' : ''
              }
              , auth: {
                  'user': 'admin'
                  , 'pass': 'devadmin'
                  , 'sendImmediately': true
                }
            }, 
            function (err, response, body) {
              log.info('cis api call took ' 
                + (Date.now() - start_cis_api_call) 
                + ' ms with response: '
                + (response ? response.statusCode : 'NO_RESPONSE')
                + ', body: '
                + body)
              if (err) return callback(err)
              if (response.statusCode != '200') return callback(Error('bad status code ' + response.statusCode))
              if (!getSuccess(body)) return callback(Error(body))

              if (msg_info.sender != config.gdsn_gr_gln) {
                var cis_xml = config.gdsn.populateCisToGr(config, msg_info)
                db_msg_archive.saveMessage(cis_xml, function (err, msg_info) {
                  if (err) return next(err)
                  log.info('Generated cis to gr message saved to archive: ' + msg_info.msg_id + ', modified: ' + new Date(msg_info.modified_ts))
                  callback(null, body)
                })
              }
            }) // end request.post
          }) // end tasks.push
        }) // end msg_info.data.forEach sub

        async.parallel(tasks, function (err, results) {
          log.debug('parallel cis results count: ' + results && results.length)
          log.debug('all cis submissions complete for msg_id ' + msg_info.msg_id)
          respond(err, msg_info, res, next)
        }, 10) // concurrency

        return
      } // end CIS

      // CIC cic from local TP subscriber or other DP
      if (msg_info.msg_type == 'catalogueItemConfirmation') {

        log.debug('found CIC message for workflow')

        var tasks = []

        msg_info.data.forEach(function (cic) {
        
          tasks.push(function (callback) {

            // from local subscriber TP
            if (msg_info.sender == cic.recipient) {

              // need to determine source dp for item that will recieve CIC on behalf of publisher
              // process CIC from local TP subscriber, generate CIC to SDP (could be self dp)
              db_trade_item.findTradeItem(cic.recipient, cic.gtin, cic.provider, cic.tm, cic.tm_sub, function (err, item) {
                if (err) {
                  log.error('Could not locate trade item for cic: ' + JSON.stringify(cic))
                  return callback(err)
                }
                log.debug('found trade item sourceDataPool: ' + item.source_dp)

                cic.source_dp         = item.source_dp
                msg_info.source_dp    = cic.source_dp
                msg_info.confirm_code = cic.confirm_code
                msg_info.confirm_desc = cic.confirm_desc

                var cic_xml = config.gdsn.populateCicToSourceDP(config, msg_info)
                db_msg_archive.saveMessage(cic_xml, function (err, new_cic) {
                  if (err) return callback(err)
                  log.info('Generated CIC to publisher DP, message saved to archive: ' + new_cic.msg_id + ', modified: ' + new Date(new_cic.modified_ts))
                  callback(null, new_cic)
                })
              })
              return
            }

            // process CIC from other DP for local TP publisher, step TT_8.5
            console.log('expect msg_info.source_dp to be home dp for cic from other dp: ' + msg_info.source_dp)

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
                  'user': 'admin'
                  , 'pass': 'devadmin'
                  , 'sendImmediately': true
                }
            }, 
            function (err, response, body) {
              log.info('cic api call took ' 
                + (Date.now() - start_cic_api_call) 
                + ' ms with response: '
                + (response ? response.statusCode : 'NO_RESPONSE')
                + ', body: '
                + body)
              if (err) return callback(err)
              if (response.statusCode != '200') return callback(Error('bad status code ' + response.statusCode))
              if (!getSuccess(body)) return callback(Error(body))
              callback(null, body)
            }) // end request.post
          }) // end tasks.push
        }) // end data.forEach cic

        async.parallel(tasks, function (err, results) {
          log.debug('parallel cic results count: ' + results && results.length)
          log.debug('all cic submissions complete for msg_id: ' + msg_info.msg_id + ', sender: ' + msg_info.sender)
          respond(err, msg_info, res, next)
        }, 10) // concurrency

        return
      } // end CIC



      // RFCIN rfcin
      if (msg_info.msg_type == 'requestForCatalogueItemNotification') {

        // from local TP to DP...
        if(msg_info.recipient == msg_info.sender) {
          
          msg_info.recipient_dp = config.homeDataPoolGln

          // generate new RFCIN for GR:
          var xml = config.gdsn.populateRfcinToGr(config, msg_info)
          db_msg_archive.saveMessage(xml, function (err, new_rfcin) {
            log.info('Generated RFCIN to GR, message saved to archive: ' + new_rfcin.msg_id + ', modified: ' + new Date(new_rfcin.modified_ts))
            respond(err, msg_info, res, next)
          })
          return
        }

        // else from GR for this SDP, so call GDSN Server API
        if (msg_info.sender != config.gdsn_gr_gln) return next(Error('incorrect RFCIN GR sender GLN: ' + msg_info.sender))

        log.debug('updating RFCIN data for sub/pub ' + msg_info.recipient + '/' + msg_info.provider)

        msg_info.source_dp = config.homeDataPoolGln

        var start_rfcin_api_call = Date.now()
        request.post({
          url          : config.url_gdsn_api + '/rfcin/' + msg_info.recipient + '/' + msg_info.provider
          , form: { 
              gtin  : msg_info.gtin || ''
            , gpc   : msg_info.gpc  || ''
            , tm    : msg_info.tm   || ''
            , isFromGR: 'true' // always true for testing and to trigger matching process upon local subscription create
            , isReload: msg_info.reload // boolean string
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

          respond(err, msg_info, res, next)
        }) // end request.post

        return
      } // end RFCIN





      // CIH cih
      if (msg_info.msg_type == 'catalogueItemHierarchicalWithdrawal') {
        // TODO: call GDSN Server API to manage children?
        return respond(null, msg_info, res, next)
      } // end CIH

    })
  }
  

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
      return JSON.parse(body).rci_is_needed == 'true'
    }
    catch (e) {
      log.debug('json parse error: ' + e)
    }
    return false
  }

  function respond(error, req_msg_info, res, next) {
    var response_xml = config.gdsn.populateResponseToSender(error && error.msg, config, req_msg_info)

    if (!error && req_msg_info.sender == req_msg_info.provider) { // local TP, so don't persist simple ACCEPTED responses from DP
      if (!res.finished) {
        res.jsonp({msg: 'local TP message was processed with msg_id: ' + req_msg_info.msg_id + ', sender: ' + req_msg_info.sender})
        return res.end()
      }
    }
    db_msg_archive.saveMessage(response_xml, function (err, saved_resp) {
      if (err) return next(err)
      log.info('Generated response to message: ' + saved_resp.msg_id)
      log.info('Generated response message saved to archive: ' + saved_resp)
      if (!res.finished) {
        res.jsonp(saved_resp)
        res.end()
      }
    })
  }
}
