    thx_app.controller('thx_item_controller', function($scope, $http, config) {

      $scope.page = 0
      $scope.per_page = 10
      $scope.more_items = true

      $scope.showItemDetail = function (item) {
        log('showItemDetail called for gtin ' + item.gtin)
        $scope.selectedItem = item
        if (item.images && item.images.length) $scope.selectImage(item.images[0])

        $('#three_item_view').empty()
      }

      $scope.redoPreviousItemSearch = function (params) {
        log('redoPreviousItemSearch with params: ' + JSON.stringify(params))
        $scope.executeItemSearch(params)
      }

      $scope.showItemHierarchy = function (item) {
        log('showItemHierarchy start for item ' + item.gtin)

        showBusy('Fetching item details...')

        var params = {
            req_id   : 'hier_' + Date.now() + '_' + item.gtin
          , children : true
        }

        console.log('item.href: ', item.href)

        $http.get(item.href, { params: params }).success(function (data) {
          var items = []
          try {
            items = data.collection.items || []
          }
          catch (e) {console.log(e)}

          console.log('found ' + (items && items.length) + ' items (including children) for item ' + item.gtin)

          if (init_three_view) init_three_view($('#three_item_view'), items)

          $scope.hierarchy_items = items

          hideBusy()

          console.log('showItemHierarchy done')
        })
        .error(function () {
          hideBusy()
          $error_dialog.html('An error occurred -- please try again').dialog('open')
        })
      }

      $scope.selectImage = function (url) {
        //log('selectImage  called with url ' + url)
        $scope.selectedImage = url
      }

      $scope.prettyPrintItem = function (item) {
        log('prettyPrintItem  called for gtin ' + item.gtin)
        $result_dialog.html(prettyPrint(item))
          .dialog( 'option', 'width', window.width)
          //.dialog( 'option', 'width', 2000)
          //.dialog( 'option', 'width', '100%')
          .dialog( 'option', 'position', { my: 'left top', at: 'left top', collision: 'fit' } )
          .dialog('open')
      }

      $scope.reset_search = function () {
        delete $scope.input_item_gtin
        delete $scope.input_item_provider
        delete $scope.input_item_recipient
        delete $scope.input_item_tm
        delete $scope.input_item_tm_sub
        delete $scope.input_item_xml_text
        delete $scope.input_item_msg_id_text
        delete $scope.input_item_unit_descriptor
        delete $scope.input_created_st_date
        delete $scope.input_created_end_date
        delete $scope.input_modified_st_date
        delete $scope.input_modified_end_date
        delete $scope.input_include_total_count
        delete $scope.total_item_count
        delete $scope.items
        delete $scope.page
        delete $scope.more_items
        delete $scope.search_params

        delete $scope.previousSearches
        //delete $scope.input_per_page
      }

      $scope.list_items = function (pageIncrement) {
        pageIncrement = Math.floor(pageIncrement)
        console.log('list_items pageIncrement ' + pageIncrement)

        $scope.search_params = $scope.search_params || {} // create new if needed
        $scope.input_per_page = $scope.input_per_page || 10
        
        if (pageIncrement) {
          $scope.page += pageIncrement              // note that we don't allow per_page to be changed when paging
          $scope.search_params.page = $scope.page
          $scope.search_params.include_total_count = false // don't recount when paging
        }
        else { // only reread search params from form and reset counts if not paging
          $scope.page = 0
          $scope.total_item_count = 0
          $scope.per_page = $scope.input_per_page || 10
          $scope.search_params = {
              page                : $scope.page 
            , per_page            : $scope.per_page
            , include_total_count : $scope.input_include_total_count
            , gtin                : $scope.input_item_gtin
            , provider            : $scope.input_item_provider
            , recipient           : $scope.input_item_recipient
            , tm                  : $scope.input_item_tm
            , tm_sub              : $scope.input_item_tm_sub
            , xml_text            : $scope.input_item_xml_text
            , msg_id_text         : $scope.input_item_msg_id_text
            , unit_type           : $scope.input_item_unit_descriptor
            , created_st_date     : $scope.input_created_st_date
          , created_end_date    : $scope.input_created_end_date
          , modified_st_date    : $scope.input_modified_st_date
          , modified_end_date   : $scope.input_modified_end_date
            , req_ts              : Date.now()
          }
          $scope.previousSearches = $scope.previousSearches || []
          $scope.previousSearches.unshift($scope.search_params)
        }

        $scope.executeItemSearch($scope.search_params)
      }

      $scope.executeItemSearch = function (search_params) {

        console.log('include total count checkbox: ' + $scope.input_include_total_count)
        console.log('page num to request: ' + $scope.page)

        showBusy('Fetching item list...')

        //$http.get(config.items_list_url, {params: $scope.search_params})
        $http.get(config.items_list_url, {params: search_params})
        .success(function (data) {
        console.log( JSON.stringify(data) )
          var items = []
          try {
            items = data.collection.items || []
          }
          catch (e) {console.log(e)}

          if (data.collection.total_item_count) $scope.total_item_count = data.collection.total_item_count
          if (data.collection.item_range_start) $scope.item_range_start = data.collection.item_range_start 
          if (data.collection.item_range_end)   $scope.item_range_end   = data.collection.item_range_end   

          $scope.selectedItem = null

          if (items.length) {
            $scope.items = _.map(items, function (item) {
              item.created_ts        = (new Date(item.created_ts)).toLocaleString()
              item.modified_ts       = (new Date(item.modified_ts)).toLocaleString()
              item.has_extension     = !!(item.tradeItem && item.tradeItem.extension)
              item.has_food_and_bev  = item.has_extension && !!(item.tradeItem.extension.foodAndBeverageTradeItemExtension)
              
              item.has_nutrient_info = item.has_food_and_bev
                && !!(item.tradeItem.extension.foodAndBeverageTradeItemExtension.foodAndBeverageInformation)
                && !!(item.tradeItem.extension.foodAndBeverageTradeItemExtension.foodAndBeverageInformation[0])
                && !!(item.tradeItem.extension.foodAndBeverageTradeItemExtension.foodAndBeverageInformation[0].foodAndBeverageNutrientInformation)

              if (item.has_nutrient_info) {
                item.preparationStates = item.tradeItem.extension.foodAndBeverageTradeItemExtension.foodAndBeverageInformation.map(function (fbi) {
                  if (fbi.foodAndBeverageNutrientInformation) {
                    fbi.foodAndBeverageNutrientInformation.map(function (elem) {
                      return (elem.preparationState && elem.preparationState.length) ? elem.preparationState : ''
                    })
                  }
                  else return []
                })
                item.preparationStates = _.compact(_.flatten(item.preparationStates))
              }
              console.log(item.gtin + ' preparationStates: ' + JSON.stringify(item.preparationStates))

              item.thumbnail = item.images && item.images.length ? item.images[0] : './icon_camera.jpg'

              return item
            })
            console.log('Found ', items.length, ' items')
            console.log('Per page ', $scope.per_page, ' items')

      // doesn't work for last row/page
            $scope.more_items = (items.length == $scope.per_page)
          }
          else {
            if ($scope.page > 0) $scope.page--
            $scope.more_items = false
            delete $scope.total_item_count
            delete $scope.items
          }
          hideBusy()
        })
        .error(function () {
          hideBusy()
          $error_dialog.html('An error occurred -- please try again').dialog('open')
        })
      }

      $scope.post_catalog_items = function () {
        //$http.post('/item', $scope.item_content_post + '\n\n') // cheerio testing
        $http.post(config.item_url, $scope.item_content_post + '\n\n')
        .success(function (data) {
          log('data: ' + data)
          log(data.msg)
          log(JSON.stringify(data))
          alert('XML text uploaded successfully (' + data.msg + ')')
        })
        .error(function () {
          log(arguments)
        })
      }

      $scope.view_catalog_item = function () {
        $('#item_content_view').load(config.item_url + '/' + $scope.input_item_gtin + '?')
      }

    })
