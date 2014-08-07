/**
* The main module of the 'GNotifier' Add-on.
* Author: Michal Kosciesza <michal@mkiol.net>
* Contributor: Alexander Schlarb <alexander1066@xmine128.tk>
* Contributor: Joe Simpson <headbangerkenny@gmail.com>
* 
* version: 1.8.6
* 
* changelog:
* [1.8.6]
* - SeaMonkey support
* [1.8.5]
* - New mail notification (Thunderbird)
* [1.8.1]
* - Clickable download complete notifications
* - Better closed signal handling
* [1.7.9]
* - 'Show Download Complete alert' option in settings
* - BUG FIX: system.name as libnotify app name 
* - estonian translation
* [1.7.8]
* - Thunderbird support
* [1.7.7]
* - BUG FIX: add-on unload better handling
* - hungarian translation
* [1.7.6]
* - disable custom alert-service for osx
* [1.7.5]
* - BUG FIX: icons in notifications
* [1.7.2]
* - osx support (thanks to Joe Simpson)
* [1.7.1]
* - turkish translation
* - fixes few translations
*/

// imports

var data = require('sdk/self').data;
var _ = require('sdk/l10n').get;

var { Cc, Ci, Cu, Cm, Cr, components } = require('chrome');
Cu.import("resource://gre/modules/Timer.jsm");
Cu.import("resource://gre/modules/FileUtils.jsm");
Cu.import("resource://gre/modules/NetUtil.jsm");
Cu.import('resource://gre/modules/XPCOMUtils.jsm');

Cu.import("resource://gre/modules/Task.jsm");
Cu.import("resource://gre/modules/Downloads.jsm");

var sps = require("sdk/simple-prefs").prefs;
var system = require("sdk/system");

var origAlertsServiceFactory = Cm.getClassObject(Cc["@mozilla.org/alerts-service;1"], Ci.nsIFactory);

var loaded = false;

// Determine Linux / OSX based on 'system.platform'
if(system.platform == "darwin"){
  var notifApi = require('./osx');
} else {
  var notifApi = require('./linux');
}

// Works only for FF<26 and SeaMonkey
var downloadProgressListener = {
  onDownloadStateChange: function(aState, aDownload) {
    var dm = Cc["@mozilla.org/download-manager;1"].getService(Ci.nsIDownloadManager);
    if (sps['downloadCompleteAlert']) {
      var body = _("download_finished");
      var text = aDownload.displayName;
      var notifications = require("sdk/notifications");
      var utils = require('./utils');
     
      switch(aDownload.state) {
      case dm.DOWNLOAD_FINISHED:
	//console.log("referrer: "+aDownload.referrer.path);
	//console.log("source: "+aDownload.source.path);
	//console.log("target: "+aDownload.target.path);
	//console.log("targetFile: "+aDownload.targetFile);
	
	var dir = aDownload.target.path;
	  if (sps['clickOption']==0)
	    var dir = dir.replace(/[^\\\/]*$/, '');
	
	notifications.notify({
	  title: body,
	  text: text,
	  iconURL: utils.getIcon(),
	  onClick: function(){utils.openFile("file://"+dir);}
	});
	break;
      case dm.DOWNLOAD_FAILED:
	notifications.notify({
	  title: body,
	  text: text,
	  iconURL: utils.getIcon()
	});
	break;
      }
    }
  }
}

// Works only for FF>=26
Task.spawn(function () {
  try {
    let list = yield Downloads.getList(Downloads.ALL);
    let view = {
      onDownloadChanged: function(download) {
	if(sps['downloadCompleteAlert'] && download.succeeded) {
	  
	  var dir = download.target.path;
	  if (sps['clickOption']==0)
	    var dir = download.target.path.replace(/[^\\\/]*$/, '');
	  
	  var body = _("download_finished");
	  
	  var text = download.target.path.replace(/^.*[\\\/]/, '');
	  
	  // If linux and libnotify is inited, adding action button
	  if (system.platform != "darwin" && loaded)
	    text = text+"<input text='"+_("open")+"' type='submit'/>";
	  
	  var notifications = require("sdk/notifications");
	  var utils = require('./utils');
	  notifications.notify({
	    title: body,
	    text: text,
	    iconURL: utils.getIcon(),
	    onClick: function(){utils.openFile("file://"+dir);}
	  });
	}
      }
    };
    yield list.addView(view);
  } catch(e) {
    console.log("Unexpected exception",e);
  }
}).then(null, Cu.reportError);


// New implmentation of Alert Service
function AlertsService()
{}
AlertsService.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIAlertsService]),

  showAlertNotification: function GNotifier_AlertsService_showAlertNotification(
    imageUrl, title, text, textClickable, cookie, alertListener, name) {
    
    function GNotifier_AlertsService_showAlertNotification_cb(iconPath) {
      
      // Defing close handler
      var closeHandler = function(){
	// Generating "alertfinished"
	if(alertListener && typeof(alertListener) == "object") {
	  alertListener.observe(null, "alertfinished", cookie);
	}
      };
      
      // Defing click handler
      var clickHandler = function(){
	// Generating "alertclickcallback"
	if(alertListener && typeof(alertListener) == "object") {
	  alertListener.observe(null, "alertclickcallback", cookie);
	}
      };
      
      // Sending notification
      if (notifyNative(iconPath, title, text, name, closeHandler, clickHandler)) {
	
	// Generating "alertshow"
	if(alertListener && typeof(alertListener) == "object") {
	  alertListener.observe(null, "alertshow", cookie);
	}
      }
	  
    }
    
    // Needed for generating temp icon file
    function makeid() {
	var text = "";
	var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	for( var i=0; i < 6; i++ )
	    text += possible.charAt(Math.floor(Math.random() * possible.length));
	return text;
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
	  var iconFile = FileUtils.getFile("TmpD", ["gnotifier-"+makeid()]);
	  iconFile.createUnique(
	    Ci.nsIFile.NORMAL_FILE_TYPE,
	    FileUtils.PERMS_FILE
	  );
	  var iconStream = FileUtils.openSafeFileOutputStream(iconFile);

	  // Copy data from original icon to local file
	  var imageFile = NetUtil.newChannel(imageUrl);
	  NetUtil.asyncFetch(imageFile, function(imageStream,result) {
	    if (!components.isSuccessCode(result)) {
	      console.log("NetUtil.asyncFetch error! result:",result);
	      return;
	    }
	    NetUtil.asyncCopy(imageStream, iconStream, function(result) {
	      if (!components.isSuccessCode(result)) {
		console.log("NetUtil.asyncCopy error! result:",result);
		return;
	      }
	      // Show notification with copied icon file
	      //console.log("Alerting with icon file:",iconFile.path);
	      GNotifier_AlertsService_showAlertNotification_cb(iconFile.path);
	      
	      // Close streams
	      iconStream.close();
	      imageStream.close();
	      
	      // Remove temp icon file
	      setTimeout(function(){
		//console.log("Removing icon file:",iconFile.path);
		iconFile.remove(false);
	      },1000);
	      
	    });
	  });
	} catch(e) {
	    //console.log("catch, e:",e);
	    GNotifier_AlertsService_showAlertNotification_cb(imageUrl);
	}
      }
    }
};

// FF notification
function notifyFF(iconURL, title, text) {
  exports.onUnload();
  var notifications = require("sdk/notifications");
  notifications.notify({
    title: title,
    text: text,
    iconURL: iconURL
  });
}

// Native notification
function notifyNative(iconURL, title, text, notifier, closeHandler, clickHandler) {
  var ret = notifApi.notify(iconURL, title, text, system.name, closeHandler, clickHandler);
  if(!ret) {
    console.log('Native notification fails! :-(');
    notifyFF(iconURL, title, text);
    return false;
  }
  return true;
}

exports.main = function(options, callbacks) {
  
  //console.log("exports.main");
  //console.log("system.name: " + system.name);

  // Check if libnofify / OSX library is present
  if(notifApi.checkAvailable()) {
    //console.log("notifApi.checkAvailable is ok");
    if (sps['replaceAlerts'] && system.platform != "darwin") {
      
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

      loaded = true;
    }
  }
  
  // Works only in FF<26 and SeaMonkey
  try {
    var dm = Cc["@mozilla.org/download-manager;1"].getService(Ci.nsIDownloadManager);
    dm.addListener(downloadProgressListener);
  } catch(e) {
    console.log("Expected exeption if FF>=26");
  }
  try {
    var ps = require('sdk/preferences/service');
    if (loaded && sps['downloadCompleteAlert'])
      ps.set("browser.download.manager.showAlertOnComplete", false);
    else
      ps.set("browser.download.manager.showAlertOnComplete", true);
  } catch(e) {}
  
  // Thunderbird init
  if (loaded && (system.name == "Thunderbird" || system.name == "SeaMonkey")) {
    var thunderbird = require('./thunderbird');
    thunderbird.init();
  }

};

exports.onUnload = function (reason) {

  //console.log("exports.onUnload");
  
  // Unregister current alerts-service class factory
  var contract = "@mozilla.org/alerts-service;1";
  Cm.nsIComponentRegistrar.unregisterFactory(
    Cc[contract],
    Cm.getClassObject(Cc[contract], Ci.nsIFactory)
  );
  
  loaded = false;
  
  // Register orig alert service factory
  Cm.nsIComponentRegistrar.registerFactory(
    Cc[contract],
    "Orig Alerts Service",
    contract,
    origAlertsServiceFactory
  );
  
  // Works only in FF<26
  try {
    var ps = require('sdk/preferences/service');
    ps.set("browser.download.manager.showAlertOnComplete", true);
  } catch(e) {}
  
  // Thunderbird deinit
  if (system.name == "Thunderbird" || system.name == "SeaMonkey") {
    var thunderbird = require('./thunderbird');
    thunderbird.deInit();
  }
}

// ------------- Debug -----------------------

/*let testObserver = {
  observe : function(aSubject, aTopic, aData) {
    
      if (aTopic == "console-storage-cache-event" || aTopic == "console-api-log-event"
	|| aTopic == "cycle-collector-forget-skippable" || aTopic == "cycle-collector-begin"
	|| aTopic == "user-interaction-inactive" || aTopic == "user-interaction-active"
	|| aTopic == "sessionstore-state-write" || aTopic == "sessionstore-state-write-complete"
	|| aTopic == "promise-finalization-witness" || aTopic == "xul-window-visible"
	|| aTopic == "document-shown" || aTopic == "PopupNotifications-updateNotShowing"
	|| aTopic == "http-on-opening-request" || aTopic == "http-on-modify-request"
	|| aTopic == "http-on-examine-response" || aTopic == "third-party-cookie-accepted"
	|| aTopic == "cookie-changed perm-changed")
	return;
      
      console.log("-= Data received =-");
      console.log("aSubject:"+aSubject);
      console.log("aTopic:"+aTopic);
      console.log("aData:"+aData);
  }
}
let observerService = Cc["@mozilla.org/observer-service;1"].
    getService(Ci.nsIObserverService);
//observerService.addObserver(testObserver, "*", false);
observerService.addObserver(testObserver, "dl-done", false);
observerService.addObserver(testObserver, "dl-start", false);*/
