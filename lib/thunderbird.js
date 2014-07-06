// Thunderbird stuff
module.exports = thunderbird = {};

var { Cc, Ci, Cu, Cm, Cr } = require('chrome');
var _ = require('sdk/l10n').get;

thunderbird.init = function() {
  
  // Disabling native new email alert
  var ps = require('sdk/preferences/service');
  ps.set("mail.biff.show_alert", false);
  
  // Folder listeners registration for OnItemIntPropertyChanged
  var folderListenerManager = Cc["@mozilla.org/messenger/services/session;1"].getService(Ci.nsIMsgMailSession);
  folderListenerManager.AddFolderListener(thunderbird.mailListener, 0x8);
  
  //var newMailNotificationService = Cc["@mozilla.org/newMailNotificationService;1"].getService(Ci.mozINewMailNotificationService);
  //newMailNotificationService.addListener(thunderbird.mailListener,1);

}

thunderbird.deInit = function() {
  
  // Enabling native new email alert
  var ps = require('sdk/preferences/service');
  ps.set("mail.biff.show_alert", true);
  
  var folderListenerManager = Cc["@mozilla.org/messenger/services/session;1"].getService(Ci.nsIMsgMailSession);
  folderListenerManager.RemoveFolderListener(thunderbird.mailListener);
  
  //var newMailNotificationService = Cc["@mozilla.org/newMailNotificationService;1"].getService(Ci.mozINewMailNotificationService);
  //newMailNotificationService.removeListener(thunderbird.mailListener);
  
}

thunderbird.mailListener = {
 
  OnItemIntPropertyChanged: function (aItem,aProperty,aOldValue,aNewValue) {
    // If new mail, show notification
    if (aProperty=="BiffState" && aNewValue==0) {
      
      var newMailNotificationService = Cc["@mozilla.org/newMailNotificationService;1"].getService(Ci.mozINewMailNotificationService);
      var count = newMailNotificationService.messageCount;

      var text = _("Number_of_unread_messages") + " " + count;
      var body = _("New_message");
      
      var system = require("sdk/system");
      if (system.platform != "darwin")
	text = text+"<input text='"+_("")+"' type='submit'/>";
     
      var notifications = require("sdk/notifications");
      var utils = require('./utils');
      notifications.notify({
	title: body,
	text: text,
	iconURL: utils.getIcon(),
      });
      
    }
  },
  
  /*OnItemBoolPropertyChanged: function (aItem,aProperty,aOldValue,aNewValue) {
    console.log("OnItemBoolPropertyChanged");
    console.log(aItem);
    console.log(aProperty);
    console.log(aOldValue);
    console.log(aNewValue);
  }
  
  onCountChanged: function (count) {
    console.log("onCountChanged, count: " + count);
  },
  
  OnItemAdded : function (aParentItem, aItem) {
    console.log("OnItemAdded");
    console.log(aParentItem);
    console.log(aItem);
  },*/
}

