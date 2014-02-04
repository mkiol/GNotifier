/**
* The main module of the 'GNotifier' Add-on.
* Author: Michal Kosciesza <michal@mkiol.net>
* Contributor: Alexander Schlarb <alexander1066@xmine128.tk>
* 
* version: 1.7.1
* 
* changelog:
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

if(system.platform == "darwin"){
  var notifApi = require('./osx');
} else{
  var notifApi = require('./linux');
}

var libc;

var downloadProgressListener = {
  onDownloadStateChange: function(aState, aDownload) {
    console.log("onDownloadStateChange");	
    var dm = Cc["@mozilla.org/download-manager;1"].getService(Ci.nsIDownloadManager);
    var icon = getIcon();
    switch(aDownload.state) {
    case dm.DOWNLOAD_FINISHED:
      notify2(icon, _("download_finished"), aDownload.displayName);
      break;
    case dm.DOWNLOAD_FAILED:
      notify2(icon, _("download_finished"), aDownload.displayName);
      break;
    }
  }
}

function newDownloadProgressListener(download) {
  /*console.log("newDownloadProgressListener");
  console.log("download.succeeded", download.succeeded);
  console.log("download.progress", download.progress);
  console.log("source.url", download.source.url);
  console.log("target.path", download.target.path);*/
  if(download.succeeded) {
    var icon = getIcon();
    var filename = download.target.path.replace(/^.*[\\\/]/, '');
    notify2(icon, _("download_finished"), filename);
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
    console.log("exception",e);
  }
}).then(null, Cu.reportError);

function AlertsService()
{}
AlertsService.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIAlertsService]),

  showAlertNotification: function GNotifier_AlertsService_showAlertNotification(
    imageUrl, title, text, textClickable, cookie, alertListener, name) {
    
    /*console.log('showAlertNotification');
    console.log('imageUrl='+imageUrl);
    console.log('title='+title);
    console.log('text='+text);
    console.log('textClickable='+textClickable);
    console.log('cookie='+cookie);
    console.log('alertListener='+alertListener);
    console.log('name='+name);*/

    //TODO: Support textClickable (Yes its possible using a button...)
    function GNotifier_AlertsService_showAlertNotification_cb(iconPath) {
      notify2(iconPath, title, text, name);
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

function getIcon() {
  console.log("system.name",system.name);
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

function importLibnotify() {
  try {
    libc = ctypes.open("libnotify.so.4");
    return true;
  } catch (e) {
    try {
      libc = ctypes.open("/usr/local/lib/libnotify.so.4");
      return true;
    } catch (e) {
      return false;
    }
  }
}

function notify1(iconURL, title, text) {
  /*console.log('notify1');
  console.log('iconURL='+iconURL);
  console.log('title='+title);
  console.log('text='+text);*/
  var notifications = require("sdk/notifications");
  notifications.notify({
    title: title,
    text: text,
    iconURL: iconURL
  });
}

function notify2(iconURL, title, text, notifier) {
  /*console.log('notify2');
  console.log('iconURL='+iconURL);
  console.log('title='+title);
  console.log('text='+text);*/
  var ret = notifApi.notify(iconURL, title, text, notifier);

  if(!ret) {
    console.log('error!');
    notify1(iconURL, title, text);
  }
}

function setConfig() {
  ps.set("browser.download.manager.showAlertOnComplete", false);
}

function restoreOrigConfig() {
  ps.set("browser.download.manager.showAlertOnComplete", true);
}

exports.main = function(options, callbacks) {
  /*console.log("exports.main, loadReason=" + options.loadReason);
  console.log("system.platform=" + system.platform);
  console.log("system.name=" + system.name);
  console.log("system.vendor=" + system.vendor);*/
  // check if libnofify.so.4 is present
  if(notifApi.checkAvailable()) {
    // Register download manager hook
    // Disabled in FF 26
    try {
      var dm = Cc["@mozilla.org/download-manager;1"].getService(Ci.nsIDownloadManager);
      dm.addListener(downloadProgressListener);
    } catch(e) {
      console.log("dm exeption");
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
    setConfig();

  } else {
    restoreOrigConfig();
  }

/*require("widget").Widget({
  id: "widgetID1",
  label: "GNotifier",
  contentURL: "http://www.mozilla.org/favicon.ico",
  onClick: function(event) {
  notify2("firefox", _("download_finished"), _("download_finished"));
  }
});*/

};

exports.onUnload = function (reason) {
  restoreOrigConfig();
}

