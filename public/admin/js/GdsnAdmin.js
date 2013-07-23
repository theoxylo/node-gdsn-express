/*
	GDSN Admin Javascript Definitions
*/
APICommands = {
    Login: "login",
    Logout: "logout",

    GetStatus: "getstatus",
    GetVersions: "getversions",
    GetTipOfDay: "gettip",

    GetChat: "getchat",
    SendChat: "sendchat",

    StartServer: "startserver",
    StopServer: "stopserver",
    RestartServer: "restartserver",
    KillServer: "killserver",

    GetFullConfig: "getfullconfig",
    SetConfig: "setconfig",

    GetUsers: "GetMCMAUsers",
    SetUserMask: "SetMCMAUserAuthMask",
    UnsetUserMask: "UnsetMCMAUserAuthMask",
    SetUserSetting: "SetMCMAUserSettingMask",
    UnsetUserSetting: "UnsetMCMAUserSettingMask",
    DeleteUser: "DeleteUser",
    CreateUser: "CreateUser",
    ChangeUserPassword: "ChangeUserPassword",
    ChangePassword: "ChangePassword",
    
    AddLicence: "AddLicence",
    UpdateMCMA: "updatemcma",
    UpdateMC: "updatemc",
    GetUpdateStatus: "getupdatestatus",
    
    GetServerInfo: "GetServerInfo"
};

PermissionFlags = {
    None: 0,
    StopServer: 1, //Also allows kill
    StartServer: 2,
    //RestartServer == 1 + 2
    ConsoleAccess: 4, //Also allows chat, kick, ban, etc
    ModifyUsersAndGroups: 8,
    ModifyMinecraftConfig: 16,
    ModifyFeaturesConfig: 32,
    ModifySettingsConfig: 64,
    ManagePlugins: 128,
    ModifySchedule: 4096,
    UpdateMinecraft: 8192,
    UpdateMcMyAdmin: 16384, //Requires stop + start
    PerformDiagnostics: 32768,
    FileManager: 65536,
    FileUpload: 131072,
    FileModify: 262144,
    FileUploadExecutable: 524288,
    ModifyMcMyAdminUsers: 1048576
};

UpdateEvents = {
    GetStatus: 10,
    GetChat: 20,
    GetRestoreStatus: 40,
    GetVersions: 50
};

Icons = {
    Info: "message_info",
    Warning: "message_warn",
    Question: "message_question"
};

ServerStates = {
    NotRunning: 0,
    Starting: 10,
    ServerReady: 20,
    Restarting: 30,
    ShuttingDown: 40,
    Error: 100
};

ServerStateStrings = {
    0: Messages.ServerNotRunning,
    10: Messages.ServerStarting,
    20: Messages.ServerReady,
    30: Messages.ServerRestarting,
    40: Messages.ServerShutdown,
    100: Messages.ServerError
};

ServerStateIcons = {
    0: "status_stop",
    10: "status_wait",
    20: "status_go",
    30: "status_restart",
    40: "status_wait",
    100: "status_err"
};

Tasks = {
    ServerStarting: 10,
    ServerStopping: 20,
    ServerRestarting: 30,
    Restore: 50,
    Delete: 60,
    Update: 70
};

UserFlags = {
    CannotChangePassword: 4
}

Cookies = {
    DisableAnimation: "DISABLEANIM",
    iDevice: "IDEVICE",
    Theme: "THEME",
    UIColor: "UICOLOR",
    SavedUsername: "SAVEUSER",
    SavedPassword: "SAVEPASS"
};

var UpdateIntervals = new Array();
var RunningTasks = new Array();
var LastTaskID = 0;
var UpdateShown = false;
var Messages;

/*Analytics*/

var _gaq = _gaq || [];
_gaq.push(['_setAccount', 'UA-19277045-11']);
_gaq.push(['_trackPageview']);

//(function () {
    //var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
    //ga.src = ('https:' == document.location.protocol ? 'https://ssl' : 'http://www') + '.google-analytics.com/ga.js';
    //var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
//})();

/*End Analytics*/

function nopFalse() { return false; }

function checkBrowser() {
    var BasicCSS = false;
    var mobile = false;
    var disableAnimations = false;

    var matchiDevice = new RegExp("i[p|P](hone|ad|od)");
    var iDeviceTest = matchiDevice.exec(navigator.userAgent);

    if (iDeviceTest != null) {
        var iDevice = iDeviceTest[0];
        BasicCSS = true;
        mobile = true;
        disableAnimations = true;
        
        if (parseBool(getCookie(Cookies.iDevice)) != true)
        {
            createWarning(Messages.Title_iDevice.format(iDevice), Messages.Message_iDevice.format(iDevice), showAppStore);
        }
    }

    if (navigator.userAgent.match("[a|A]ndroid")) {
        BasicCSS = true;
        mobile = true;
        disableAnimations = true;
    }

    if (navigator.appVersion.indexOf("MSIE") != -1) {
        BasicCSS = true;
        var version = parseFloat(navigator.appVersion.split("MSIE")[1]);
        if (version < 9) {
            createWarning(Messages.Title_UnsupportedBrowser, Messages.Message_UnsupportedBrowser, null);
            //showFatal(Messages.Title_UnsupportedBrowser, Messages.Message_UnsupportedBrowser);
        }
    }

    if (BasicCSS) {
        $("head").append("<link type=\"text/css\" href=\"css/Basic.css\" rel=\"stylesheet\" />");
    }

    if (mobile) {
        $("head").append("<link type=\"text/css\" href=\"css/Mobile.css\" rel=\"stylesheet\" />");
    }

    if (disableAnimations && parseBool(getCookie(Cookies.DisableAnimation)) != true)
    {
        setCookie(Cookies.DisableAnimation, true);
        getAnim();
    }
}

function showAppStore() {
    setCookie(Cookies.iDevice, true);
    window.open("http://itunes.com/app/michaelhohl/mcmymadmin");
}

function parseBool(value) {
    if (value == null) {return false;}

    if (typeof value == "number") {
        return (parseInt(value) > 0);
    }

    switch (value.toString().toLocaleLowerCase()) {
        case "1":
        case "true":
        case "yes":
        case "on":
            return true;
        default:
            return false;
    }
}

String.prototype.format = function () {
    var args = arguments;
    return this.replace(/{(\d+)}/g, function (match, number) {
        return typeof args[number] != 'undefined' ? args[number] : match ;
    });
};

$(function () {
    getLastColor();
    getTheme();

    $.fn.enterPressed = function (callback) {
        this.keypress(function (event) {
            if (event.keyCode == '13') {
                event.preventDefault();
                callback();
            }
        });
    };

    $(".pagehost").text(document.location.host);

    $("#loginwait").parent().hide();
    $("#sidetabs, #loginerror, #modalbg, #tasksarea").hide();
    $("#selPast, #selTime, #selEveryHour, #eventparam").hide();
    $("#tabs, #tabs .tabarea, .subtabcontainer, #userinfo, #passwdchange").hide();

    $(".sidetab").mousedown(tabClick);
    $(".sidetab").click(nopFalse);
    $(".subtab").mousedown(subTabClick);
    $(".subtab").click(nopFalse);
    $(".colorsample").click(changeColor);
    $("#setting_local_theme").change(pickTheme);
    $("#setting_local_notransitions").change(setAnim);
    $("#customcolor").unbind("click").click(pickColor);
    $(".userFlag").change(toggleUserFlag);
    $(".userSetting").change(toggleSettingFlag);

    $("#button_startserver").click(function () {
        performAction(APICommands.StartServer);
        RunningTasks[Tasks.ServerStarting] = createNotice(Messages.ServerStarting);
    });

    $("#button_stopserver").click(function () {
        performAction(APICommands.StopServer);
        RunningTasks[Tasks.ServerStopping] = createNotice(Messages.ServerShutdown);
    });

    $("#button_restartserver").click(function () {
        performAction(APICommands.RestartServer);
        RunningTasks[Tasks.ServerRestarting] = createTask(Messages.ServerRestartingShort);
    });

    $("#chatEntryBox").keypress(function (event) {
        if (event.keyCode == '13') {
            event.preventDefault();

            var message = $(this).val();

            requestData(APICommands.SendChat, { Message: message }, null);

            $(this).val("");

            if (message[0] == "/") {
                addChatEntry("Server", message, true);
            }
        }
    });

    $("#changeUserPassword").click(changeUserPassword);
    $("#changePasswordCancelButton").click(hidePwChange);
    $("#chancePasswordOKButton").click(pwChangeOk);
    $("#newpwd2").enterPressed(pwChangeOk);
    $("#getWidgetCode").click(getWidgetCode);

    ApplyLanguage();
    checkBrowser();
    //getProvider();
    checkSavedLogin();

    if (document.location.protocol == "file:") {
        showFatal(Messages.ErrorIncorrectUsage, Messages.ErrorIncorrectUsageText);
        return;
    }

    $("#loginusername").focus();
});

function checkSavedLogin() {
    var username = getCookie(Cookies.SavedUsername);
    if (username != null) {
        $("#loginusername").val(username);
        $("#loginpassword").val(getCookie(Cookies.SavedPassword));
        $("#rememberLogin").prop("checked", true);
    }
    else {
        $("#loginusername").val('');
        $("#loginpassword").val('');
        $("#rememberLogin").prop("checked", false);
    }
}

function clearTasks() {
    $("#tasksarea .task").remove();
    $("#tasksarea").hide('drop', { direction: 'left' });
    RunningTasks = new Array();
    LastTaskID = 0;
}

function endTask(taskId)
{
    var eId = "#task_" + taskId;

    if ($(eId).length == 1)
    {
        if ($("#tasksarea .task").length == 1)
        {
            $("#tasksarea").hide('drop', { direction: 'left' }, function () {
                $(eId).remove();
                updateNoticeTitles();
            });
        }
        else {
            $(eId).hide('drop', { direction: 'left' }, function() {
                $(eId).remove();
                updateNoticeTitles();
            });
        }
    }
}

function setTaskStatus(taskId, percentage)
{
    var eId = "#task_" + taskId;

    if ($(eId).length == 1)
    {
        $(eId + " .progressbarslider").css("width", percentage + "%");
    }
}

function updateNoticeTitles() {
    setTimeout(function () {
        var notifyCount = $("#tasksarea .task_warn").length;
        if (notifyCount) {
            $("#noticestitle").show();
            $("#noticestitle").text(Messages.Notifications.format(notifyCount));
        } else {
            $("#noticestitle").hide();
        }

        var taskCount = $("#tasksarea .task_activity").length;
        if (taskCount) {
            $("#runtasktitle").show();
            $("#runtasktitle").text(Messages.RunningTasks.format(taskCount));
        } else {
            $("#runtasktitle").hide();
        }
    }, 500);
}

function createNotice(title)
{
    var taskId = LastTaskID;
    var eId = "task_" + LastTaskID;
    var taskElement = "<div class=\"task task_activity\" id=\"" + eId + "\">" + 
        "<img src=\"img/loadspin_tiny.gif\" alt=\"Progress\" class=\"loadspin_tiny inline\"/>" + 
        "<div class=\"noticeline\">" + title + "</div>" +
        "</div>";
        $("#runtasktitle").after(taskElement);

    if ($("#tasksarea").is(":hidden"))
    {
        $("#tasksarea").show('drop', { direction: 'left' });
    }
    else
    {
        $("#tasksarea .task:first").show('drop', { direction: 'left' });
    }

    LastTaskID++;

    updateNoticeTitles();

    return(taskId);
}

function createWarning(title, message, onDismiss, autoDismiss) {
    var taskId = LastTaskID;
    var eId = "task_" + LastTaskID;
    //var taskElement = "<div class=\"task task_warn\" id=\"{0}\" onclick=\"endTask({1});\"><div class='title'>{2}</div><div>{3}</div></div>".format(eId, taskId, title, message);

    var taskElement = $("<div class=\"task task_warn\" id=\"{0}\"><div class='title'>{1}</div><div>{2}</div></div>".format(eId, title, message));

    taskElement.click(function () {
        endTask(taskId);
        if (onDismiss != null) {
            onDismiss(); }
    });

    if (autoDismiss > 0) {
        setTimeout(function () {
            taskElement.click();
        }, autoDismiss);
    }

    $("#noticestitle").after(taskElement);

    if ($("#tasksarea").is(":hidden")) {
        $("#tasksarea").show('drop', { direction: 'left' });
    }
    else {
        $("#tasksarea .task:first").show('drop', { direction: 'left' });
    }

    LastTaskID++;

    updateNoticeTitles();

    return (taskId);
}

function createTask(title)
{
    var taskId = LastTaskID;
    var eId = "task_" + LastTaskID;
    var taskElement = "<div class=\"task task_activity\" id=\"" + eId + "\">" + 
        "<h5 class=\"notopmargin\">" + title + "</h5>" +
        "<img src=\"img/loadspin_tiny.gif\" alt=\"Progress\" class=\"loadspin_tiny\"/>" + 
        "<div class=\"progressbar\">" + 
            "<div class=\"progressbarslider\"></div>" +
        "</div></div>";
    
    $("#runtasktitle").after(taskElement);

    if ($("#tasksarea").is(":hidden"))
    {
        $("#tasksarea").show('drop', { direction: 'left' });
    }
    else
    {
        $("#tasksarea .task:first").show('drop', { direction: 'left' });
    }

    LastTaskID++;

    updateNoticeTitles();

    return(taskId);
}

function logDebug(message) {
    if ($("#debugMsgs").children("div").size() > 12) {
        $("#debugMsgs").children("div").last().remove();
    }

    $("#debugMsgs").prepend("<div class=\"debugEntry\">{0}</div>".format(message));
}

function showFatal(title, text)
{
    $.fx.off = true;
    $("#modalbg").removeClass("modalnormal").addClass("modalfatal");
    showModal(title, text, "message_error", null, null);
}

function getWidgetCode() {
    var widgetCode = "<script type=\"text/javascript\" src=\"{0}//{1}/js/widget.js\"></script>".format(document.location.protocol, document.location.host);
    prompt(Messages.Title_WidgetCopy, widgetCode);
}

function showModal(title, text, iconClass, okButton, cancelButton)
{
    $("#modaltitle").text(title);
    $("#modalmessage").html(text);
    $("#message_icon").attr("class", iconClass);

    if (okButton == null && cancelButton == null)
    {
        $("#modalbuttons").hide();
    }
    else
    {
        $("#modalbuttons").show();
    }

    $("#modalok").unbind("click");
    $("#modalcancel").unbind("click");

    if (okButton == null)
    {
        $("#modalok").hide();
        $("#modalok").click(nopFalse);
    }
    else
    {
        $("#modalok").show();
        $("#modalok").click(okButton);
    }

    if (cancelButton == null)
    {
        $("#modalcancel").hide();
        $("#modalcancel").click(nopFalse);
    }
    else
    {
        $("#modalcancel").show();
        $("#modalcancel").click(cancelButton);
    }

    $("#modalbg").fadeIn();
}

function featureUnavailable() {
    showModal(Messages.Title_FeatureUnavailable, Messages.Message_FeatureUnavailable, Icons.Info, hideModal, null);
}

function hideModal()
{
    $("#modalbg").fadeOut();
}

function ApplyLanguage() {
    $("div, span, p, h1, h2, h3, h4, h5, a, td, option, label").each(function (index) {
        var message = $(this).text();

        if (LocalizedText[message]) {
            if ($(this).children().length == 0) {
                $(this).html(LocalizedText[message]);
            }
        }
    });

    $("input").each(function () {
        var message = $(this).val();

        if (LocalizedText[message]) {
            $(this).val(LocalizedText[message]);
        }
    });
}

function EnableTranslateMode() {
    $("div, span, p, h1, h2, h3, h4, h5, a, td, label").mousedown(function (event) {
        if (event.which == 3 && $(this).children().length == 0) {
            var oldText = $(this).text();
            var newText = prompt("Enter replacement text for '{0}'".format(oldText), oldText);
            if (newText != null && newText != oldText) {
                LocalizedText[oldText] = newText;
                $(this).text(newText);
                ApplyLanguage();
            }
        }
    });

    $("input").mousedown(function (event) {
        if (event.which == 3 && $(this).children().length == 0) {
            var oldText = $(this).val();
            var newText = prompt("Enter replacement text for '{0}'".format(oldText), oldText);
            if (newText != null && newText != oldText) {
                LocalizedText[oldText] = newText;
                $(this).val(newText);
                ApplyLanguage();
            }
        }
    });

    alert("Right click on text to replace its value. Text that is dynamically created from values must be edited in the language file directly.");
}

function getLastColor()
{
    var color = getCookie(Cookies.UIColor);
    if (color != null)
    {
        $("body").css('background-color', color);
    }
}

function getTheme() {
    var theme = getCookie(Cookies.Theme);

    $("#setting_local_theme").val(theme);

    switch(theme) {
        case "ALTERNATE":
            $("#styleSheet").attr("href", "css/GdsnAdmin_Alternate.css");
            break;
        default:
            $("#styleSheet").attr("href", "css/GdsnAdmin.css");
    }
}

function getAnim() {
    var noanim = getCookie(Cookies.DisableAnimation);
    if (parseBool(noanim) == true) 
    {
        $.fx.off = true;
    }
    else {
        $.fx.off = false;
    }
}

function setAnim() {
    var animValue = parseBool($("$setting_local_notransitions"));
    setCookie(Cookies.DisableAnimation, animValue);
}

function changeColor()
{
    var newColor = $(this).css('background-color');
    $("body").animate({ backgroundColor: newColor }, 2000);
    setCookie(Cookies.UIColor, newColor);
}

function pickTheme() {
    var useTheme = $("#setting_local_theme").val();

    setCookie(Cookies.Theme, useTheme);

    if (useTheme == "ALTERNATE") {
        setCookie(Cookies.UIColor, "#C4C2B8");
    }
    else {
        setCookie(Cookies.UIColor, "#3F647F");
    }

    getTheme();
    getLastColor();
}

function pickColor() {
    var newColor = prompt(Messages.Text_PickColor);
    if (newColor != null && newColor != "") {
        $("body").animate({ backgroundColor: "#" + newColor }, 2000);
        setCookie(Cookies.UIColor, "#" + newColor);
    }
}

function subTabClick() {
    $(this).parent().children(".picked").removeClass("picked");
    $(this).addClass("picked");

    var nextTab = $(this).attr('href');
    $(this).parent().siblings(".subtabcontainer").hide();
    $(nextTab).show();

    return false;
}

function tabClick() {
    $(this).parent().children(".picked").removeClass("picked");
    $(this).addClass("picked");

    var nexttab = $(this).attr('href');
    var visibletab = "#" + $("#tabs .tabarea:visible:first").attr('id');

    if (visibletab != nexttab)
    {
        $("#tabs .tabarea:visible").hide('drop', { direction: 'right' }, 375, function () {
            $(nexttab).fadeIn(375);
        });
    }

    swapText("#bgtext", $(this).text(), false);

    return (false);
}

function uiReady() 
{
    swapText("#LoginMessage", Messages.LoginDone, true, true);

    hideSvButtons();
    
    getVersions();

    //startUpdates(); // interval-based repeating updates
    getStatus(); // just call once for now

    $("#newuserpass").val("");
    $("#newuserpass_confirm").val("");

    setTimeout(function () {
        setupAuthMask();
        $("#loginwait").parent().hide('drop', { direction: direction }, function () {
            $("#loggedinas").text(Messages.LoggedinAs.format($("#loginusername").val()));
            $("#userinfo").fadeIn();
            $("#tabs .tabarea:first, #tab_config_gamesettings, #tab_about_info").show();
            $("#sidetabs").show('drop', { direction: 'left' });
            $("#welcomescreen").fadeOut(function () { $("#tabs").fadeIn(); });
            swapText("#bgtext", Messages.Status, false);
            createWarning("Welcome to GDSN Admin", "We hope you enjoy the new GDSN Admin UI!", null, 10000);
            getTip();
        });
    }, 2000);

}

function getTip() {
    requestData(APICommands.GetTipOfDay, {}, function (data) {
        if (data) {
            createWarning(Messages.TipOfTheDay, data.tip, null, 5000);
        }
    });
}

var DataSource = "data.json";

function performAction(requestType) {
    requestData(requestType, {}, $.noop);
}

var PendingRequests = 0;

function requestData(requestType, data, callback, url) 
{
    data = (data) ? data : new Array();
    callback = (callback) ? callback : $.noop;
    
    //if (url) alert("URL: " + url);
    url = (url) ? url : DataSource;

    data["req"] = requestType;

    logDebug("Outgoing request: " + requestType);
    
    PendingRequests++;

    $("#queueSize").text(PendingRequests);

    Username = $("#loginusername").val();
    Password = $("#loginpassword").val();
    
    $.ajax({
        url: url,
        data: data,
        dataType: 'json',
        timeout: RequestTimeout,
        beforeSend: function(xhr) { 
            xhr.setRequestHeader("Authorization", "Basic " + base64.encode(Username + ":" + Password)); 
        },
        success: function (response) {
            PendingRequests--;
            $("#queueSize").text(PendingRequests);
            logDebug("Completed request: " + requestType);
            if (response.status == 403) {
                showModal(Messages.Title_AccessDenied, Messages.Message_AccessDenied, Icons.Warning, hideModal, null);
            }
            callback(response);
        },
        error: function (jqXHR, textStatus, errorThrown) 
        {
            alert("Ajax error: " + textStatus);

            if (parseInt(jqXHR.status) == 401) {
                stopUpdates();
                showModal(Messages.UserLoggedOutTitle, Messages.UserLoggedOutMessage, Icons.Warning, function () {
                    hideModal();
                    doLogout();
                }, null);
            }
            PendingRequests--;
            logDebug("Timed out request: " + requestType);
            $("#queueSize").text(PendingRequests);
            callback(null);
        }
    });
}

var userPermissions = 0;
var userFlags = 0;

function loginCallback(data) {
    if (data) {
        if (parseInt(data.status) == 429) {
            hideLoginWaiting(false, Messages.TooManyBadLogins);
            userPermissions = 0;
            userFlags = 0;
        }
        else {
            if (data.success == true) {
                userPermissions = data.authmask;
                userFlags = data.usermask;
            }
            hideLoginWaiting(data.success, Messages.IncorrectLogin);
        }
    }
    else
    {
        hideLoginWaiting(false, Messages.ServerContactErr);
        userPermissions = 0;
        userFlags = 0;
    }
}

function setupAuthMask() {
    for (var i = 1; i < 2097152; i *= 2) {
        var flag = (userPermissions & i);
        var objClassShow = ".auth_{0}:not(.tabarea, .subtabcontainer, #tab_status.button)".format(i);
        var objClassHide = ".auth_{0}".format(i);

        if (flag == 0) {
            $(objClassHide).hide();
        } else {
            $(objClassShow).show();   
        }
    }

    if (userFlags & UserFlags.CannotChangePassword) {
        $("#changePasswordArea").hide();
    } else {
        $("#changePasswordArea").show();
    }
}

function showLoginWaiting(callback) {
    $("#loginscreen").parent().hide('drop', { direction: 'right' }, function () {
        $("#loginwait").parent().show('drop', { direction: 'left' }, callback);
    });
}

function hideLoginWaiting(done, message) {
    direction = (done) ? 'right' : 'left';

    if (done) 
    {
        uiReady(); 
    }
    else
    {
        $("#loginwait").parent().hide('drop', { direction: direction }, function () {
            if (message) {
                $("#loginerror").html(message);
                $("#loginerror").show();
            }
            else {
                $("#loginerror").hide();
            }

            $("#loginscreen").parent().show('drop', { direction: 'right' });
        });
    }
}

function loginSlow() {
    swapText("#LoginMessage", Messages.LoginSlow, true, true);
}

function swapText(element, text, useParent, swipe) {
    var moveElement = (useParent == true) ? $(element).parent() : $(element);

    if ($(element).text() == text) { return; }

    if (swipe) {
        moveElement.hide('drop', { direction: 'down' }, function () {
            $(element).text(text);
            moveElement.show('drop', { direction: 'up' });
        });
        return;
    }

    moveElement.fadeOut(function () {
        $(element).text(text);
        moveElement.fadeIn();
    });
}

function doLogout() {
    stopUpdates();
    clearTasks();
    hidePwChange();
    
    performAction(APICommands.Logout);

    $("#loginusername").val("");
    $("#loginpassword").val("");
    $("#rememberLogin").prop("checked", false);
    $("#userinfo").fadeOut();
    $("#tabs .tabarea").hide();
    $("#sidetabs").hide('drop', { direction: 'left' });
    $("#tabs").fadeOut(function () {
        $("#welcomescreen").fadeIn();
        $("#loginscreen").parent().show('drop', { direction: 'right' });
    });
    $(".reg_versioninfo, .reg_owner").text("");
    swapText("#bgtext", Messages.Welcome, false);

    //setCookie("JSESSIONID", "-1");
}

function doLogin() 
{
    Username = $("#loginusername").val();
    Password = $("#loginpassword").val();

    if ($("#rememberLogin").is(":checked")) {
        setCookie(Cookies.SavedUsername, Username);
        setCookie(Cookies.SavedPassword, Password);
    } else {
        setCookie(Cookies.SavedUsername, "");
        setCookie(Cookies.SavedPassword, "");
    }

    $("#LoginMessage").text(Messages.LoginMessage);

    //if (!confirm("Log in with username '" + Username + "'?")) return;

    showLoginWaiting(function () {
        setTimeout(loginSlow, 5000);
        requestData(APICommands.Login, { Username: Username, Password: Password }, loginCallback);
    });
    return false;
}

function getSubscriptions()
{
    var sub = $("#subscriber").val();

    alert("Getting subscriptions for subscriber GLN " + sub);
    /*
    requestData(APICommands.GetTipOfDay, {}, function (data)
    {
        alert("data: " + data);
    });
    */
    requestData("getSubscriptionList", {subscriber: sub}, function (data)
    {
        if (data) 
        {
            var subs = data.subscriptions;

            var display = $("#sub_list");
            display.empty();
            for (var i in subs) 
            {
                var line = subs[i];
                //display.append("<div>" + line.dsName + " (GLN " + line.ds + ")</div>");
                //var newEntry = $("<div class='vlistitem'>{0}</div>".format(line.dsName + " (GLN " + line.ds + ")"));
                var newEntry = $("<div class='subarea'>{0}</div>".format(line.dsName + " (GLN " + line.ds + ")"));
                display.append(newEntry);
            }
        }
    }, "data.jsp");
}

function startUpdates() {
    UpdateIntervals[UpdateEvents.GetStatus] = setInterval(getStatus, StatusUpdateInterval);
    UpdateIntervals[UpdateEvents.GetChat] = setInterval(getChat, StatusUpdateInterval);
    UpdateIntervals[UpdateEvents.GetVersions] = setInterval(getVersions, VersionUpdateInterval);
}

function stopUpdates() {
    clearInterval(UpdateIntervals[UpdateEvents.GetStatus]);
    clearInterval(UpdateIntervals[UpdateEvents.GetChat]);
    clearInterval(UpdateIntervals[UpdateEvents.GetVersions]);
}

function addChatEntry(name, message, isChat)
{
    var newLine = $("<div class=\"chatEntry\"></div>");
    var chatBody = $("<div class=\"chatBody\"></div>");
    chatBody.append($("<div class=\"chatTimestamp\"></div>").text(getTimestamp()));
    chatBody.append($("<div class=\"chatNick\"></div>").text(" " + name + ": "));
    chatBody.append($("<div class=\"chatMessage\"></div>").text(message));

    newLine.append(chatBody);
    newLine.children("div.chatTimestamp:first").text(getTimestamp());
    newLine.children("div.chatNick:first").text();
    newLine.children("div.chatMessage:first").text(message);

    if ($("#chatHistory").children("div").size() > 200) {
        $("#chatHistory").children("div").first().remove();
    }

    $("#chatHistory").append(newLine);

    var hist = document.getElementById("chatHistory");
    hist.scrollTop = hist.scrollHeight;
}

var LastChatTimestamp = -1;

function getChat()
{
    requestData(APICommands.GetChat, {Since: LastChatTimestamp}, function (data)
    {
        if (data) {
            var chatData = data.chatdata;

            for (var i in chatData) {
                var line = chatData[i];

                addChatEntry(line.user, line.message);//, line.isChat);
            }

            LastChatTimestamp = data.timestamp;
        }
    });
}

function getDate() {
    var theDate = new Date();
    var day = theDate.getDate();
    day = (day < 10) ? "0" + day : day;
    var month = theDate.getMonth() + 1;
    month = (month < 10) ? "0" + month : month;
    var date = theDate.getFullYear() + "-" + month + "-" + day + " " + theDate.toLocaleTimeString();
    return (date);
}

function getTimestamp()
{
    var theDate = new Date();
    var date = theDate.toLocaleTimeString();
    return (date);
}

function hideSvButtons() {
    $("#button_startserver").hide();
    $("#button_stopserver").hide();
    $("#button_killserver").hide();
    $("#button_restartserver").hide();
}

function showButtons(status) {
    hideSvButtons();
    switch (status) {
        case ServerStates.Error:
        case ServerStates.NotRunning: 
            $("#button_startserver").show();

            endTask(RunningTasks[Tasks.ServerStopping]);
            endTask(RunningTasks[Tasks.ServerStarting]);

             break;
        case ServerStates.Starting:
            $("#button_stopserver").show(); 
            $("#button_restartserver").show(); 

            setTaskStatus(RunningTasks[Tasks.ServerRestarting], 50);

            break;
        case ServerStates.ServerReady:
            $("#button_stopserver").show(); 
            $("#button_restartserver").show();

            setTaskStatus(RunningTasks[Tasks.ServerRestarting], 100);
            endTask(RunningTasks[Tasks.ServerStarting]);
            endTask(RunningTasks[Tasks.ServerRestarting]);

            break;
        case ServerStates.Restarting:
            $("#button_stopserver").show(); break;
        case ServerStates.ShuttingDown: 
            $("#button_killserver").show(); break;
    }
}

var prevstate = -1;

var statusFails = 0;

var OldPlayers = new Array();

var OnlineUsers;

function getStatus() 
{
    requestData(APICommands.GetStatus, {}, function (data) {
        $("#status_lastupdate").text(getDate());

        if (data == null) {
            $("#status_statetext").html(Messages.ServerWaitBackend.format(statusFails, StatusMaxFails));
            $("#status_icon").attr("class", ServerStateIcons[100]);

            prevstate = -1;
            statusFails++;

            if (statusFails > StatusMaxFails) {
                stopUpdates();
                showModal(Messages.ErrorCommunicatingTitle, Messages.ErrorCommunicatingText, Icons.Warning, function () {
                    doLogout();
                    hideModal();
                }, null);
            }
        }
        else {

            statusFails = 0;
            
            $("#linkList").empty();
            var links = data.links;
            for (var i in links) {
                var link = links[i];
                $("#linkList").append("<div>" + link + "</div>");
            }

            var memUsagePercent = Math.floor((data.ram / data.maxram) * 100);

            $("#status_onlineplayers").text(data.users + " / " + data.maxusers);
            $("#status_servertime").text(data.time);
            $("#status_CPUusage").text(data.cpuusage + "%");
            $("#status_RAMusage").text(memUsagePercent + "%");
            $("#status_ramMB").text(Messages.RAMUsage.format(data.ram,data.maxram));
            $("#status_miniCPUgraph").css("width", data.cpuusage);
            $("#status_miniRAMgraph").css("width", memUsagePercent);

            if (data.state == ServerStates.ServerReady) {
                //$("#status_uptime").text(Messages.Text_Uptime.format(data.uptime.Days, data.uptime.Hours, data.uptime.Minutes));
                $("#status_uptime").text("Server is up");
            }
            else {
                $("#status_uptime").text("");
            }

            var state = (data.failed == true) ? 100 : data.state;

            $("#chatNames").empty();

            OnlineUsers = data.userinfo;

            for (var i in OnlineUsers) {
                var user = OnlineUsers[i];

                $("#chatNames").append("<div class=\"chatName\">" + user.Name + "</div>");
            }

            if (state != prevstate) {
                $("#status_statetext").text(ServerStateStrings[state]);
                $("#status_icon").attr("class", ServerStateIcons[state]);

                showButtons(state);

                prevstate = state;
            }
        }
    });
}

function getProvider() {
    requestData(APICommands.GetServerInfo, {}, function (data) {
        if (data.edition == "Enterprise") {
            $("#provby").html(Messages.ProvidedBy.format(data.provider.Provider, data.provider.Website));
        } 
    });
}

function getVersions() 
{
    if (typeof (UpdateData) !== 'undefined')
    {
        $(".reg_latestversion").text(UpdateData.LatestMCMA);
        $(".ver_latestoffical").text(UpdateData.LatestMinecraft);
        $(".ver_latestbukkit").text(UpdateData.LatestMinecraftBukkitCompat);
        $(".reg_versioninfo").text(UpdateData.versionTag);
    }
}

function addLicence() {
    var key = $("#newKey").val();
    requestData(APICommands.AddLicence, { NewKey: key }, function (data) {
        if (data.newtype == "Personal") {
            showModal(Messages.Title_InvalidLicence, Messages.Message_InvalidLicence, Icons.Info, hideModal, null);
        } else {
            showModal(Messages.Title_LicenceAdded, Messages.Message_LicenceAdded, Icons.Info, hideModal, null);
            $("#licencearea").hide();
        }
    });
}

function showUpdates() {
    $("#tabhead_about").mousedown();
    $("#tabhead_about_updates").mousedown();
}

/////////////////////////////////////
//Cookies
/////////////////////////////////////

function setCookie(key, value) {
    var newDate = new Date();
    newDate.setFullYear(newDate.getFullYear() + 1);
    document.cookie = key + "=" + value.toString() + "; path=/; expires=" + newDate.toGMTString();
}

function getCookie(key) {
	var findName = key + "=";
	var parts = document.cookie.split(';');

	for (var i = 0; i < parts.length; i++) 
    {
		var cookie = parts[i];

		while (cookie.charAt(0)==' ')
        {
            cookie = cookie.substring(1,cookie.length);
        }

		if (cookie.indexOf(findName) == 0) 
        {
            return cookie.substring(findName.length,cookie.length);
        }
	}

	return null;
}

function toggleUserFlag() {
    var newValue = true;
    var flagEl = $(this);
    var flag = parseInt(flagEl.val());
    var requestType = APICommands.UnsetUserMask;

    if (flagEl.is(":checked")) {
        requestType = APICommands.SetUserMask;
        newValue = false;
    }

    requestData(requestType, { User: CurrentUser, Mask: flag }, function (data) {
        if (data.status != 200) {
            flagEl.prop("checked", parseBool(newValue));

            if (data.status == 406) {
                showModal(Messages.Title_UserNoModify, Messages.Message_UserNoModify, Icons.Info, hideModal, null);
            }
        } else {
            UserData[CurrentUser].AuthMask ^= flag;
        }
    });
}

function toggleSettingFlag() {
    var newValue = true;
    var flagEl = $(this);
    var flag = parseInt(flagEl.val());
    var op = APICommands.UnsetUserSetting;

    if (flagEl.is(":checked")) {
        op = APICommands.SetUserSetting;
        newValue = false;
    }

    requestData(op, { User: CurrentUser, Mask: flag }, function (data) {
        if (data.status != 200) {
            flagEl.prop("checked", parseBool(newValue));

            if (data.status == 406) {
                showModal(Messages.Title_UserNoModify, Messages.Message_UserNoModify, Icons.Info, hideModal, null);
            }
        } else {
            UserData[CurrentUser].UserMask ^= flag;
        }
    });
}

function showChangePassword() {
    $("#passwdchange").fadeIn();
}

function hidePwChange() {
    $("#passwdchange").fadeOut(function () {
        $("#oldpwd").val("");
        $("#newpwd").val("");
        $("#newpwd2").val("");
    });
}

function pwChangeOk() {
    var pw1 = $("#newpwd").val();
    var pw2 = $("#newpwd2").val();
    var oldpwd = $("#oldpwd").val();
    
    if (pw1 != pw2) {
        showModal(Messages.Title_NoPassMatch, Messages.Message_NoPassMatch, Icons.Warning, hideModal, null);
    }
    else if (pw1 == "") {
        showModal(Messages.Title_NoPass, Messages.Message_NoPass, Icons.Warning, hideModal, null);
    } 
    else 
    {
        requestData(APICommands.ChangePassword, { OldPassword: oldpwd, NewPassword: pw1 }, function (data) {
            if (data.status == 200) {
                hidePwChange();
                showModal(Messages.Title_PassChanged, Messages.Message_PassChanged, Icons.Info, hideModal, null);
            } else {
                showModal(Messages.Title_IncorrectPassword, Messages.Message_IncorrectPassword, Icons.Info, hideModal, null);
            }
        });
    }
}

function changeUserPassword() {
    var pw1 = $("#newuserpass").val();
    var pw2 = $("#newuserpass_confirm").val();

    if (pw1 != pw2)
    {
        showModal(Messages.Title_NoPassMatch, Messages.Message_NoPassMatch, Icons.Info, hideModal, null);
    }
    else if (pw1 == "")
    {
        showModal(Messages.Title_NoPass, Messages.Message_NoPass, Icons.Info, hideModal, null);
    }
    else
    {
        requestData(APICommands.ChangeUserPassword, { Username: CurrentUser, NewPassword: pw1 }, function (data) {
            if (data.status == 406) {
                showModal(Messages.Title_UserNoModify, Messages.Message_UserNoModify, Icons.Info, hideModal, null);
            }
            else if (data.status == 403) {
                showModal(Messages.Title_NoCurrentUser, Messages.Message_NoPassMatch, Icons.Info, hideModal, null);
            }
            else {
                showModal(Messages.Title_PassChanged, Messages.Message_PassChanged, Icons.Info, hideModal, null);
            }

            $("#newuserpass").val("");
            $("#newuserpass_confirm").val("");
        });
    }
}

