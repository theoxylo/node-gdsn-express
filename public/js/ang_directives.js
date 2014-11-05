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
            ngModelCtrl.$setViewValue(dateText)
            //scope.$apply()
          }
        })
      })
    }
  }
})
