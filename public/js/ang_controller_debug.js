    thx_app.controller('thx_debug_controller', function($scope, $http, config) {
      $scope.page = 0
      $scope.input_per_page = 10
      $scope.more_items = false
      $scope.item_range_start = 0 
      $scope.item_range_end   = 0
      
      $scope.reset_log_search = function () {
        delete $scope.input_log_regex
        delete $scope.input_log_level
        delete $scope.input_action_type
        delete $scope.input_startdate
        delete $scope.input_enddate
        delete $scope.input_username
        delete $scope.input_duration
        delete $scope.fileLogs
        $scope.page = 0
        $scope.input_per_page = 10
        delete $scope.more_items
        delete $scope.item_range_start 
        delete $scope.item_range_end   
      }
      
      $scope.list_fileLogs = function (pageIncrement) {
        pageIncrement = Math.floor(pageIncrement)
        console.log('list_fileLogs pageIncrement=' + pageIncrement)

        $scope.search_params = $scope.search_params || {} // create new if needed
        $scope.input_per_page = $scope.input_per_page || 10


        if (pageIncrement) {
          $scope.page += pageIncrement              // note that we don't allow per_page to be changed when paging
          $scope.search_params.page = $scope.page
        }
        else { // only reread search params from form and reset counts if not paging
          $scope.page = 0
          $scope.per_page = $scope.input_per_page || 10
          $scope.search_params = {
              page                : $scope.page 
            , per_page            : $scope.per_page
            , regex               : $scope.input_log_regex
            , level               : $scope.input_log_level
            , date_start          : $scope.input_startdate
            , date_end            : $scope.input_enddate
            , username            : $scope.input_username
            , duration            : $scope.input_duration
          }
        }
        
        console.log('logs url=' + config.logs_url+ ", $scope.search_params=" +JSON.stringify($scope.search_params) )
        
        showBusy('Fetching fileLogs list...')

        $http.get(config.logs_url, { 
          params: $scope.search_params
        })
        .success(function (fileLogs) {
          console.log( JSON.stringify(fileLogs) )

          if (fileLogs.collection.item_range_start) $scope.item_range_start = fileLogs.collection.item_range_start 
          if (fileLogs.collection.item_range_end)   $scope.item_range_end   = fileLogs.collection.item_range_end   

          if (fileLogs.collection.item_count) {
            $scope.fileLogs = _.map(fileLogs.collection.items, function (fileLog) {
              fileLog.timestamp = (new Date(fileLog.timestamp)).toLocaleString()
              return fileLog
            })
            console.log('found ' + $scope.fileLogs.length + ' rows')
            console.log('Per page ', $scope.per_page, ' rows')
            console.log('page ', $scope.page)
            $scope.more_items = ($scope.fileLogs.length == $scope.per_page)
          } else {
            if ($scope.page > 0) $scope.page--
            $scope.more_items = false
            delete $scope.fileLogs
            //delete $scope.input_per_page
      //delete $scope.page
            //delete $scope.more_items
          }
          hideBusy()
        })
        .error(function () {
          hideBusy()
          $error_dialog.html('An error occurred -- please try again').dialog('open')
        })
      }

    })
