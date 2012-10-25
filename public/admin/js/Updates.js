var UpdateData = {
    versionTag: "GDSN_20120607",
	LatestMCMA: "2.1.1.4", 
	LatestMinecraft: "1.2.5", 
	LatestMinecraftBukkitCompat: "1.2.5",
	LatestMinecraftBukkitBetaCompat: "1.2.5"};
	
setTimeout(function(){
	$("#welcomescreen").append("<div id='welcomeMsg' style='background-color:white; padding:8px; font-weight:bold; margin-left:auto; margin-right:auto; width:762px; margin-top:32px; box-shadow: 0px 4px 16px rgba(0,0,0,0.4); color:black;'>Welcome to the new and improved GDSN Admin UI, powered by jQuery</div>");
	$("#welcomeMsg").fadeIn();
}, 500);
