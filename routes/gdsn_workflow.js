module.exports = function (config) {

  var log            = require('../lib/Logger')('route_wf', config)
  var db_msg_archive = require('../lib/db/msg_archive.js')(config)
  var db_trade_item  = require('../lib/db/trade_item.js')(config)
  var db_party       = require('../lib/db/trading_party.js')(config)
  var process_msg    = require('../lib/process_msg.js')(config)
    
  var api = {}

  api.lookup_and_process = function (req, res, next) {

    log.debug('>>> route handler called with path ' + req.path)

    var sender = req.params.sender
    if (!config.gdsn.validateGln(sender)) {
      return next(Error('sender must be a valid GLN'))
    }
    var msg_id = req.params.msg_id
    if (!msg_id) { 
      return next(Error('msg_id param is required'))
    }

    // send cic only if cic_state is specified in request
    var cic_state = req.param('cic_state', 'DEFAULT') // req.param() reads from query string only, not url template path

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

      process_msg.workflow(msg, function (err, result) {
        res.jsonp(err || result)
      })
    })
  }

  api.convert_item = function (req, res, next) {
    log.debug('>>> route handler called with path ' + req.path)
    var content = ''
    req.setEncoding('utf8')
    req.on('data', function (chunk) {
      log.debug('gdsn_28_31 post_chunk.length: ' + (chunk && chunk.length))
      content += chunk
      if (content.length > 10 * 1024 * 1024 && !res.finished) res.end('content too big - larger than 10 MB')
    })
    req.on('end', function () {
      log.debug('NEW gdsn_28_31 req posted content length: ' + content.length)
      if (res.finished) return
      try {
        content = config.gdsn.convert_tradeItem_28_31(content)
      }
      catch (e) {
        log.error(e)
        return res.send(e)
      }
      log.debug('return gdsn_28_31 content length: ' + (content && content.length))
      res.send(content)
    })
  }

  return api
}
