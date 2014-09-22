module.exports = Logger

function Logger(name, config) {

  if (!(this instanceof Logger)) return new Logger(name, config)

  name = name || ''
  while (name.length < 10) {
    name = name + ' '
  }
  if (name.length > 10) {
      name = name.substring(0, 10)
  }
  console.log("created Logger instance: " + name)

  this.config = config || {}
  this.name = name
  this.errorCount = 0
  //this.element = this.config.log_element
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
  var entry = {}
  entry.message = msg
  entry.timestamp = Date.now()
  //entry.level = level;
  entry.username = username
  entry.duration = duration

  try {
    this.config && this.config.database && this.config.database.mdb.logs.save(entry, function (err, result) {
      console.log('Persisted DB message ' + JSON.stringify(entry))
    })
  }
  catch (err) {
    console.log('!!!Error saving object: ' + err)
  }
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
