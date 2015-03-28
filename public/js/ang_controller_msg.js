    thx_app.controller('thx_msg_controller', function($scope, $http, config) {
      $scope.input_per_page_default = 20
      
      $scope.page = 0
      $scope.input_per_page = $scope.input_per_page_default
      $scope.more_items = false
      $scope.item_range_start = 0 
      $scope.item_range_end   = 0
      $scope.reset_search = function () {
          delete $scope.input_msg_id
          delete $scope.input_req_msg_id
          delete $scope.input_msg_type
          delete $scope.input_msg_type_regex
          
          delete $scope.input_source_dp
          delete $scope.input_recipient
          delete $scope.input_sender
          delete $scope.input_receiver

          delete $scope.input_modified_st_date
          delete $scope.input_modified_end_date
          delete $scope.input_xml_regex
          delete $scope.input_exc_regex
          
          delete $scope.messages
          delete $scope.more_items
          delete $scope.item_range_start 
          delete $scope.item_range_end
          $scope.page = 0
          $scope.input_per_page = $scope.input_per_page_default
      }

      $scope.list_messages = function (pageIncrement) {
        if (pageIncrement) {
          $scope.page += pageIncrement
        }
        else {
          $scope.page = 0
          $scope.per_page = $scope.input_per_page || $scope.input_per_page_default
        }
        log('list_messages called with page increment ' + pageIncrement)

        showBusy('Fetching message list...')
        $http.get(config.msg_url, { 
          params: { 
            msg_id:              $scope.input_msg_id,
            req_msg_id:          $scope.input_req_msg_id,
            msg_type:            $scope.input_msg_type,
            msg_type_regex:      $scope.input_msg_type_regex,
            
            source_dp:           $scope.input_source_dp,
            recipient:           $scope.input_recipient,
            sender:              $scope.input_sender,
            receiver:            $scope.input_receiver,
            
            modified_st_date:    $scope.input_modified_st_date,
            modified_end_date:   $scope.input_modified_end_date,
            xml_regex:           $scope.input_xml_regex,
            exc_regex:           $scope.input_exc_regex,
            
            page:                $scope.page,
            per_page:            $scope.input_per_page
          }
        })
        .success(function (messages) {
          
          if (messages.collection.item_count) {
            $scope.messages = _.map(messages.collection.items, function (msg) {
              msg.modified_ts2 = (new Date(msg.modified_ts)).toLocaleString()
              return msg
            })
            console.log('found ' + $scope.messages.length + ' rows')
            console.log('Per page ', $scope.per_page, ' rows')
            console.log('page ', $scope.page)
            $scope.more_items = (messages.collection.item_count == messages.collection.per_page)
          } else {
              if ($scope.page > 0) $scope.page--
              $scope.more_items = false
              delete $scope.messages
          }
          if (messages.collection.item_range_start) $scope.item_range_start = messages.collection.item_range_start 
          if (messages.collection.item_range_end)   $scope.item_range_end   = messages.collection.item_range_end
          hideBusy()
        })
        .error(function () {
          hideBusy()
          $error_dialog.html('An error occurred -- please try again').dialog('open')
        })
      }

      $scope.showMessageDetail = function (msg) {
        log('showMessageDetail called for msg ' + msg._id)
        $result_dialog.html(prettyPrint(msg)).dialog('open')
      }

      $scope.list_msg = function () {
        $('#message_list').load(config.msg_url)
      }

      $scope.view_msg = function () {
        $('#msg_content_view').load(config.msg_url + '/' + $scope.view_msg_id)
      }

      $scope.post_msg = function (url_name) {
        var url = config.msg_url
        if (url_name && config[url_name]) url = config[url_name]

        $http.post(url, $scope.msg_content_post + '\n\n')
        .success(function (data) {
          log(data)
        })
        .error(function () {
          log(arguments)
        })
      }
      
      $scope.popup = function (msgText) {
          winPopup(msgText)
      }

      $scope.popupField = function (msg, field) {
          console.log( "id=" +JSON.stringify(msg.msg_id) )

          $http.get(config.msg_url + '/' + msg.msg_id, { 
              params: { 
                field:           field
              }
          }).success(function (data) {
              console.log( JSON.stringify(data) );
              winPopup(data)
          })
          .error(function () {
              $error_dialog.html('An error occurred -- please try again').dialog('open')
          })
      }
      
    })
