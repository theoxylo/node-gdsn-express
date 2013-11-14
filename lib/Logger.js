module.exports = Logger

function Logger(name, opts) {
  if (!(this instanceof Logger)) return new Logger(name, opts)

  console.log("created Logger instance: " + name)

  this.opts = opts || {}
  this.name = name
  this.errorCount = 0
  this.element = this.opts.element
}

Logger.prototype.append = function (msg) {
  if (this.logObject(msg)) return
  msg = new Date().toISOString() + ' ' + msg
  this.element ? this.element.append(msg + '<br/>') : console.log(msg)
}

Logger.prototype.debug = function (msg) {
  if (this.logObject(msg)) return
  msg = msg || ''
  msg = '[' + this.name + '] DEBUG: ' + msg
  this.append(msg)
}

Logger.prototype.info = function (msg) {
  if (this.logObject(msg)) return
  msg = msg || ''
  msg = '[' + this.name + '] INFO : ' + msg // extra space to align output
  this.append(msg)
}

Logger.prototype.error = function (msg) {
  if (this.logObject(msg)) return
  msg = msg || ''
  this.errorCount += 1
  msg = '[' + this.name + '] ERROR ' + this.errorCount + ': ' + msg  
  this.append(msg)
}

// log objects to console only
Logger.prototype.logObject = function (msg) {
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
    console.log('Error logging object: ' + e)
  }
}
