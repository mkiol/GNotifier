/**
 * The main module of the 'GNotifier' Add-on.
 * Author: Michal Kosciesza <michal@mkiol.net>
 */

// imports
var data = require("self").data;
var _ = require("l10n").get;
var { Cc, Ci, Cu, Cm, Cr } = require('chrome');
Cu.import("resource://gre/modules/ctypes.jsm", this);
Cu.import("resource://gre/modules/FileUtils.jsm");
Cu.import("resource://gre/modules/NetUtil.jsm");
Cu.import('resource://gre/modules/XPCOMUtils.jsm');

var dm = Cc["@mozilla.org/download-manager;1"].getService(Ci.nsIDownloadManager);
var ps = require("preferences-service");
var system = require("sdk/system");
var libc;
var icon;


var downloadProgressListener = {
    onDownloadStateChange: function(aState, aDownload) {
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


function AlertsService()
{}
AlertsService.prototype = {
    QueryInterface: XPCOMUtils.generateQI([Ci.nsIAlertsService]),

    
    showAlertNotification: function GNotifier_AlertsService_showAlertNotification(
    		imageUrl, title, text, textClickable, cookie, alertListener, name
    )
    {
    	//TODO: Support textClickable (Yes its possible using a button...)
    	function GNotifier_AlertsService_showAlertNotification_cb(iconPath)
    	{
    		// Display notification
    		notify2(iconPath, title, text, name);
    		
    		//TODO: Call the callback once the alert is actually finished...
    		if(typeof(alertListener) == "function") {
    			alertListener(null, "alertfinished", cookie);
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
				NetUtil.asyncFetch(imageFile, function(imageStream)
				{
					NetUtil.asyncCopy(imageStream, iconStream, function()
					{
						// Show notification with copied icon file
						GNotifier_AlertsService_showAlertNotification_cb(
								imageFile.path
						);
					
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


exports.main = function(options, callbacks) {
	
	/*
	console.log("[DEBUG] exports.main, loadReason=" + options.loadReason);
	console.log("[DEBUG] system.platform=" + system.platform);
	console.log("[DEBUG] system.name=" + system.name);
	console.log("[DEBUG] system.vendor=" + system.vendor);
	console.log("[DEBUG] start");
	*/
	
	// check if libnofify.so.4 is present
    if(importLibnotify()) {
    	// Register download manager hook
        dm.addListener(downloadProgressListener);
		setConfig();
		
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
	
	//var nsAlertsService = Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService);
	//nsAlertsService.showAlertNotification("file:///usr/share/pixmaps/guayadeque.png", "hello", "world");
};

exports.onUnload = function (reason) {

	restoreOrigConfig();
	
}

function setConfig() {
	
	var hasIcon = ps.isSet("extensions.gnotifier.notifyIcon");
	if(hasIcon) {
		icon = ps.get("extensions.gnotifier.notifyIcon");
	} else {
		if(system.name == "Iceweasel") {
			icon = "iceweasel";
		} else {
			icon = "firefox";
		}
	}
	
	var v = ps.get("browser.download.manager.showAlertOnComplete");
	var hasOldPref = ps.isSet("extensions.gnotifier.showAlertOnComplete");
	if(!hasOldPref) {
		ps.set("extensions.gnotifier.showAlertOnComplete", v);
	}
	ps.set("browser.download.manager.showAlertOnComplete", false);
	
}

function restoreOrigConfig() {
	
	var hasOldPref = ps.has("extensions.gnotifier.showAlertOnComplete");
	if(hasOldPref) {
		var v = ps.get("extensions.gnotifier.showAlertOnComplete");
		ps.set("browser.download.manager.showAlertOnComplete", v);
	}
	
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
	
    notifications.notify({
        title: title,
        text: text,
        iconURL: iconURL
    });
    
}

function notify2(iconURL, title, text, notifier) {
    
    const struct_gerror = new ctypes.StructType("GError",
                        [ { "gerror_domain": ctypes.uint32_t },
                          { "gerror_code": ctypes.int },
                          { "gerror_message": ctypes.char.ptr }]);    
    const struct_gerror_ptr = new ctypes.PointerType(struct_gerror);
    const struct_notification = new ctypes.StructType(
												"NotifyNotification");
     
    var notify_init = libc.declare(
		"notify_init", ctypes.default_abi, ctypes.bool, ctypes.char.ptr);    
    var notify_is_initted = libc.declare(
		"notify_is_initted", ctypes.default_abi, ctypes.bool);
    var notify_notification_new = libc.declare(
		"notify_notification_new", ctypes.default_abi,
		struct_notification.ptr, ctypes.char.ptr,
		ctypes.char.ptr, ctypes.char.ptr);  
    var notify_notification_show = libc.declare(
		"notify_notification_show", ctypes.default_abi, ctypes.bool,
		struct_notification.ptr, struct_gerror_ptr);
    
    notify_init((typeof(notifier) == "string") ? notifier : "gnotifier");
    
    var error = new struct_gerror_ptr;
    var ret = notify_notification_show(
		notify_notification_new(title,text,iconURL),error);
    
    if(!ret) {
		notify1(iconURL, title, text);
	}
	
}


