
    thx_app.controller('thx_file_controller', function($scope, $upload, thx_util) {
      $scope.onFileSelect = function($files, url) {
        $scope[url + '_file'] = $files && $files[0]
      }
      $scope.uploadFile = function(url) {
          var file = $scope[url + '_file']
          if (!file) return
          $scope.upload = $upload.upload({
            url: thx_util[url], // 'cs_api/1.0/items',
            //url: 'item', // cheerio
            // method: POST or PUT,
            // headers: {'headerKey': 'headerValue'},
            // withCredentials: true,
            //data: {myObj: $scope.myModelObj},
            file: file,
          })
          .progress(function(evt) {
            log('percent: ' + parseInt(100.0 * evt.loaded / evt.total))
          })
          .success(function(data, status, headers, config) {
            // file is uploaded successfully
            log('ajax upload file succeeded')
            log(data)
            alert('File uploaded successfully (' + data.msg + ')')
          })
          .error(function(msg) {
            log('ajax upload file failed')
            log(arguments)
            $error_dialog.html('An error occurred: ' + msg).dialog('open')
          })
      }
    })
