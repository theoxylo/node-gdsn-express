thx_app.directive('gdsnSubscriptions', function () {
  log('directive gdsnSubscriptions')
  var api = {
    restrict: 'EA'
    , replace: true
    , templateUrl: '/js/ang_directive_gdsn-sub/template.html'
    , scope: true // can read enclosing controller scope, not only set local dir scope (can still set scope.$parent)
    , link: function (scope, element, attrs) {
        scope.$parent.subscriber = attrs.defaultSubscriber
        log('scope.subscriber ' + scope.subscriber)
        scope.dir_link_test = 'dir_link_test_value'
      }
    , controller: function ($scope, $http) {

      console.log('sub directive controller created')
      $scope.timestamp = 'n/a'
      $scope.thx_controller_test = 'thx_controller_test_value'

      $scope.selectSubscription = function (sub) {
        log('selectSubscription')
        log(sub)
        $scope.selectedSub = JSON.stringify(sub)
        //$scope.selectedSub = sub
      }

      $scope.getCurrentSubscriptions = function () {
        console.log('getCurrentSubscriptions')
        if (/\d{13}/.test($scope.subscriber)) {
          $http.jsonp('http://plt-gdsn01.itradenetwork.com:8080/gdsn-server/api/getSubscriptionList' , {
            params: { subscriber: $scope.subscriber, callback: 'JSON_CALLBACK' }
          })
          .success(function (data) {
            $scope.data = data
            $scope.timestamp = data.timestamp
            $scope.selectedSub = null
          })
          .error(function () {
            log(arguments)
          })
        }
        else {
          alert('Error: invalid gln, should be 13 digits')
        }
      }

      $scope.resetResults = function () {
        console.log('resetResults')
        $scope.data = null
      }

    } // end controller

  } // end api

  return api
})
