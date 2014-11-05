    thx_app.controller('thx_pub_controller', function($scope, $http, config) {
      $scope.timestamp = 'n/a'
      $scope.thx_controller_test = 'thx_controller_test_value'

      $scope.showPubDetail = function (pub) {
        log('showPubDetail')
        log(pub)
        $scope.selectedPub = JSON.stringify(pub)
        //$scope.selectedPub = pub
      }

      $scope.getPublications = function (pubGln) {
        //$http.get(config.pub_url, { 
        $http.jsonp('http://plt-gdsn01.itradenetwork.com:8080/gdsn-server/api/getPublicationList' , {
          params: { publisher: pubGln, callback: 'JSON_CALLBACK' }
        })
        .success(function (data) {
          $scope.data = data
          $scope.timestamp = data.timestamp
          $scope.selectedPub = null
        })
        .error(function () {
          log('ajax getPublications failed')
          log(arguments)
          alert('getPublications failed: ' + msg)
        })
      }

      $scope.publish_item = function () {
        var $pub_result = $('#pub_result')
        $pub_result.hide()
        var data = $('#pub_form').serialize()
        log('publishing item with data: ' + data)

        $http.get(app.api + '/publish?' + data, { 
          params: { page: $scope.page }
        })
        .success(function (messages) {
          alert('API Publish operation complete: ' + status)
          log('API Publish operation complete: ' + status)
          $pub_result.append('<div>Result: ' + status + '</div>')
          $pub_result.show()
          hideBusy()
        })
        .error(function () {
          log('ajax publish_item failed')
          log(arguments)
          hideBusy()
          $error_dialog.html('An error occurred -- please try again').dialog('open')
        })
      }

    })
