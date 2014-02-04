/**
* The main module of the 'GNotifier' Add-on.
* Author: Michal Kosciesza <michal@mkiol.net>
* Contributor: Alexander Schlarb <alexander1066@xmine128.tk>
* Contributor: Joe Simpson <headbangerkenny@gmail.com>
* 
* version: 1.7.2
* 
* changelog:
* [1.7.2]
* - osx support (thanks to Joe Simpson)
* [1.7.1]
* - turkish translation
* - fixes few translations
*/

// imports

var data = require('sdk/self').data;
var _ = require('sdk/l10n').get;

var { Cc, Ci, Cu, Cm, Cr } = require('chrome');
Cu.import("resource://gre/modules/ctypes.jsm", this);
Cu.import("resource://gre/modules/FileUtils.jsm");
Cu.import("resource://gre/modules/NetUtil.jsm");
Cu.import('resource://gre/modules/XPCOMUtils.jsm');

Cu.import("resource://gre/modules/Task.jsm");
Cu.import("resource://gre/modules/Downloads.jsm");

var ps = require('sdk/preferences/service');
var sps = require("sdk/simple-prefs").prefs;
var system = require("sdk/system");

// Determine Linux / OSX based on 'system.platform'
if(system.platform == "darwin"){
  var notifApi = require('./osx');
} else {
  var notifApi = require('./linux');
  console.log(require('./linux.js'));
}

// Works only for FF<26
var downloadProgressListener = {
  onDownloadStateChange: function(aState, aDownload) {
    console.log("onDownloadStateChange");	
    var dm = Cc["@mozilla.org/download-manager;1"].getService(Ci.nsIDownloadManager);
    var icon = getIcon();
    switch(aDownload.state) {
    case dm.DOWNLOAD_FINISHED:
      notifyNative(icon, _("download_finished"), aDownload.displayName);
      break;
    case dm.DOWNLOAD_FAILED:
      notifyNative(icon, _("download_finished"), aDownload.displayName);
      break;
    }
  }
}

// Works for FF>=26
function newDownloadProgressListener(download) {
  if(download.succeeded) {
    var icon = getIcon();
    var filename = download.target.path.replace(/^.*[\\\/]/, '');
    notifyNative(icon, _("download_finished"), filename);
  }
}
Task.spawn(function () {
  try {
    let list = yield Downloads.getList(Downloads.ALL);
    let view = {
      onDownloadChanged: download => newDownloadProgressListener(download)
    };
    yield list.addView(view);
  } catch(e) {
    console.log("Unexpected exception",e);
  }
}).then(null, Cu.reportError);

function AlertsService()
{}
AlertsService.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIAlertsService]),

  showAlertNotification: function GNotifier_AlertsService_showAlertNotification(
    imageUrl, title, text, textClickable, cookie, alertListener, name) {
    
    //TODO: Support textClickable (Yes its possible using a button...)
    function GNotifier_AlertsService_showAlertNotification_cb(iconPath) {
      notifyNative(iconPath, title, text, name);
      //TODO: Call the callback once the alert is actually finished...
      if(typeof(alertListener) == "object") {
	alertListener.observe(null, "alertfinished", cookie);
      }
    }

    try {
      // Try using a local icon file URL
      var imageURI = NetUtil.newURI(imageUrl);
      var iconFile = imageURI.QueryInterface(Ci.nsIFileURL).file;

      // Success!
      GNotifier_AlertsService_showAlertNotification_cb(iconFile.path);
      } catch(e) {
	try {
	  // Create temporary local file
	  // (Required since I don't want to manually
	  //  populate a GdkPixbuf...)
	  var iconFile = FileUtils.getFile("TmpD", [".gnotifier.tmp"]);
	  iconFile.createUnique(
	    Ci.nsIFile.NORMAL_FILE_TYPE,
	    FileUtils.PERMS_FILE
	  );
	  var iconStream = FileUtils.openSafeFileOutputStream(iconFile);

	  // Copy data from original icon to local file
	  var imageFile = NetUtil.newChannel(imageUrl);
	  NetUtil.asyncFetch(imageFile, function(imageStream) {
	    NetUtil.asyncCopy(imageStream, iconStream, function() {
	      // Show notification with copied icon file
	      GNotifier_AlertsService_showAlertNotification_cb(iconFile.path);

	      // Close streams
	      iconStream.close();
	      imageStream.close();

	      // Delete icon file
	      iconFile.remove(false);
	    });
	  });
	} catch(e) {
	    GNotifier_AlertsService_showAlertNotification_cb(imageUrl);
	}
      }
    }
};

// Gets icon for notification based on 'system.name' or 'notifyIcon' param
function getIcon() {
  var picon = sps['notifyIcon'];
  if (picon == "default") {
     
    if (system.name == "Iceweasel")
      picon = "iceweasel";
    if (system.name == "Thunderbird")
      picon = "thunderbird";
    if (system.name == "Firefox")
      picon = "firefox";

    // default Firefox icon
    if (picon == "default")
      picon = "firefox";
  }
  return picon;
}

// FF notification
function notifyFF(iconURL, title, text) {
  var notifications = require("sdk/notifications");
  notifications.notify({
    title: title,
    text: text,
    iconURL: iconURL
  });
}

// Native notification
function notifyNative(iconURL, title, text, notifier) {
  var ret = notifApi.notify(iconURL, title, text, notifier);
  if(!ret) {
    console.log('Native notification fails! :-(');
    notifyFF(iconURL, title, text);
  }
}

// Works only in FF<26
function setConfig() {
  try {
    ps.set("browser.download.manager.showAlertOnComplete", false);
  } catch(e) {}
}
// Works only in FF<26
function restoreOrigConfig() {
  try {
    ps.set("browser.download.manager.showAlertOnComplete", true);
  } catch(e) {}
}

exports.main = function(options, callbacks) {
  // Check if libnofify / OSX library is present
  if(notifApi.checkAvailable()) {
    
    // Register download manager hook
    // Does not work in FF>=26!
    try {
      var dm = Cc["@mozilla.org/download-manager;1"].getService(Ci.nsIDownloadManager);
      dm.addListener(downloadProgressListener);
    } catch(e) {
      console.log("Expected exeption if FF>=26");
    }

    if(sps['replaceAlerts']) {
      // Replace alert-service
      var contract = "@mozilla.org/alerts-service;1";

      // Unregister built-in alerts-service class factory
      Cm.nsIComponentRegistrar.unregisterFactory(
	Cc[contract],
	Cm.getClassObject(Cc[contract], Ci.nsIFactory)
      );

      // Register new factory
      Cm.nsIComponentRegistrar.registerFactory(
	Cc[contract],
	"GNotifier Alerts Service",
	contract,
	XPCOMUtils.generateSingletonFactory(AlertsService)
      );
    }
    
    // Only for FF<26
    setConfig();
  } else {
    // Only for FF<26
    restoreOrigConfig();
  }

};

exports.onUnload = function (reason) {
  // Only for FF<26
  restoreOrigConfig();
}
