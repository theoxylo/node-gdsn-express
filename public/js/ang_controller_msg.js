    thx_app.controller('thx_msg_controller', function($scope, $http, thx_util) {
      $scope.input_per_page_default = 20
      
      $scope.page = 0
      $scope.input_per_page = $scope.input_per_page_default
      $scope.more_items = false
      $scope.total_item_count = 0
      $scope.item_range_start = 0 
      $scope.item_range_end   = 0
/*
      $scope.gridColumns = [
	     {field:'instance_id',  displayName:'Instance Id'}, 
	   	 {field:'type',         displayName:'Type'},
	   	 {field:'source_dp',    displayName:'SourceDP'},
	   	 {field:'recipient',    displayName:'Recipient'},
	   	 {field:'sender',       displayName:'Sender'},
	   	 {field:'receiver',     displayName:'Receiver'},
	   	 {field:'item_count',   displayName:'Item Cnt'},
	   	 {field:'created_ts',   displayName:'Created'},
	   	 {field:'modified_ts',  displayName:'Modified'},
	  ];
		$scope.gridOptions = { 
		  data: 'myData', 
		  columnDefs: 'gridColumns',
		  cellTemplate:'<div class="ngCellText" ng-class="col.colIndex()"><a ng-click="loadById(row)">{{row.getProperty(col.field)}}</a></div>' 
		}
		$scope.loadById = function(row) {  
			   console.log(row.instance_id)
		};
*/
      $scope.reset_search = function () {
    	  delete $scope.input_msg_id
    	  delete $scope.input_req_msg_id
          delete $scope.input_msg_type
          delete $scope.input_msg_type_regex
          
          delete $scope.input_source_dp
          delete $scope.input_recipient
          delete $scope.input_sender
          delete $scope.input_receiver

          delete $scope.input_created_st_date
          delete $scope.input_created_end_date
          delete $scope.input_modified_st_date
          delete $scope.input_modified_end_date
          delete $scope.input_xml_regex
          delete $scope.input_exc_regex
          delete $scope.input_include_total_count
          
          delete $scope.messages
          delete $scope.total_item_count
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
          $scope.total_item_count = 0
          $scope.per_page = $scope.input_per_page || $scope.input_per_page_default
        }
        log('list_messages called with page increment ' + pageIncrement)

        showBusy('Fetching message list...')
        $http.get(thx_util.msg_url, { 
          params: { 
            msg_id:              $scope.input_msg_id,
            req_msg_id:          $scope.input_req_msg_id,
            msg_type:            $scope.input_msg_type,
            msg_type_regex:      $scope.input_msg_type_regex,
            
            source_dp:           $scope.input_source_dp,
            recipient:           $scope.input_recipient,
            sender:              $scope.input_sender,
            receiver:            $scope.input_receiver,
            
            created_st_date:     $scope.input_created_st_date,
            created_end_date:    $scope.input_created_end_date,
            modified_st_date:    $scope.input_modified_st_date,
            modified_end_date:   $scope.input_modified_end_date,
            xml_regex:           $scope.input_xml_regex,
            exc_regex:           $scope.input_exc_regex,
            
            page:                $scope.page,
            per_page:            $scope.input_per_page,
            include_total_count: $scope.input_include_total_count
          }
        })
        .success(function (messages) {
          
          if (messages.collection.item_count) {
            $scope.messages = _.map(messages.collection.items, function (msg) {
              msg.created_ts2 = (new Date(msg.created_ts)).toLocaleString()
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

//          $scope.myData = messages.collection.items
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

/*
      $scope.showDocMessageDetail = function (msg) {
        log('showDocMessageDetail called for msg ' + msg._id)

        $http.get(thx_util.msg_url, { 
          params: { 
            _id:              msg._id,
          }
        })
        .success(function (messages) {
          
          if (messages.collection.item_count) {
            $scope.messages = _.map(messages.collection.items, function (msg) {
              msg.created_ts2 = (new Date(msg.created_ts)).toLocaleString()
              msg.modified_ts2 = (new Date(msg.modified_ts)).toLocaleString()
              return msg
            })
            $scope.more_items = (messages.collection.item_count == messages.collection.per_page)
          } else {
              alert("None found")
          }
        
        })
        .error(function () {
          $error_dialog.html('An error occurred -- please try again').dialog('open')
        })
	  }
*/

      $scope.list_msg = function () {
        $('#message_list').load(thx_util.msg_url)
      }

      $scope.view_msg = function () {
        $('#msg_content_view').load(thx_util.msg_url + '/' + $scope.view_msg_id)
      }

      $scope.post_msg = function () {
        $http.post(thx_util.msg_url, $scope.msg_content_post + '\n\n')
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

          $http.get(thx_util.msg_url + '/' + msg.msg_id, { 
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