




  thx_app.directive('datepicker', function () {
      return {
          require : 'ngModel',
          link : function (scope, element, attrs, ngModelCtrl) {
              $(function(){
                  element.datepicker({
                      //showOn:"both",
                      //changeYear:true,
                      //changeMonth:true,
                      dateFormat:'m/d/yy',
                      //maxDate: new Date(),
                      //yearRange: '2014:2016',
                      onSelect:function (dateText, inst) {
                          ngModelCtrl.$setViewValue(dateText);
                          //scope.$apply();
                      }
                  });
              });
          }
      }
  });

    thx_app.directive('gdsnSubscriptions', function (thx_util) {
      log('directive gdsnSubscriptions')
      return {
        restrict: 'EA'
        , replace: true
        , templateUrl: 'gdsn_sub_list_template.html'
        //, scope: { test_ts: '=timestamp' }
        //, scope: false // default; uses enclosing controller scope
        , scope: true // can read enclosing controller scope, not only set local dir scope (can still set scope.$parent)
        , link: function (scope, element, attrs) {
            log('link')
            log('link attrs')
            log(attrs)

            //scope.$parent.subscriber = element.attr('default-subscriber')

            scope.$parent.subscriber = attrs.defaultSubscriber
            log('scope.subscriber ' + scope.subscriber)
            scope.dir_link_test = 'dir_link_test_value'

            log('scope')
            log(scope)
          }
        , controller: function ($scope) {
            $scope.dir_controller_test = 'dir_controller_test_value'
          }
      }
    })
//  })()
