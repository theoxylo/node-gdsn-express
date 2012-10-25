Messages = {
    /*
    Dynamic Messages.

    These are messages that are shown in response to cetain events.
    The text value in the quotes can simply be replaced. Do not change
    the text before the :
    */
    Title_Welcome: "Welcome to GDSN Admin",
    Message_Welcome: "GDSN Admin makes it easier than ever to manage your GDSN server.<br/><br/>Visit the Configuration tab to set up your server. Once you are done, you can start it from the status tab.",

    Status: "Status",
    Welcome: "Welcome",
    Enabled: "Enabled",
    Disabled: "Disabled",

    IncorrectLogin: "Invalid username or password",
    TooManyBadLogins: "Too many bad logins. Try again in 2 minutes.",
    ServerContactErr: "Unable to contact the GDSN backend server",
    LoginMessage: "Logging in, please wait...",
    LoginSlow: "Login is taking longer than expected...",
    LoginDone: "Logged in, fetching data...",
    LoggedinAs: "Username: {0}",
    EnterpriseOwner: "{0} | <a href=\"{1}\">Website</a> | <a href=\"{2}\">Support</a>",
    ProvidedBy: "Provided By <a href=\"{1}\">{0}</a>",
    RAMUsage: "{0}/{1}MB",

    ServerNotRunning: "Server is not running.",
    ServerStarting: "Server is getting ready to start...",
    ServerReady: "Server is online and accepting requests.",
    ServerRestarting: "Server is shutting down and restarting...",
    ServerRestartingShort: "Server is restarting...",
    ServerShutdown: "Server is shutting down...",
    ServerError: "A fault is preventing the server from starting.",
    ServerWaitBackend: "Backend server unavailable, reconnecting...<br/>{0} / {1} attempts...",

    Text_PickColor: "Enter your chosen color as a hex string without the #, e.g. 440000 for a dark red.",
    Text_Uptime: "Uptime: {0} Days, {1} Hours, {2} Minutes",
    Text_OffsetMins: "Your server schedule is being offset by {0} minutes",

    ParamMessage: "Message",
    ParamCommand: "Command",
    ParamExec: "Executable",

    ScheduleRunNow: "Run Now",
    ScheduleDelete: "Delete",

    BackupRunning: "Backing up world...",
    BackupUnavailable: "Unable to start backup - Backups are unavailable.",
    BackupDeleteTitle: "Confirm backup file deletion",
    BackupDeleteWarning: "Are you sure you want to delete this backup?<br/><br/><span class='bold'>You will not be able to restore it once it has been deleted.</span>",
    BackupRestoreTitle: "Confirm backup restoration",
    BackupRestoreText: "Restoring this backup will overwrite any existing world files. Some regions of your previous world may remain if you do not erase the world first.<br/><br/>Do you wish to continue?",
    BackupRestoreRunning: "Restoring world from backup...",
    BackupNameTitle: "Cannot start backup",
    BackupNameMessage: "The name specified is invalid",

    ErrorIncorrectUsage: "Incorrect Usage",
    ErrorIncorrectUsageText: "You are attempting to access the GDSN frontend by opening its HTML file instead of browsing to the GDSN backend.<br/><br/>On a local machine with the default configuration, you can browse to it via <a href='http://localhost:8080'>http://localhost:8080</a> after launching the GDSN executable.",

    ErrorCommunicatingTitle: "Communications Error",
    ErrorCommunicatingText: "GDSN Admin was unable to contact its backend server after several attempts, this could be due to a number of reasons:<ul><li>The server is offline for maintainence</li><li>The GDSN Backend is not responding</li><li>A network issue is preventing your computer contacting the backend server</li></ul>Check your connection to the server then log in again.",
    UserLoggedOutTitle: "Session Logged Out",
    UserLoggedOutMessage: "Your session was ended by the GDSN Backend server. The GDSN Backend may have been restarted.<br/><br/>You will need to log in again to resume your session.<br/><br/>If you are seeing this message immediately upon login, the time at the server or on your local computer may be incorrect.",
    WarningResetSchedule: "Schedule Reset",
    WarningResetScheduleText: "This will remove all of your current scheduled tasks, and replace them with the default values provided by GDSN Admin.<br/><br/><span class='bold'>This operation cannot be reversed and you will lose your existing schedule if you continue.</span>",

    WarningOfflineTitle: "Running in Offline Mode!",
    WarningOfflineMessage: "Offline mode will allow other users to steal your name, evade bans, and possibly take control of your server.",
    
    PluginChangeStateTitle: "Cannot change plugin state",
    PluginChangeStateMessage: "Plugin state could not be changed. The server may be running or the file may be in use.",
    
    RunningTasks: "Running Tasks ({0})",
    Notifications: "Notifications ({0})",
    TipOfTheDay: "Tip of the day",

    Title_iDevice: "Apple {0} Device Detected",
    Message_iDevice: "The GDSN Admin iOS Application makes it easier to use from your {0}<br/><br/>Click to view it in the App Store!<br/><span class='tiny'>You will not be prompted again</span>",

    Title_UnsupportedBrowser: "Browser Unsupported",
    Message_UnsupportedBrowser: "GDSN Admin does not support Internet Explorer 8 or older. Please upgrade to Internet Explorer 9, or use an alternate browser.",

    GroupSettings: "Settings for {0}/{1}",
    GroupDeleteTitle: "Confirm group deletion",
    GroupDeleteMessage: "Are you sure you want to delete the group '{0}'?<br/><br/><span class='bold'>You will not be able to restore it once it has been deleted.</span>",
    
    Title_FeatureUnavailable: "Feature Unavailable",
    Message_FeatureUnavailable: "This feature is unavailable in this version of GDSN Admin, and will be made available in an upcoming release.",

    Title_ExportWarning: "Data Overwrite Warning",
    Message_ExportWarning: "Turning on permissions exporting will <span class='bold'>permenently overwrite</span> any existing permissions data with the information stored in McMyAdmin's permission system.<br/><br/>McMyAdmin will not read any data from your existing permissions configuration. It is <span class='bold'>strongly</span> advised that you take a backup of any permissions data you may have before enabling this feature.<br/><br/>Any changes made to your users and groups that are not made via McMyAdmin (either via McMyAdmins web console, or it's in-game commands) will be lost any time McMyAdmin performs an export.<br/><br/>Are you sure you wish to continue?",

    Title_AccessDenied: "Access Denied",
    Message_AccessDenied: "You do not have permission to perform the requested operation.",

    Title_UserNoModify: "User cannot be modified",
    Message_UserNoModify: "Internal McMyAdmin system users cannot be modified.<br/><br/>This user is used purely for internal operations and cannot be used to log into the panel or use the API.",

    Title_BukkitVersionWarn: "Recommended Build Unavailable",
    Message_BukkitVersionWarn: "<span class='bold'>CraftBukkit does not yet have a recommended build for Minecraft version {0}.</span><br/><br/>It is currently only available for Minecraft version {1}<br/><br/>Installing CraftBukkit at this time will cause you to be using Minecraft version {1}<br/><br/>See <a href='http://www.bukkit.org'>http://www.bukkit.org/</a> for more information on when a new recommended build will be available.<br/><br/>Are you sure you want to install CraftBukkit at this time?",
    
    Title_UpdateAvailable: "An Update is available",
    Title_MCMAUpdate: "McMyAdmin {0} is now available to install.",
    Title_MinecraftUpdate: "Minecraft Server {0} is now available to install.",

    Title_UpdatingMC: "Updating Minecraft Server...",
    Title_UpdatingCB: "Updating CraftBukkit...",
    Title_ErrorUpdate: "Update Failed",
    Message_ErrorUpdate: "The update could not be performed at this time, please try again later.",
    Title_UpdateComplete: "Update Complete!",
    Message_UpdateComplete: "Your server has been updated to the latest version of the Minecraft server.",
    Title_UpdatingMCMA: "Updating McMyAdmin",
    Message_UpdatingMCMA: "McMyAdmin is now updating. The page will reload automatically in 60 seconds.",

    Title_NoPassMatch: "Passwords do not match",
    Message_NoPassMatch: "The two specified passwords do not match. Please re-enter and try again.",

    Title_NoPass: "Invalid Password",
    Message_NoPass: "The password cannot be blank.",

    Title_InvalidUser: "Invalid Username",
    Message_InvalidUser: "The username cannot be blank",

    Title_NoCurrentUser: "Cannot modify this user",
    Message_NoCurrentUser: "You cannot change your own users password via this page. Use the 'Change Password' link at the top instead.",

    Title_PassChanged: "Password has been changed",
    Message_PassChanged: "The new password will take effect the next time the user logs in.",

    Title_IncorrectPassword: "Incorrect Password",
    Message_IncorrectPassword: "The value you specified as the existing password is incorrect. Please try again.",
    
    Title_DeleteUser: "Confirm user deletion",
    Message_DeleteUser: "Are you sure you wish to delete the user '{0}'? If this user is logged in, the change will not take effect until they log out.<br/><br/><span class='bold'>This operation cannot be undone.</span>",
    
    Title_DeleteWorld: "Confirm World Deletion",
    Message_DeleteWorld: "Are you sure you want to delete the current world? It is strongly advised you take a backup of your current world even if you don't think you need it.<br/><br/><span class='bold'>This operation cannot be undone.</span>",
    
    Title_NotSupportedInVersion: "Feature not supported in this version",
    Message_MultiUserPersonal: "Multiple users are not supported in the free version of McMyAdmin. Upgrade to McMyAdmin Professional to be able to add extra users to your panel",
    
    Title_InvalidLicence: "Invalid Licence Key",
    Message_InvalidLicence: "The licence key you entered was not valid. Make sure you have entered the entire key including the email address portion. For example:<br/><br/>dummy@sample.com:PR12-3456-7890-1234-5678<br/><br/>Please check your key and try again.",
    
    Title_LicenceAdded: "Licence Added",
    Message_LicenceAdded: "Your licence key has been added successfully.<br/><br/>Thanks for puchasing McMyAdmin!",
    
    Title_UploadOK: "File Uploaded",
    Message_BackupUploaded: "Your backup was uploaded successfully.",
    
    Title_WidgetCopy: "Paste the following HTML into the page at the point you would like the widget to appear."
};

LocalizedText = {
    /*
    Translatable UI elements.

    Syntax: "original text" : "translated text",
    E.g. "Preferences" : "Préférences",

    Don't forget the , at the end of the line!
    */
};
