<!DOCTYPE HTML>
<html>
<head>
  <meta charset="utf-8">
  <title>post_GDSNServer_message_to_CS-stand_alone_PRODUCTION</title>
  <style>
    div {
      border: 1px solid #aaa;
    }
  </style>
</head>
<body>
<h5><font color="red">PRODUCTION</font></h5>

<!-- jQuery -->
<!-- jQuery -->
<!-- jQuery -->
<div>
  <h2>post_GDSNServer_message_to_CS-stand_alone_PRODUCTION</h2>

  <a id="document_href" class="url" href="./post_GDSNServer_message_to_CS-stand_alone_PRODUCTION.html">this page</a>

    <h4>PRODUCTION</h4>
    <h4>Copy single message from GDSN Server to CS</h4>
    <div>
      Message ID: <input id="msg_id" value=""/></input>
    </div>
    <div id="result"></div>
</div>

<script src="https://ajax.googleapis.com/ajax/libs/jquery/2.1.3/jquery.js"></script>
<script>
  //var base_from_url = 'http://pd-gdsn01:8080/gdsn-server/api/message?id='
  //var base_to_url   = 'http://pd-gdsn03:8080/cs_api/1.0/msg/'
  var base_from_url = 'http://localhost:8080/gdsn-server/api/message?id='
  var base_to_url   = 'http://localhost:8081/cs_api/1.0/msg/'

  $('#msg_id').keydown(function (e) {
    console.log('key: ' + e.which)

    if (e.which != 9 && e.which != 13) return // only act on tab and enter keys

    console.log('change to element ' + this.id + ' at ts:' + Date.now() + ' with new value: ' + this.value)
    var msg_id = this.value
    if (msg_id) {
      var from_url = base_from_url + msg_id
      var to_url   = base_to_url + msg_id
      $('#result').empty()
      .append('<div>Do you want to copy message ' + msg_id + '?</div>')
      .append('<div>FROM: <a href="' + from_url + '" target="_blank">' + from_url + '</a><button id="swap_urls">Swap</button></div>')
      .append('<div>TO:   <a href="' + to_url   + '" target="_blank">' + to_url   + '</a></div>')
      .append('<div>This will perform a get/post on the message XML through your browser.</div>')
      .append('<div><input id="btn_start" type="button" value="Start Copy"></input><div>')

      $('#swap_urls').click(function (e) {
        console.log('#swap_urls clicked at ' + Date.now() + ' with event key ' + e.which)

        if (this == e.target) {
          // swap from/to URLs
          var prev_base_from_url = base_from_url
          base_from_url = base_to_url
          base_to_url = prev_base_from_url 
          
          $('#msg_id').keydown({which: 13}) // simulate enter key to trigger update
        }
      })

      $('#btn_start').click(function () { 
        console.log('start GET at ' + Date.now())
        $.get(from_url, function (data) {
          if (data) {
            if (!data || !data.length) {
              console.log('from message data not found at for msg_id ' + msg_id)
              return $('result').append('<div><error_message>Message with ' + msg_id + ' not found</error_message></div>')
            }
            consol.log('from msg xml: ' + data)
            console.log('start POST at ' + Date.now())
            $.post(to_url, data, function (result) {
              $('result').append('<div>POST result for message: ' + msg_id + ': ' + result + '</div>')
            })
          }
        }, 'jsonp')
      })
    }
  })


</script>

</body>
</html>
