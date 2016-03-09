	/* global variables and functions for home page */
	var log = function (msg) {
	    if (console && console.log) console.log(msg)
	    else alert(msg)
	  }
	
	app = {
		      version: "1.0"
		      , ts: Date.now()
		      , debug: true
		      , api: '/cs_api/1.0'
		    }
	
	function showBusy(title) {
	  log('busy 2: ' + title)
	  $progress_dialog.dialog('option', 'title', title)
	  $progress_dialog.dialog('open')
	}
	
	function hideBusy() {
	  setTimeout(function () {
	    $progress_dialog.dialog('close')
	  }, 500)
	}
	
	function winPopup(myXml) {
	  var myWindow = this.window.open('','','width=800,height=800');
	  myWindow.document.write("<textarea style='height:100%;width:100%' readonly>" +unescape(myXml)+ "</textarea>");
	  myWindow.focus();
	}


    var $party_accordion = $("#party_accordion")
    $party_accordion.accordion({
        heightStyle: 'content',
        collapsible: true
    })

    var $item_accordion = $("#item_accordion")
    $item_accordion.accordion({
        heightStyle: 'content',
        collapsible: true
    })

    var $pub_accordion = $('#pub_accordion')
    $pub_accordion.accordion({
        heightStyle: 'content',
        collapsible: true
    })

    var $sub_accordion = $('#sub_accordion')
    $sub_accordion.accordion({
        heightStyle: 'content',
        collapsible: true
    })

    var $cic_accordion = $('#cic_accordion')
    $cic_accordion.accordion({
        heightStyle: 'content',
        collapsible: true
    })

    var $debug_accordion = $('#debug_accordion')
    $debug_accordion.accordion({
        heightStyle: 'content',
        collapsible: true
    })

    var $msg_accordion = $('#msg_accordion')
    $msg_accordion.accordion({
        heightStyle: 'content',
        collapsible: true
    })

    var $result_dialog = $('#result_dialog')
    $result_dialog.dialog({
      autoOpen: false
      , title: 'Selected Results'
      , width: 1000
      , modal: true
      , buttons: { OK: function() { $result_dialog.dialog('close') } }
    })
    
    var $error_dialog = $('#error_dialog')
    $error_dialog.dialog({
      autoOpen: false
      , title: 'Error'
      , width: 500
      , modal: true
      , buttons: { OK: function() { $error_dialog.dialog('close') } }
    })
    
    var $progress_dialog = $('#progress_dialog')
    $progress_dialog.dialog({
      autoOpen: false
      , width: 700
      , modal: true
    })

    $('#welcome').load('welcome.html')
    $('#find_not_pub').load('find_not_published.html')

    if (app.debug) {
      $('#debug_tab').append('<div>Timestamp: ' + app.ts + '</div>')
      $('#tabs ul').append('<li><a href="#debug_tab">Debug</a></li>')
      //$('#snoop').load('snoop')
    }

    $('#tabs').tabs() //{ collapsible: true, active: false })

    var tab_names = {
      main  : 0, 
      msg   : 1, 
      party : 2,
      items : 3, 
      pub   : 4, 
      sub   : 5, 
      debug : 6
    }
    $('#tabs').tabs('option', 'active', tab_names['msg']) // activate msg tab at start

    $('#progressbar').progressbar({ value: false })

    if ('undefined' != typeof(createTicker)) { // uncoment ticker.js to enable ticker test
      $('#debug_tab').append('<div>Test ticker<span id="ticker"></span></div>')
      log('ticker setup')
      var ticker = createTicker('ticker')
      ticker.start()
    }    
