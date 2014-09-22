module.exports = function (config) {

	var log   = require('./Logger')('msgarch_db', {debug: true})
	
	var api = {}

	api.saveMessage = function (msg_info, callback) {
	  try {
	    msg_info.modified_ts = Date.now()
	    config.database.mdb.msg_archive.save(msg_info, function (err, result) {
	      log.info('Persisted message with instance_id ' + msg_info.instance_id)
	      callback(null, msg_info.instance_id)
	    })
	  }
	  catch (err) {
	    setImmediate(function () {
	      callback(err)
	    })
	  }
	}

	api.saveMessageString = function (msg_string, callback) {
	  var ts = Date.now()

	  var tagName = 'InstanceIdentifier'
	  var matches = msg_string.match(RegExp(tagName + '>([^<\/]*)<\/'))
	  var id = (matches && matches[1]) || 'id_' + ts
	  log.info('found message instance id: ' + id)

	  var info = {
	    archived_ts   : ts
	    , instance_id : id
	    , xml         : config.gdsn.clean_xml(msg_string)
	    , raw_xml     : msg_string
	  }
	  this.saveMessage(info, callback)
	}

	api.listMessages = function (page, perPage, callback) {
	  try {
	    config.database.mdb.msg_archive
	      .find({}, {xml: 0, raw_xml: 0})
	      .sort({modified_ts: -1})
	      .skip(page * perPage)
	      .limit(perPage)
	      .toArray(callback)
	  }
	  catch (err) {
	    setImmediate(function () {
	      callback(err)
	    })
	  }
	}

	api.findMessage = function (instance_id, callback) {
	  try {
	    config.database.mdb.msg_archive
	      .find({instance_id: instance_id}, {xml:1})
	      .sort({modified_ts: -1}, callback)
	  }
	  catch (err) {
	    setImmediate(function () {
	      callback(err)
	    })
	  }
	}

	return api;
}
