    var thx_app = angular.module('thx_app', ['angularFileUpload'])

    thx_app.factory('config', function () {
      return {
          sub_url         : app.api + '/subscriptionList'
        , pub_url         : app.api + '/publicationList'
        , msg_url         : app.api + '/msg'
        , item_url        : app.api + '/items'
        , single_item_url : app.api + '/item'
        , items_list_url  : app.api + '/items-list'
        , item_detail_url : app.api + '/item'
        , party_url       : app.api + '/party'
        , parties_url     : app.api + '/parties'
        , logs_url        : app.api + '/logs'
        , gdsn_send       : app.api + '/gdsn-send'     // send xml to dp for routing/as2/t_msg
        , gdsn_validate   : app.api + '/gdsn-validate' // apply xsd and business validation rules
        , gdsn_workflow   : app.api + '/gdsn-workflow' // call dp api and generate result messages
      }
    })
