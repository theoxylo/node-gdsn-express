    var thx_app = angular.module('thx_app', ['angularFileUpload'])

    thx_app.factory('config', function () {
      return {
          sub_url         : app.api + '/subscriptionList'
        , pub_url         : app.api + '/publicationList'
        , msg_url         : app.api + '/msg'
        , test_url        : app.api + '/test'
        , item_url        : app.api + '/items'
        , single_item_url : app.api + '/item'
        , items_list_url  : app.api + '/items-list'
        , item_detail_url : app.api + '/item'
        , party_url       : app.api + '/party'
        , parties_url     : app.api + '/parties'
        , logs_url        : app.api + '/logs'
        , gdsn_url        : app.api + '/dp-submit'
        , xsd_url         : app.api + '/dp-xsd'
      }
    })

