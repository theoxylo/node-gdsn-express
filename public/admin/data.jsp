<%@ page session="true" %>
<%@ page import="java.util.Date" %>
<%@ page import="java.util.HashMap" %>
<%@ page import="java.util.List" %>
<%@ page import="java.util.Map" %>
<%@ page import="com.itn.gdsn.api.MapWrapper" %>
<%@ page import="java.io.PrintWriter" %>
<%@ page import="com.itn.gdsn.api.GdsnServiceFactory" %>
<%@ page import="com.itn.gdsn.api.GdsnService" %>

<%!   
    void sendJsonResponse(Map results, String jsoncallback, ServletResponse response) throws Exception
    {
        String json = new MapWrapper(results).toJson();

        if (!jsoncallback.isEmpty())
        {
            response.setContentType("application/x-javascript;charset=utf-8");
            json = jsoncallback + "(" + json + ")"; // format for JSONP cross-site scripting
        }
        else
        {
            response.setContentType("application/x-javascript;charset=utf-8");
        }
        
        //testing: json = "{\"debugTest\": \"true\", \"timestamp\":     \"Thu Jun 07 16:15:02 PDT 2012\", \"subscriptions\":     [ { \"created\":             \"2011-04-01 10:15:58.0\", \"gtin\":             \"00008000325000\", \"dsName\":             \"ITN iTradeNetwork Trading Partner\", \"ds\":             \"1100001011292\" } ], \"status\":     \"200\", \"jsoncallback\":     \"\", \"subscriber\":     \"4444444546476\", \"url\":     \"http://hq-d-toneill.itradenetwork.com:8080/gdsn-server/admin/data.jsp?subscriber=4444444546476&req=getSubscriptionList\" }";
        

        response.getWriter().print(json);
        
        try
        {
            Thread.sleep(1000); // delay for browser "loading" time
        }
        catch (Throwable t) { }
    }
%>
<%
    String qs = request.getQueryString();
    qs = qs == null ? "" : qs.trim();
    
    String url = request.getRequestURL() + "?" + qs;
    
    GdsnService gdsn = GdsnServiceFactory.getService();
    
    Map results = new HashMap();
    results.put("status", "200");
    results.put("timestamp", new Date().toString());
    results.put("url", url);
    
        
    String jsoncallback = request.getParameter("callback"); 
    jsoncallback = (jsoncallback == null ? "" : jsoncallback.trim());
    results.put("jsoncallback", jsoncallback);
    
    String cmd = request.getPathInfo();
    cmd = cmd == null ? "" : cmd.trim();
    while (cmd.startsWith("/")) cmd = cmd.substring(1);
    
    String req = request.getParameter("req"); 
    req = (req == null ? "" : req.trim());
    if (cmd.isEmpty()) cmd = req;
    
    response.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private, post-check=0, pre-check=0");
    response.setHeader("Pragma", "no-cache");
    response.setHeader("Connection", "close");
    
    if ("getSubscriptionList".equalsIgnoreCase(cmd))
    {
        String subscriber = request.getParameter("subscriber");
        subscriber = subscriber == null ? "" : subscriber.trim();
        
        if (subscriber.isEmpty())
        {
            results.put("error", "getSubscriptionList requires 'subscriber' parameter");
        }
        else
        {
            List<Map<String, String>> subscriptions = gdsn.getSubscriptionsAll(subscriber);
            results.put("subscriber", subscriber);
            results.put("subscriptions", subscriptions);
        }
        
        sendJsonResponse(results, jsoncallback, response);
        return;
    }
%>


