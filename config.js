var config = {
    shut_down_pw          : ''                         // for remote server shutdown
  , http_port             : 8080                       // used internally for dashboard and load balanced traffic
  , http_host             : 'localhost'                // hostname used for http redirects/auth
  //, https_port            : 8443                       // potentially used for public access to dashboard without vpn, TBD
  //, https_host            : 'localhost'                // hostname used for https redirects/auth
  , homeDataPoolGln       : '0000000000000'            // required for data pool workflow
  , debug                 : true                       // additional logging
  , db_url                : 'catalog_services'         // for localhost MongoDb, used by lib/Database.js
  , inbox_dir             : __dirname + '/msg/inbox/'  // watch directory for incoming messages
  , outbox_dir            : __dirname + '/msg/outbox/' // for outgoing messages sent by the data pool
  , routes_dir            : __dirname + '/routes'
  //, key_file              : __dirname + '/dev_key.pem'
  //, cert_file             : __dirname + '/dev_key-cert.pem'
  , gpc_file              : __dirname + '/data/gpc/GS1_Combined_Published_as_at_01062014.xml'
  , per_page_count        : 10
  , base_url              : '/cs_api/1.0'
  , slow_warn_ms          : 800
  , enable_query_req_id   : false
  , dp_post_url           : 'http://localhost:8080/gdsn-server/gdsn.ee'
  , dp_xsd_url            : 'http://localhost:8080/gdsn-server/api/xmlvalidation'
}

var local_config = {}
try {
  //var file = process.env['NODE_LOCAL_CONFIG'] || './config.js.STAGE'
  var file = process.env['NODE_LOCAL_CONFIG'] || '/home/node/local_config.js'
  try {
    local_config = require(file)
    console.log('local_config loaded from file: ' + file)
  }
  catch (err) {
    console.log('local_config NOT loaded from file, err: ' + err)
  }
}
catch (e) {
  console.log('local_config NOT loaded from file \'' + file + '\', error: ' + e)
}

for (var prop in local_config) {
  if (local_config.hasOwnProperty(prop)) config[prop] = local_config[prop]
}

module.exports = config
