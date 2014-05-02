module.exports = {
  Parallel : Parallel,
  Serial   : Serial,
  Waterfall: Waterfall,
  test     : test
}

// Parallel: executes a collection of functions without waiting for each one to complete
//
// Each function in the collection should accept a data object and a standard err/result callback:
//
//   var fn1 = function (data, function (err, result) { ... })
//   var fn2 = function (data, function (err, result) { ... })
//   var fn3 = function (data, function (err, result) { ... })
//
// An array of such functions should be passed to the constructor:
//
//   var p = new Parallel([fn1, fn2])
//
// Additional functions can be added using the push method, before or during execution:
//
//   p.push(fn3)
//
// Pass the intial data object and a standard err/result callback to the start method:
//
//   p.start({ some_data: '123' }, function (err, result) { ... })
//
// Each function will be called with the same data object. The results will be
// collected into an array (unordered!) which will be passed to the start callback.
//
// Note that it is possible for the component functions to share state if they 
// happen to work by modifying the original data object, independent of their "result".
// However, there is no guarantee as to the order of function execution, so this is 
// probably not so useful unless it is a simple additive change to the object state. 
// For example, each function could add its results to the original data object.
//
function Parallel(fn_array) {
  if (!(this instanceof Parallel)) {
    console.log('Parallel called without new')
    return new Parallel(fn_array)
  }
  this.fn_queue = fn_array
  this.busy = 0
}

Parallel.prototype.push = function (fn) {
  if (!this.fn_queue) this.fn_queue = []
  this.fn_queue.push(fn)
}

Parallel.prototype.start = function (data, cb, results, errors) {
  results = results || [data] // keep original data object, final array length will be 1 greater than number of functions
  errors = errors || []
  var fn = this.fn_queue.shift()
  if (!fn) {
    if (this.busy) return 
    if (errors.length) return cb(errors, results) // there were some errors, but also maybe some results
    return cb(null, results)
  }
  this.busy++
  var self = this
  fn(data, function (err, result) {
    self.busy--
    if (err) errors.push(err)
    if (result) results.push(result)
    console.log('Parallel interim errors array.length: ' + errors.length)
    console.log('Parallel interim results array: ' + JSON.stringify(results))
    self.start(data, cb, results, errors) // pass each function the same starting data and accumulate the results
  })
  this.start(data, cb, results, errors) // pass each function the same starting data and accumulate the results
}

// Waterfall: executes a series of functions where the output of each is passed to the next
//
// Each function in the series should accept a data object and a standard err/result callback:
//
//   var fn1 = function (data, function (err, result) { ... })
//   var fn2 = function (data, function (err, result) { ... })
//   var fn3 = function (data, function (err, result) { ... })
//
// An array of such functions should be passed to the constructor:
//
//   var w = new Waterfall([fn1, fn2])
//
// Additional functions can be added using the push method, before or during execution:
//
//   w.push(fn3)
//
// Pass the intial data object and a standard err/result callback to the start method:
//
//   w.start({ some_data: '123' }, function (err, result) { ... })
//
function Waterfall(fn_array) {
  if (!(this instanceof Waterfall)) {
    console.log('Waterfall called without new')
    return new Waterfall(fn_array)
  }
  this.fn_queue = fn_array
}

Waterfall.prototype.push = function (fn) {
  if (!this.fn_queue) this.fn_queue = []
  this.fn_queue.push(fn)
}

Waterfall.prototype.start= function (data, cb) {
  var self = this
  var fn = this.fn_queue.shift()
  if (!fn) return cb(null, data)
  fn(data, function (err, result) {
    if (err) return cb(err)
    self.start(result, cb) // pass each function the results of the previous
  })
}

// Serial: executes a series of functions passing the same data object to each
//
// Each function in the series should accept a data object and a standard err/result callback:
//
//   var fn1 = function (data, function (err, result) { ... })
//   var fn2 = function (data, function (err, result) { ... })
//   var fn3 = function (data, function (err, result) { ... })
//
// An array of such functions should be passed to the constructor:
//
//   var s = new Serial([fn1, fn2])
//
// Additional functions can be added using the push method, before or during execution:
//
//   s.push(fn3)
//
// Pass the intial data object and a standard err/result callback to the start method:
//
//   s.start({ some_data: '123' }, function (err, result) { ... })
//
// Each function will be called with the same data object in series. The results will be
// collected into an ordered array which will be passed to the start callback.
//
// Note that it is possible to achieve waterfall like behavior if the component functions
// happen to work by modifying the original data object, independent of their "result".
//
function Serial(fn_array) {
  if (!(this instanceof Serial)) {
    console.log('Serial called without new')
    return new Serial(fn_array)
  }
  this.fn_queue = fn_array
}

Serial.prototype.push = function (fn) {
  if (!this.fn_queue) this.fn_queue = []
  this.fn_queue.push(fn)
}

Serial.prototype.start = function (data, cb, results) {
  results = results || [data] // keep original data object, final array length will be 1 greater than number of functions
  var self = this
  var fn = this.fn_queue.shift()
  if (!fn) return cb(null, results)
  fn(data, function (err, result) {
    if (err) return cb(err)
    results.push(result)
    console.log('series interim results array: ' + JSON.stringify(results))
    self.start(data, cb, results) // pass each function the same starting data and accumulate the results
  })
}

// 
// 
// 
// This is just a handy method for quick testing
// 
// 
// 
function test(type, callback) {

  if (!callback) callback = function(err, result) {
    var combined = {
      err: err,
      result: result
    }
    console.log('async combined test results: ' + JSON.stringify(combined))
  }

  var getTaskFn = function(name) {
    return function(data, cb) {
      console.log('task ' + name + ': ' + JSON.stringify(data))
      //console.log('task ' + name + ' called, ' + new Error('stack: ').stack)
      setTimeout(function () {
        try {
          if (Math.random() < .1) throw new Error('a random error occurred in ' + name)

          if (!data.task_log) data.task_log = []
          data.task_log.push(name)
          if (!data.task_count) data.task_count = 0
          data.task_count++

          cb(null, { name: name, task_log  : data.task_log.slice(), task_count: data.task_count }) // result is a new object
        }
        catch (e) {
          if (!data.err_log) data.err_log = []
          data.err_log.push(name)
          if (!data.err_count) data.err_count = 0
          data.err_count++

          cb(e)
        }
      }, Math.random() * 5)
    }
  }

  var tasks = [getTaskFn('task1'), getTaskFn('task2'), getTaskFn('task3'), getTaskFn('task4')]

  if (type == 'w') {
    new Waterfall(tasks).start({ name: 'waterfall_start_data' }, callback)
    /* e.g. output:
      {
        "name": "task4",
        "task_log": [
          "task1",
          "task2",
          "task3",
          "task4"
        ],
        "task_count": 4
      }
    */
  }
  else if (type == 's') {
    new Serial(tasks).start({ name: 'serial_start_data' }, callback)
    /* e.g. output:
      [
        {
          "name": "serial_start_data",
          "task_log": [
            "task1",
            "task2",
            "task3",
            "task4"
          ],
          "task_count": 4
        },
        {
          "name": "task1",
          "task_log": [
            "task1"
          ],
          "task_count": 1
        },
        {
          "name": "task2",
          "task_log": [
            "task1",
            "task2"
          ],
          "task_count": 2
        },
        {
          "name": "task3",
          "task_log": [
            "task1",
            "task2",
            "task3"
          ],
          "task_count": 3
        },
        {
          "name": "task4",
          "task_log": [
            "task1",
            "task2",
            "task3",
            "task4"
          ],
          "task_count": 4
        }
      ]
    */
  }
  else { //if (type == 'p') {
    new Parallel(tasks).start({ name: 'parallel_start_data' }, callback)
    /* e.g. output:
      {
        "err": [
          {
            "message": "a random error occurred in task2"
          }
        ],
        "result": [
          {
            "name": "parallel_start_data",
            "err_log": [
              "task2"
            ],
            "err_count": 1,
            "task_log": [
              "task3",
              "task1",
              "task4"
            ],
            "task_count": 3
          },
          {
            "name": "task3",
            "task_log": [
              "task3"
            ],
            "task_count": 1
          },
          {
            "name": "task1",
            "task_log": [
              "task3",
              "task1"
            ],
            "task_count": 2
          },
          {
            "name": "task4",
            "task_log": [
              "task3",
              "task1",
              "task4"
            ],
            "task_count": 3
          }
        ]
      }
    */
  }
}
