module.exports = Logger

function Logger(name, opts) {

  if (!(this instanceof Logger)) return new Logger(name, opts)

  name = name || ''
  while (name.length < 10) {
    name = name + ' '
  }
  if (name.length > 10) {
      name = name.substring(0, 10)
  }
  console.log("created Logger instance: " + name)

  this.opts = opts || {}
  this.name = name
  this.errorCount = 0
  this.element = this.opts.element
}

Logger.prototype.append = function (msg, severity) {
  msg = severity + ' ' + msg
  msg = '[' + this.name + '] ' + msg
  msg = new Date().toISOString() + ' ' + msg
  this.element ? this.element.append(msg + '<br/>') : console.log(msg)
}

Logger.prototype.debug = function (msg) {
  if (!this.opts.debug) return
  this.append(msg, 'DEBUG')
}

Logger.prototype.info = function (msg) {
  this.append(msg, 'INFO ') // extra space for alignment with ERROR and DEBUG
}

Logger.prototype.error = function (msg) {
  this.errorCount += 1
  msg = msg + ' [errorCount ' + this.errorCount + ']'
  this.append(msg, 'ERROR')
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
