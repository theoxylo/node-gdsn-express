// why another async library? 
// because I want to decide exactly how it's going to 
// work and learn from doing the implementation
//
// And I want to pass variable starting data (without using bind) for repeated flow execution

module.exports = {
  Waterfall: Waterfall,
  Series   : Series,
  test     : test
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
// Experimenting: use the startImmediate variant of start to call setImmediate with each function.
// This should keep the call stack small and avoid blocking the event loop. I think this would only
// make a difference for synchronous functions that execute their callbacks immediately
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

Waterfall.prototype.startImmediate = function (data, cb) {
  var self = this
  var fn = this.fn_queue.shift()
  if (!fn) return cb(null, data)
  setImmediate(function () {
    fn(data, function (err, result) {
      if (err) return cb(err)
      self.start(result, cb) // pass each function the results of the previous
    })
  })
}

// Series: executes a series of functions passing the same data object to each
//
// Each function in the series should accept a data object and a standard err/result callback:
//
//   var fn1 = function (data, function (err, result) { ... })
//   var fn2 = function (data, function (err, result) { ... })
//   var fn3 = function (data, function (err, result) { ... })
//
// An array of such functions should be passed to the constructor:
//
//   var s = new Series([fn1, fn2])
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
// happen to work by modifying the original data object, regardless of their "result".
//
// Experimenting: use the startImmediate variant of start to call setImmediate with each function.
// This should keep the call stack small and avoid blocking the event loop. I think this would only
// make a difference for synchronous functions that execute their callbacks immediately
//
function Series(fn_array) {
  if (!(this instanceof Series)) {
    console.log('Series called without new')
    return new Series(fn_array)
  }
  this.fn_queue = fn_array
}

Series.prototype.push = function (fn) {
  if (!this.fn_queue) this.fn_queue = []
  this.fn_queue.push(fn)
}

Series.prototype.start = function (data, cb, results) {
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

Series.prototype.startImmediate = function (data, cb, results) {
  results = results || []
  var self = this
  var fn = this.fn_queue.shift()
  if (!fn) return cb(null, results)
  setImmediate(function () {
    fn(data, function (err, result) {
      if (err) return cb(err)
      results.push(result)
      self.start(data, cb, results) // pass each function the same starting data and accumulate the results
    })
  })
}

// 
// 
// 
// This is just a handy method for quick testing
// 
// 
// 
function test(waterfall_flag, callback) {

  if (!callback) callback = function(err, result) {
    if (err) return console.log('async error: ' + JSON.stringify(err))
    console.log('async result: ' + JSON.stringify(result))
  }

  var getTaskFn = function(name) {
    return function(item, cb) {
      console.log('task ' + name + ': ' + JSON.stringify(item))
      //console.log('task ' + name + ' called, ' + new Error('stack: ').stack)
      try {
        if (!item.count) item.count = 1
        else item.count++
        console.log('item count: ' + item.count) // note that original item is modified, impacts series behavior

        cb(null, { name: item.name, count: item.count }) // note that new item is returned, impacts waterfall behavior
        //cb(null, item) // note that original item is returned, impacts waterfall behavior
      }
      catch (e) {
        cb(e)
      }
    }
  }

  var tasks = [getTaskFn('task1'), getTaskFn('task2'), getTaskFn('task3'), getTaskFn('task4')]

  if (waterfall_flag) {
    var waterfall = new Waterfall(tasks)
    waterfall.start({ name: 'waterfall_data' }, callback)
    /* e.g. outputs:
        {
          "name": "waterfall_data",
          "count": 4
        }
    */
  }
  else {
    var series = new Series(tasks)
    series.start({ name: 'series_data' }, callback)
    /* e.g. outputs:
        [
          {
            "name": "series_data",
            "count": 4
          },
          {
            "name": "series_data",
            "count": 1
          },
          {
            "name": "series_data",
            "count": 2
          },
          {
            "name": "series_data",
            "count": 3
          },
          {
            "name": "series_data",
            "count": 4
          }
        ]
    */
  }
}
