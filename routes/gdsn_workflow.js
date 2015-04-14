var async   = require('async')
var request = require('request')

module.exports = function (config) {

  var msg_archive_db  = require('../lib/db/msg_archive.js')(config)
  var log             = require('../lib/Logger')('route_wf', config)
    
  return function (req, res, next) {

    log.debug('>>> route handler called with path ' + req.path)

    var sender = req.params.sender
    if (!config.gdsn.validateGln(sender)) {
      res.end('sender must be a valid GLN')
      return
    }
  
    var msg_id = req.params.msg_id
    var sender = req.params.sender
    if (!msg_id) { 
      res.end('msg_id param is required')
      return
    }
    // fetch existing msg xml and submit to dp
    log.debug('gdsn-wf will use existing message with id ' + msg_id)
    msg_archive_db.findMessage(sender, msg_id, function (err, db_msg_info) {

      if (err) return next(err)
      if (db_msg_info.length > 1) return next(Error('found multiple messages with id ' + msg_id))

      db_msg_info = db_msg_info[0]

      if (!db_msg_info || !db_msg_info.msg_id || !db_msg_info.xml) {
        log.error('msg_info problem with data:' + JSON.stringify(db_msg_info))
        return next(Error('missing msg_info'))
      }

      // RE-parse original msg xml to generate parties, trade items, subscriptions, publications using latest logic
      var start_parse = Date.now()
      var msg_info = config.gdsn.get_msg_info(db_msg_info.xml)
      log.debug('reparse of db msg xml took ' + (Date.now() - start_parse) + ' ms for ' + msg_info.xml.length + ' new length')

      if (msg_info.receiver != config.homeDataPoolGln) {
        return next(Error('to initiate workflow, the message receiver must be the datapool and not ' + msg_info.receiver))
      }

      if (msg_info.sender == config.homeDataPoolGln) {
        return next(Error('the data pool cannot message itself'))
      }

      if (!msg_info.source_dp) {
        return next(Error('msg_id ' + db_msg_info.request_msg_id + ' with no source_dp'))
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

        var msg = 'response received to original msg_id ' + msg_info.request_msg_id + ' with status ' + msg_info.status
        log.debug(msg)
        if (!res.finished) res.end(msg)
        return 
      }

      if (msg_info.msg_type == 'basicPartyRegistration'
        || msg_info.msg_type == 'registryPartyDataDump') {

        msg_info.party.forEach(function (party) { console.dir(party) })

        var tasks = []
        msg_info.party.forEach(function (party) {

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
              if (response.statusCode != '200') return callback('bad status code ' + response.statusCode)
              if (!getSuccess(body)) return callback(body)

              if (msg_info.msg_type == 'basicPartyRegistration') {
                var bpr_xml = config.gdsn.populateBprToGr(config, msg_info)
                msg_archive_db.saveMessage(bpr_xml, function (err, gen_msg_info) {
                  if (err) return next(err)
                  log.info('Generated bpr to gr message saved to archive: ' + gen_msg_info.msg_id + ', modified: ' + new Date(gen_msg_info.modified_ts))
                })
              }
              callback(null, body)
            }) // end request.post
          }) // end tasks.push
        }) // end msg_info.party.forEach

        async.parallel(tasks, function (err, results) {
          log.debug('all party submissions complete for msg_id ' + msg_info.msg_id)
          respond(err, msg_info, res, next)
        }, 10) // concurrency

        return
      } // end BPR and RPDD

      if (msg_info.msg_type == 'catalogueItemNotification' && msg_info.sender != msg_info.provider) {
        //return next(Error('cin from other dp for local subscriber cannot be workflowed, maybe later!'))
        respond(null, msg_info, res, next)
        return
      }

      // update local provider item in DP and post RCI to GR
      if (msg_info.msg_type == 'catalogueItemNotification' && msg_info.sender == msg_info.provider) {

        var tasks = []
        msg_info.item.forEach(function (item) {

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
              if (response.statusCode != '200') return callback('bad status code ' + response.statusCode)
              if (!getSuccess(body)) return callback(body)

              //if (getRciIsNeeded(body)) { // TODO send RCI to GR conditional upon api response
                var rci_xml = config.gdsn.populateRciToGr(config, msg_info)
                msg_archive_db.saveMessage(rci_xml, function (err, msg_info) {
                  if (err) return next(err)
                  log.info('Generated rci message saved to archive: ' + msg_info.msg_id + ', modified: ' + new Date(msg_info.modified_ts))
                })
              //}

              callback(null, body)
            }) // end request.post
          }) // end tasks.push
        }) // end msg_info.party.forEach

        async.parallel(tasks, function (err, results) {
          log.debug('all item submissions complete for msg_id ' + msg_info.msg_id)
          respond(err, msg_info, res, next)
        }, 10) // concurrency

        return
      } // end CIN from local TP

      if (msg_info.msg_type == 'catalogueItemPublication') {

        // call GDSN Server API to publish item:
        // /gdsn-server/api/publish?gln={\\d13}&dr={\\d13}&gtin={\\d14}&tm={\\d3}[&tms=us-ca][&il=true][&delete=true]"

        var tasks = []
        msg_info.pub.forEach(function (pub) {

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
              if (response.statusCode != '200') return callback('bad status code ' + response.statusCode)
              if (!getSuccess(body)) return callback(body)
              callback(null, body)
            }) // end request.post
          }) // end tasks.push
        }) // end msg_info.pub.forEach

        async.parallel(tasks, function (err, results) {
          log.debug('all cip submissions complete for msg_id ' + msg_info.msg_id)
          respond(err, msg_info, res, next)
        }, 10) // concurrency

        return
      } // end CIP

      if (msg_info.msg_type == 'catalogueItemSubscription') {

        var tasks = []
        msg_info.sub.forEach(function (sub) {

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
              if (response.statusCode != '200') return callback('bad status code ' + response.statusCode)
              if (!getSuccess(body)) return callback(body)

              if (msg_info.sender != config.gdsn_gr_gln) {
                var cis_xml = config.gdsn.populateCisToGr(config, msg_info)
                msg_archive_db.saveMessage(cis_xml, function (err, msg_info) {
                  if (err) return next(err)
                  log.info('Generated cis to gr message saved to archive: ' + msg_info.msg_id + ', modified: ' + new Date(msg_info.modified_ts))
                })
              }
              callback(null, body)
            }) // end request.post
          }) // end tasks.push
        }) // end msg_info.sub.forEach

        async.parallel(tasks, function (err, results) {
          log.debug('all cis submissions complete for msg_id ' + msg_info.msg_id)
          respond(err, msg_info, res, next)
        }, 10) // concurrency

        return
      } // end CIS

      // CIC cic from local TP subscriber or other DP
      if (msg_info.msg_type == 'catalogueItemConfirmation') {

        var tasks = []

        tasks.push(function (callback) {

          if (msg_info.sender != msg_info.recipient) { // process CIC from other DP for local publisher
            var cic_xml = config.gdsn.populateCic(config, msg_info)
            msg_archive_db.saveMessage(cic_xml, function (err, new_cic) {
              if (err) callback(err)
              log.info('Generated CIC to other DP message saved to archive: ' + new_cic.msg_id + ', modified: ' + new Date(new_cic.modified_ts))
              callback(null, cic_xml)
            })
            return
          }

          log.debug('updating DP cic synch list data for sub/pub ' + msg_info.recipient + '/' + msg_info.provider)

          var start_cic_api_call = Date.now()
          request.post({
            url: config.url_gdsn_api + '/cic/' + msg_info.recipient + '/' + msg_info.gtin + '/' + msg_info.provider + '/' + msg_info.tm + '/' + msg_info.tm_sub
            , form: { 
                status   : msg_info.status
               , reason  : msg_info.exception
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
            if (response.statusCode != '200') return callback('bad status code ' + response.statusCode)
            if (!getSuccess(body)) return callback(body)

            var cic_xml = config.gdsn.populateCic(config, msg_info)
            msg_archive_db.saveMessage(cic_xml, function (err, msg_info) {
              if (err) return next(err)
              log.info('Generated cic to gr message saved to archive: ' + msg_info.msg_id + ', modified: ' + new Date(msg_info.modified_ts))
            })

            callback(null, body)
          }) // end request.post

        }) // end tasks.push

        async.parallel(tasks, function (err, results) {
          log.debug('cic submission complete for msg_id ' + msg_info.msg_id)
          respond(err, msg_info, res, next)
        }, 10) // concurrency

        return

      } // end CIC

      // RFCIN rfcin
      if (msg_info.msg_type == 'requestForCatalogueItemNotification') {
        // TODO: call GDSN Server API to manage one-time faux-subscription
        // TODO: generate RFCIN for GR
        return respond('not yet supported', msg_info, res, next)
      } // end RFCIN

      // CIH cih
      if (msg_info.msg_type == 'catalogueItemHierarchicalWithdrawal') {
        // TODO: call GDSN Server API to manage children
        //var rfcin = config.gdsn.populateCih(config, msg_info) // ???
        return respond('not yet supported', msg_info, res, next)
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
    var response_xml = config.gdsn.populateResponseToSender(error, config, req_msg_info)
    msg_archive_db.saveMessage(response_xml, function (err, saved_resp) {
      if (err) return next(err)
      log.info('Generated response to message: ' + saved_resp.requesting_msg_id)
      log.info('Generated response message saved to archive: ' + saved_resp.msg_id + ', modified: ' + new Date(saved_resp.modified_ts))
      if (!res.finished) {
        //res.write(response_xml) // XML gS1Response ACCEPTED
        res.json(saved_resp)
        return res.end()
      }
    })
  }
}
