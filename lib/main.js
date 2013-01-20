// The main module of the 'GNotifier' Add-on.

// imports
var data = require("self").data;
var _ = require("l10n").get;
var { Cc, Ci, Cu } = require('chrome');
Cu.import("resource://gre/modules/ctypes.jsm", this);
var libc;
var dm = Cc["@mozilla.org/download-manager;1"]
	.getService(Ci.nsIDownloadManager);
var ps = Cc["@mozilla.org/preferences-service;1"]
	.getService(Ci.nsIPrefBranch);
// ---

var downloadProgressListener = {
    onDownloadStateChange: function(aState, aDownload) {
        switch(aDownload.state) {
        case dm.DOWNLOAD_FINISHED:
            notify2("Download finished!", aDownload.displayName);
            break;
        case dm.DOWNLOAD_FAILED:
            notify2("Download failed!", aDownload.displayName);
            break;
        }
    }
}
    
exports.main = function() {
    console.log("init");
    
    if(importLibnotify()) {
        dm.addListener(downloadProgressListener);
        ps.setBoolPref(
			"browser.download.manager.showAlertOnComplete",false);
    } else {
        ps.setBoolPref(
			"browser.download.manager.showAlertOnComplete",true);
    }
    
    /*require("widget").Widget({
        id: "widgetID1",
        label: "Test",
        contentURL: "http://www.mozilla.org/favicon.ico",
        onClick: function(event) {
            notify2(_("download_finished"), _("download_finished"));
            console.log(_("download_finished"));
        }
    });*/
    
};

function importLibnotify() {
    try {
        libc = ctypes.open("libnotify.so.4");
        //console.log("libnotify.so.4");
        return true;
    } catch (e) {
        try {
          libc = ctypes.open("/usr/local/lib/libnotify.so.4");
          //console.log("/usr/local/lib/libnotify.so.4");
          return true;
        } catch (e) {
            //console.log("no libc");
            return false;
        }
    }
}

function notify1(title, text) {
    //console.log("notify1");
    notifications.notify({
        title: title,
        text: text,
        iconURL: ff_icon
    });
}

function notify2(title, text) {
    //console.log("notify2");
    
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
    
    notify_init("gnotifier");
    
    var error = new struct_gerror_ptr;
    var ret = notify_notification_show(
		notify_notification_new(title,text,"firefox"),error);
    
    if(!ret) {
		notify1(title, text);
	}
}


