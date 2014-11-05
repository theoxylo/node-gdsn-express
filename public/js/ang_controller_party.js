    thx_app.controller('thx_party_controller', function($scope, $http, config) {

      $scope.page = 0

      $scope.showPartyDetail = function (party) {
        log('showPartyDetail called for gln ' + party.gln)
        if (party && party.json && party.json.registryPartyDataDumpDetail) {
          $result_dialog.html(prettyPrint(party.json.registryPartyDataDumpDetail.registryParty)).dialog('open')
        }
      }

      $scope.page = 0

      $scope.list_parties = function (pageIncrement) {
        if (pageIncrement) {
          $scope.page += pageIncrement
        }
        else {
          $scope.page = 0
        }
        log('list_parties called with page increment ' + pageIncrement)

        showBusy('Fetching party list...')
        $http.get(config.parties_url, { 
          params: { page: $scope.page }
        })
        .success(function (parties) {
          $scope.parties = _.map(parties, function (party) {
            party.created_ts = (new Date(party.created_ts)).toLocaleString()
            party.modified_ts = (new Date(party.modified_ts)).toLocaleString()
            return party
          })
          log('found ' + $scope.parties.length + ' parties')
          hideBusy()
        })
        .error(function () {
          hideBusy()
          $error_dialog.html('An error occurred -- please try again').dialog('open')
        })
      }

      $scope.post_parties = function () {
        $http.post(config.parties_url, $scope.party_content_post + '\n\n')
        .success(function (data) {
          log(data)
          alert('XML uploaded successfully (' + data + ')')
        })
        .error(function () {
          log(arguments)
        })
      }

      $scope.view_party = function () {
        $('#party_content_view').load(config.party_url + '/' + $scope.input_party_gln)
      }

    })
