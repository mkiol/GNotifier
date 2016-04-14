
// Thunderbird stuff
module.exports = thunderbird = {};

var { Cc, Ci, Cu, Cm, Cr } = require('chrome');
var _ = require('sdk/l10n').get;

Cu.import("resource://app/modules/gloda/mimemsg.js");

var gHeaderParser = Cc["@mozilla.org/messenger/headerparser;1"].getService(Ci.nsIMsgHeaderParser);
var gMessenger = Cc["@mozilla.org/messenger;1"].getService(Ci.nsIMessenger);
var win = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator).getMostRecentWindow("mail:3pane");

function showSimpleNewMessageNotification(isRSS) {

    // Getting new messages count
    var newMailNotificationService = Cc["@mozilla.org/newMailNotificationService;1"].getService(Ci.mozINewMailNotificationService);
    var count = newMailNotificationService.messageCount;

    var title = isRSS ? _("New_article") : _("New_message");
    var text = _("Number_of_unread_messages") + " " + count;

    showNotification(title, text, null);
}

function showNewRSSNotification(message) {

    var author = message.mime2DecodedAuthor;
    // unicode character ranges taken from:
    // http://stackoverflow.com/questions/1073412/javascript-validation-issue-with-international-characters#1073545
    var author_regex = /^["']?([A-Za-z\u00A0-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF\s]+)["']?\s<.+?>$/;
    // check if author has name and email
    if (author_regex.test(author)) {
      // retrieve only name portion of author string
      author = author.match(author_regex)[1];
    }
    var title = _("New_article_from") + " " + author;
    var text = message.mime2DecodedSubject;

    showNotification(title, text, message);
}

function showNewEmailNotification(message) {

  var sps = require("sdk/simple-prefs").prefs;
  var textFormat = sps.emailTextFormat.replace(/\\n/, "\n");

  format(message, sps.emailTitleFormat, function(string){
    var title = string;
    format(message, textFormat, function(string){
      var text = string;
      showNotification(title, text, message);
    });
  });

}

function showNotification(title, text, message){

    var utils = require('./utils');

    var system = require("sdk/system");
    var sps = require("sdk/simple-prefs").prefs;
    if (sps['engine'] == 1 && system.platform === "linux" && notifApi.checkButtonsSupported()) {
        var notifApi = require('./linux');
        if (notifApi.notifyWithActions(utils.getIcon(), title, text, system.name, null,
                    message ? [{
                        label: _("open"),
                        handler: function() {
                            display(message);
                        }
                    }, {
                        label: _("Mark_as_read"),
                        handler: function() {
                            message.markRead(true);
                        }
                    }] : null))
            return;
    }

    var notifications = require("sdk/notifications");
    notifications.notify({
        title: title,
        text: text,
        iconURL: utils.getIcon(),
    });

}

// Display a given message. Heavily inspired by
// https://developer.mozilla.org/docs/Mozilla/Thunderbird/Content_Tabs
function display(message) {
    // Try opening new tabs in an existing 3pane window
    let mail3PaneWindow = Cc["@mozilla.org/appshell/window-mediator;1"]
        .getService(Ci.nsIWindowMediator)
        .getMostRecentWindow("mail:3pane");
    if (mail3PaneWindow) {
        var tabmail = mail3PaneWindow.document.getElementById("tabmail");
        if (tabmail) {
            tabmail.openTab("message", {msgHdr: message});
            mail3PaneWindow.focus();
            return
        }
    }

    // If no window to open in can be found, fall back
    // to any window and spwan a new one from there.
    require("sdk/window/utils").windows()[0].openDialog("chrome://messenger/content/messageWindow.xul", "_blank", "all,chrome,dialog=no,status,toolbar", message);
}

function format(message, format, callback){

  var author = gHeaderParser.parseDecodedHeader(message.mime2DecodedAuthor);

  if(format.match(/%b/)){
    MsgHdrToMimeMessage(message, null, function (aMsgHdr, aMimeMsg){
        var body = aMimeMsg.coerceBodyToPlaintext(aMsgHdr.folder);
        doReplace(body);
    });
  } else {
    doReplace();
  }

  function doReplace(body){
    var string = format.replace(new RegExp("(%[samnfvkub%])", 'g'), function(match, p1){
      switch(p1){
        // Subject, with "Re:" when appropriate
        case "%s":
          var hasRe = message.flags & Ci.nsMsgMessageFlags.HasRe;
          return hasRe ? 'Re: ' + message.mime2DecodedSubject : message.mime2DecodedSubject;
        // Full Author
        case "%a":
          return message.mime2DecodedAuthor;
        // Author e-mail address only
        case "%m":
          return author[0].email;
        // Author name only
        case "%n":
          return author[0].name;
        // Folder
        case "%f":
          return message.folder.prettiestName;
        // Server
        case "%v":
          return message.folder.server.hostName;
        // Size
        case "%k":
          return gMessenger.formatFileSize(message.messageSize);
        // Account name
        case "%u":
          return message.folder.server.prettyName;
        // Body excerpt
        case "%b":
          body = body.replace(/\n/g, ' ').trim().substr(0, 80).trim();
          body += body.length > 80 ? "..." : "";
          return body;
        // Percent
        case "%%":
          return "%";
      }
    });

    callback(string);
  }
}

function testNotification(){
  if(win.gFolderDisplay.selectedMessage){
    showNewEmailNotification(win.gFolderDisplay.selectedMessage);
  } else {
    showNotification("GNotifier test", "You need to select a message to test this feature", null);
  }
}

thunderbird.init = function() {

    // Disabling native new email alert
    var ps = require('sdk/preferences/service');
    ps.set("mail.biff.show_alert", false);

    // Folder listeners registration for OnItemIntPropertyChanged
    var folderListenerManager = Cc["@mozilla.org/messenger/services/session;1"].getService(Ci.nsIMsgMailSession);
    folderListenerManager.AddFolderListener(thunderbird.mailListener, 0x8);

    var sp = require("sdk/simple-prefs");
    sp.on("test", function() {
      testNotification();
    });

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

        // Reference: https://mxr.mozilla.org/comm-central/source/mailnews/base/public/nsMsgFolderFlags.idl
        function isFolderExcluded(folder) {
          // Junk
          if (folder.getFlag(0x40000000))
            return true;
          // Trash
          if (folder.getFlag(0x00000100))
            return true;
          // SentMail
          if (folder.getFlag(0x00000200))
            return true;
          // Drafts
          if (folder.getFlag(0x00000400))
            return true;
          // Archive
          if (folder.getFlag(0x00004000))
            return true;
          // Templates
          if (folder.getFlag(0x00400000))
            return true;
          return false;
        }

        var sps = require("sdk/simple-prefs").prefs;

        // Check if root folder is RSS folder (mailbox://nobody@Feeds)
        var rootURIarr = aItem.rootFolder.URI.split("@");
        var isRSS = rootURIarr[rootURIarr.length-1] == "Feeds";
        if (isRSS && !sps['enableRSS'])
          return;

        // New mail if BiffState == nsMsgBiffState_NewMail or NewMailReceived
        if (
          (aProperty == "BiffState" && aNewValue == Ci.nsIMsgFolder.nsMsgBiffState_NewMail &&
            (aOldValue == Ci.nsIMsgFolder.nsMsgBiffState_NoMail || aOldValue == Ci.nsIMsgFolder.nsMsgBiffState_Unknown)) ||
          (aProperty == "NewMailReceived")
        ) {

          if (sps['simpleNewMail']) {
              showSimpleNewMessageNotification(isRSS);
              return;
          }

          var folderList = getFoldersWithNewMail(aItem);
          if (folderList.length == 0) {
              // Can't find folder with BiffState == nsMsgBiffState_NewMail
              //console.log("Can't find folder with BiffState == nsMsgBiffState_NewMail");
              return;
          }

          for (var i in folderList) {
              if (folderList[i]) {
                var folder = folderList[i];
                if (!isFolderExcluded(folder)) {
                  // Looking for messages with flag == Ci.nsMsgMessageFlags.New
                  var messages = folder.messages;
                  while (messages.hasMoreElements()) {
                      var message = messages.getNext().QueryInterface(Ci.nsIMsgDBHdr);
                      if (message.flags & Ci.nsMsgMessageFlags.New) {

                          //console.log("Message: id="+message.messageId + " gnd="+message.getUint32Property("gnotifier-done"));
                          /*var property = message.propertyEnumerator;
                          while (property.hasMore()) {
                            console.log(property.getNext());
                          }*/

                          if (message.getUint32Property("gnotifier-done") != 1) {
                            if(isRSS)
                              showNewRSSNotification(message);
                            else
                              showNewEmailNotification(message);
                            message.setUint32Property("gnotifier-done",1);
                          }
                      }
                  }
                }
              }
          }

        }
    }
}
