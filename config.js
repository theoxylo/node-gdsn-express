module.exports = {
    http_port       : 8080           // listen port for UI and service API
  , homeDataPoolGln : '0000000000000'// required for data pool workflow
  , debug           : true           // additional logging
  , db_url          : 'gdsn'         // for localhost MongoDb, used by lib/Database.js
  , inbox_dir       : './msg/inbox'  // watch directory for incoming messages
  , outbox_dir      : './msg/outbox' // for outgoing messages sent by the data pool
}
