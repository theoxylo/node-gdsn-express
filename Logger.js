module.exports = Logger

function Logger(name, opts) {
  if (!(this instanceof Logger)) return new Logger(name, opts)

  this.opts = opts || {}
  this.name = name
  this.errorCount = 0
  this.element = this.opts.element
}

Logger.prototype.append = function(msg) {
  msg = new Date().toISOString() + ' ' + msg
  this.element ? this.element.append(msg + '<br/>') : console.log(msg)
}

Logger.prototype.debug = function (msg) {
  msg = msg || ''
  msg = '[' + this.name + '] DEBUG: ' + msg
  this.append(msg)
}

Logger.prototype.info = function (msg) {
  msg = msg || ''
  msg = '[' + this.name + '] INFO : ' + msg // extra space to align output
  this.append(msg)
}

Logger.prototype.error = function (msg) {
  msg = msg || ''
  this.errorCount += 1
  msg = '[' + this.name + '] ERROR ' + this.errorCount + ': ' + msg  
  this.append(msg)
}
