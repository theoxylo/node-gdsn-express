module.exports = {
    //http_port       : 8080           // listen port for *Public* UI and service API
    https_port      : 8443           // listen port for *Private* UI and service API
  , homeDataPoolGln : '0000000000000'// required for data pool workflow
  , debug           : true           // additional logging
  , db_url          : 'gdsn'         // for localhost MongoDb, used by lib/Database.js
  , inbox_dir       : __dirname + '/msg/inbox'  // watch directory for incoming messages
  , outbox_dir      : __dirname + '/msg/outbox' // for outgoing messages sent by the data pool
  , key_file        : __dirname + '/key.pem'
  , cert_file       : __dirname + '/key-cert.pem'
  , per_page_count  : 10
  , base_url        : '/cs_api/1.0'
}
