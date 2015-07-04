// Thunderbird stuff
module.exports = thunderbird = {};

var { Cc, Ci, Cu, Cm, Cr } = require('chrome');
var _ = require('sdk/l10n').get;

function showSimpleNewMessageNotification() {

    // Getting new messages count
    var newMailNotificationService = Cc["@mozilla.org/newMailNotificationService;1"].getService(Ci.mozINewMailNotificationService);
    var count = newMailNotificationService.messageCount;

    var title = _("New_message");
    var text = _("Number_of_unread_messages") + " " + count;

    var utils = require('./utils');

    // if linux => doing unclickable notification, so without actionList
    var system = require("sdk/system");
    if (system.platform === "linux") {
        var notifApi = require('./linux');
        if (notifApi.notifyWithActions(utils.getIcon(), title, text, system.name, null, null));
        return;
    }

    var notifications = require("sdk/notifications");
    notifications.notify({
        title: title,
        text: text,
        iconURL: utils.getIcon(),
    });
}

function showNewMessageNotification(message) {

    var author = message.mime2DecodedAuthor;
    // unicode character ranges taken from:
    // http://stackoverflow.com/questions/1073412/javascript-validation-issue-with-international-characters#1073545
    var author_regex = /^["']?([A-Za-z\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF\s]+)["']?\s<.+?>$/;
    // check if author has name and email
    if (author_regex.test(author)) {
      // retrieve only name portion of author string
      author = author.match(author_regex)[1];
    }
    var title = _("New_message_from") + " " + author;
    var text = message.mime2DecodedSubject;

    var utils = require('./utils');

    // if linux => doing unclickable notification, so without actionList
    var system = require("sdk/system");
    if (system.platform === "linux") {
        var notifApi = require('./linux');
        if (notifApi.notifyWithActions(utils.getIcon(), title, text, system.name, null, null));
        return;
    }

    var notifications = require("sdk/notifications");
    notifications.notify({
        title: title,
        text: text,
        iconURL: utils.getIcon(),
    });
}

thunderbird.init = function() {

    // Disabling native new email alert
    var ps = require('sdk/preferences/service');
    ps.set("mail.biff.show_alert", false);

    // Folder listeners registration for OnItemIntPropertyChanged
    var folderListenerManager = Cc["@mozilla.org/messenger/services/session;1"].getService(Ci.nsIMsgMailSession);
    folderListenerManager.AddFolderListener(thunderbird.mailListener, 0x8);

}

thunderbird.deInit = function() {

    // Enabling native new email alert
    var ps = require('sdk/preferences/service');
    ps.set("mail.biff.show_alert", true);

    var folderListenerManager = Cc["@mozilla.org/messenger/services/session;1"].getService(Ci.nsIMsgMailSession);
    folderListenerManager.RemoveFolderListener(thunderbird.mailListener);

}

thunderbird.mailListener = {

    OnItemIntPropertyChanged: function (aItem,aProperty,aOldValue,aNewValue) {

        /*function getFirstFolderWithNewMail(aFolder) {
            console.log("getFirstFolderWithNewMail");
            if (aFolder) {
                console.log("aFolder: ", aFolder.prettyName, aFolder.biffState, aFolder.hasNewMessages, aFolder.hasSubFolders);
                if (aFolder.biffState == Ci.nsIMsgFolder.nsMsgBiffState_NewMail) {
                    if (aFolder.hasNewMessages)
                        return aFolder;
                    if (aFolder.hasSubFolders) {
                        console.log("aFolder.hasSubFolders");
                        var subFolders = aFolder.subFolders;
                        while (subFolders.hasMoreElements()) {
                            console.log("subFolders.hasMoreElements()");
                            var subFolder = subFolders.getNext().QueryInterface(Ci.nsIMsgFolder);
                            if (subFolder)
                                subFolder = getFirstFolderWithNewMail(subFolder);
                            if (subFolder)
                                return subFolder
                        }
                    }
                }
            }
        }*/

        function getFoldersWithNewMail(aFolder) {
            var folderList = [];
            if (aFolder) {
                //console.log("aFolder: ", aFolder.prettyName, aFolder.biffState, aFolder.hasNewMessages, aFolder.hasSubFolders);
                if (aFolder.biffState == Ci.nsIMsgFolder.nsMsgBiffState_NewMail) {
                    if (aFolder.hasNewMessages)
                        folderList.push(aFolder);
                    if (aFolder.hasSubFolders) {
                        //console.log("aFolder.hasSubFolders");
                        var subFolders = aFolder.subFolders;
                        while (subFolders.hasMoreElements()) {
                            //console.log("subFolders.hasMoreElements()");
                            var subFolder = subFolders.getNext().QueryInterface(Ci.nsIMsgFolder);
                            if (subFolder)
                                folderList = folderList.concat(getFoldersWithNewMail(subFolder));
                        }
                    }
                }
            }

            return folderList;
        }

        // New mail if BiffState == nsMsgBiffState_NewMail
        if (aProperty == "BiffState" &&
            aNewValue == Ci.nsIMsgFolder.nsMsgBiffState_NewMail &&
            ( aOldValue == Ci.nsIMsgFolder.nsMsgBiffState_NoMail || aOldValue == Ci.nsIMsgFolder.nsMsgBiffState_Unknown )
        ) {

          var sps = require("sdk/simple-prefs").prefs;
          if (sps['simpleNewMail']) {
              showSimpleNewMessageNotification();
              return;
          }
          
            // Getting first folder with new messages
            /*var folder = getFirstFolderWithNewMail(aItem);
            if (!folder) {
                // Can't find folder with BiffState == nsMsgBiffState_NewMail
                console.log("Can't find folder with BiffState == nsMsgBiffState_NewMail");
                return;
            }*/

            var folderList = getFoldersWithNewMail(aItem);
            if (folderList.length == 0) {
                // Can't find folder with BiffState == nsMsgBiffState_NewMail
                console.log("Can't find folder with BiffState == nsMsgBiffState_NewMail");
                return;
            }

            for (var i in folderList) {
                 //console.log("folder",folderList[i].prettyName);
                 if (folderList[i]) {
                   // Looking for messages with flag == Ci.nsMsgMessageFlags.New
                   var messages = folderList[i].messages;
                   while (messages.hasMoreElements()) {
                       var message = messages.getNext().QueryInterface(Ci.nsIMsgDBHdr);
                       if (message.flags & Ci.nsMsgMessageFlags.New) {
                           //console.log("message: ",message.subject);
                           showNewMessageNotification(message);
                       }
                   }
                }
            }

        }
    }
}
