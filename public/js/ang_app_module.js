    var thx_app = angular.module('thx_app', ['angularFileUpload'])
    //var thx_app = angular.module('thx_app', ['angularFileUpload','ngGrid'])

    thx_app.factory('thx_util', function () {
      return {
          sub_url         : app.api + '/subscriptionList'
        , pub_url         : app.api + '/publicationList'
        , msg_url         : app.api + '/msg'
        , item_url        : app.api + '/items'
        , items_list_url  : app.api + '/items-list'
        , item_detail_url : app.api + '/item'
        , party_url       : app.api + '/party'
        , parties_url     : app.api + '/parties'
        , logs_url        : app.api + '/logs'
      }
    })

