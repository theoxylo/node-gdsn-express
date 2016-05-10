module.exports = Logger

var cache = {}

function Logger(name, config) {

  this.db_logs = require('./db/logs')(config)

  if (!(this instanceof Logger)) return new Logger(name, config)

  name = name || ''
  while (name.length < 10) {
    name = name + ' '
  }
  if (name.length > 10) {
      name = name.substring(0, 10)
  }

  if (cache[name]) return cache[name]

  this.config = config || {}
  this.name = name
  this.errorCount = 0

  cache[name] = this
  if (config.debug) this.debug('created logger: [' + name + ']')
}

Logger.prototype.append = function (msg, severity) {
  msg = severity + ' ' + msg
  msg = '[' + this.name + '] ' + msg
  msg = new Date().toISOString() + ' ' + msg

  // for logging to html document OR console:
  //this.element ? this.element.append(msg + '<br/>') : console.log(msg)
  if (this.element) this.element.append(msg + '<br/>')
  console.log(msg)
}

Logger.prototype.is_debug = function () {
  return this.config.debug
}

Logger.prototype.debug = function (msg) {
  if (!this.config.debug) return
  this.append(msg, 'DEBUG')
}

Logger.prototype.info = function (msg) {
  this.append(msg, 'INFO ') // extra space for alignment with ERROR and DEBUG
}

Logger.prototype.warn = function (msg) {
  this.append(msg, 'WARN ') // extra space for alignment with ERROR and DEBUG
}

Logger.prototype.error = function (msg) {
  this.errorCount += 1
  msg = msg + ' [errorCount ' + this.errorCount + ']'
  this.append(msg, 'ERROR')
}

Logger.prototype.db = function (msg, username, duration) {
  this.db_logs.saveLogEntry(msg, username, duration, function (err, result) {
    if (err) return console.log('!!!Error logging to db: ' + err)
    console.log('Persisted DB message ' + result)
  })
}

// log live object to console
Logger.prototype.dump = function (msg) {
  if (!msg) {
    console.log(msg) // log [0 | false | null | undefined]
    return true
  }
  if (typeof(msg) === 'string') return false
  if (msg.constructor && msg.constructor === String) return false
  if (msg instanceof String) return false
  if (typeof msg === 'String') return false
  if (typeof msg === 'string') return false
  try {
    console.log(JSON.stringify(msg)) // for objects
    return true
  }
  catch (e) {
    try {
      console.log(msg) // for objects
      return true
    }
    catch (e) {
      console.log('Error logging object: ' + e)
    }
  }
}
