    gdsn_app.controller('gdsn_sub_controller', function ($scope, $http) {
      $scope.timestamp = 'n/a'
      $scope.gdsn_controller_test = 'gdsn_controller_test_value'

      $scope.selectSubscription = function (sub) {
        log('selectSubscription')
        log(sub)
        $scope.selectedSub = JSON.stringify(sub)
        //$scope.selectedSub = sub
      }

      $scope.resetSubscribedItems = function () {
        console.log('resetSubscribedItems')
        $scope.sub_error = null
        $scope.subscribed_items = null
      }

      $scope.getSubscribedItems = function () {
        console.log('getSubscribedItems')

        var gtin = $('#input_gtin').val()
        if (!gtin) return alert('GTIN is required')

        var provider  = $('#input_provider').val()
        var tm        = $('#input_tm').val()
        var tm_sub    = $('#input_tm_sub').val()
        var transform = $('#input_server_transform').val()
        log('transform param: ' + transform)
        var children  = $('#input_include_children').prop('checked')
        var parents   = $('#input_include_parents').prop('checked')
        var multi     = $('#input_multi_gtin').prop('checked')
        var food     = $('#input_food_only').prop('checked')

        var url = app.api + '/subscribed/' //+ gtin
        log('url: ' + url)

        var form_serialize = $('#sub_form').serialize()
        log('sub form form_serialize: ' + form_serialize)

        showBusy('Fetching subscribed items...')

        $http.get(url, {
          params: { 
              gtin: gtin
            , provider: provider
            , tm: tm
            , tm_sub: tm_sub
            , children: children
            , parents: parents
            , multi: multi
            , transform: transform
            , food: food
          }
        })
        .success(function (data) {
          hideBusy()
          if (data.collection.error) {
            $scope.subscribed_items = null // clear previous results to avoid confusion
            var e = data.collection.error
            $scope.sub_error = 'Error: ' + e.title + ' (' + e.message + ')'
            $error_dialog.html('An error occurred: ' + e.title + ' (' + e.message + ')')
            if (data.collection.links) {
              var links = data.collection.links
            }
            return
          }
          var items = data.collection.items || []
          $scope.sub_msg = 'Item count: ' + items.length
          $scope.sub_error = null

          items = items.map(function (item) {
            if (transform == 'client') item = cs_client.transform(item)
            log('appending item ' + item.gtin)
            return item
          })
          $scope.subscribed_items = items
        })
        .error(function (msg) {
          log('ajax getSubscribedItems failed')
          log(arguments)
          $scope.sub_error = 'Error: ' + msg
          $scope.subscribed_items = null // clear previous results to avoid confusion
          hideBusy()
          $error_dialog.html('An error occurred: ' + msg).dialog('open')
        })
      }
    })
