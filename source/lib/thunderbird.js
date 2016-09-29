/**
 * GNotifier - Firefox/Thunderbird add-on that replaces
 * built-in notifications with the OS native notifications
 *
 * Copyright 2014 by Michal Kosciesza <michal@mkiol.net>
 *
 * Licensed under GNU General Public License 3.0 or later.
 * Some rights reserved. See COPYING, AUTHORS.
 *
 * @license GPL-3.0 <https://www.gnu.org/licenses/gpl-3.0.html>
 */

var { Cc, Ci, Cu, Cm, Cr } = require("chrome");
var _ = require("sdk/l10n").get;

Cu.import("resource://app/modules/gloda/mimemsg.js");
Cu.import("resource://gre/modules/Timer.jsm");

var gHeaderParser = Cc["@mozilla.org/messenger/headerparser;1"].getService(Ci.nsIMsgHeaderParser);
var gMessenger = Cc["@mozilla.org/messenger;1"].getService(Ci.nsIMessenger);
var system = require("sdk/system");
var utils = require('./utils.js');

//var app = Cc["@mozilla.org/steel/application;1"].getService(Ci.steelIApplication);

var bufferedMessages = [];
var timeoutID;

function getUnreadMessageCount() {
  // Getting unread messages count
  var newMailNotificationService = Cc["@mozilla.org/newMailNotificationService;1"].getService(Ci.mozINewMailNotificationService);
  return newMailNotificationService.messageCount;
}

function showAggregatedNotification () {
  var text = _("Number_of_new_messages") + " " + bufferedMessages.length;
  showNotification(_("New_messages"), text, null);
}

function showMessageNotification (message) {
  if (isFolderRSS(message.folder)) {
    showNewRSSNotification(message);
  } else {
    showNewEmailNotification(message);
  }
}

function showNewRSSNotification (message) {
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

function isFolderRSS(folder) {
  var rootURIarr = folder.rootFolder.URI.split("@");
  return (rootURIarr[rootURIarr.length-1].indexOf("Feeds") !== -1);
}

function bufferNewEmailNotification (message) {
  clearTimeout(timeoutID);
  bufferedMessages.push(message);
  timeoutID = setTimeout(function() { showNewEmailNotificationFromBuffer(); }, 1000);
}

function showNewEmailNotificationFromBuffer () {
  var sps = require("sdk/simple-prefs").prefs;
  if (sps["maxMessageBuffer"] > 0 && bufferedMessages.length > sps["maxMessageBuffer"]) {
    showAggregatedNotification();
  } else {
    for (var i = 0; i < bufferedMessages.length; i++) {
      showMessageNotification(bufferedMessages[i]);
    }
  }

  bufferedMessages = [];
  timeoutID = undefined;
}

function showNewEmailNotification (message) {
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

function showNotification (title, text, message){
  var notifications = require("sdk/notifications");

  // Current implementation of click action doesn't support SeaMonkey,
  // so doing not clickable notification if SeaMonkey
  if (system.name === "SeaMonkey") {
    notifications.notify({
      title: title,
      text: text,
      iconURL: utils.getIcon()
    });
    return;
  }

  // Doing notification with buttons if Linux and buttons are supported in
  // the notify server
  var sps = require("sdk/simple-prefs").prefs;
  if (sps['engine'] === 1 && system.platform === "linux") {
    var notifApi = require('./linux.js');

    var actions = null;
    if (message) {
      if (sps['clickOptionNewEmail'] === 0) {
      actions = [{
          label: _("open"),
          handler: function() {
            display(message);
          }
        }, {
          label: _("Mark_as_read"),
          handler: function() {
            message.markRead(true);
          }
        }];
      } else {
        actions = [{
          label: _("Mark_as_read"),
          handler: function() {
            message.markRead(true);
          }
        }, {
          label: _("open"),
          handler: function() {
            display(message);
          }
        }];
      }
    }

    if (notifApi.checkButtonsSupported() &&
        notifApi.notifyWithActions(utils.getIcon(), title, text, system.name,
          function(reason) {}, actions)) {
      return;
    }

  }

  if (message) {
    notifications.notify({
      title: title,
      text: text,
      iconURL: utils.getIcon(),
      onClick: function (data){display(message)}
    });
    return;
  }

  notifications.notify({
    title: title,
    text: text,
    iconURL: utils.getIcon()
  });
}

// Display a given message. Heavily inspired by
// https://developer.mozilla.org/docs/Mozilla/Thunderbird/Content_Tabs
function display (message) {
    // Try opening new tabs in an existing 3pane window
    var win = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator).getMostRecentWindow("mail:3pane");
    //console.log(win.document.documentElement.getAttribute('windowtype'));
    if (win) {
        //INFO: tabmail is not supported in SeaMonkey
        var tabmail = win.document.getElementById("tabmail");
        var sps = require("sdk/simple-prefs").prefs;
        if (sps['newMailOpen'] == 0) {
          if (tabmail)
            tabmail.openTab("message", {msgHdr: message});
        } else {
          if (tabmail)
            tabmail.switchToTab(0);
          win.gFolderDisplay.show(message.folder);
          win.gFolderDisplay.selectMessage(message);
        }

        // On Windows, bring TB window to the front
        if (system.platform === "winnt") {
          require("./windowsUtils.js").forceFocus(win);
        } else {
          win.focus();
        }

        return;
    }

    // If no window to open in can be found, fall back
    // to any window and spwan a new one from there.
    require("sdk/window/utils").windows()[0].openDialog("chrome://messenger/content/messageWindow.xul", "_blank", "all,chrome,dialog=no,status,toolbar", message);
}

function format (message, format, callback){
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
    var string = format.replace(new RegExp("(%[samnfvkubc%])", 'g'), function(match, p1){
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
        // Numer of unread messages
        case "%c":
          return getUnreadMessageCount();
        // Percent
        case "%%":
          return "%";
      }
    });

    callback(string);
  }
}

function testNotification () {
  var win = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator).getMostRecentWindow("mail:3pane");
  if (win && win.gFolderDisplay && win.gFolderDisplay.selectedMessage) {

    // Folder filtering test
    var folder = win.gFolderDisplay.selectedMessage.folder
    if (isFolderExcluded(folder) || !isFolderAllowed(folder)) {
      var notifications = require("sdk/notifications");
      var name = folder.rootFolder.prettiestName + "|" + folder.prettiestName;
      utils.showGnotifierNotification("Notifications from folder \"" + name + "\" are disabled.");
      return;
    }

    showMessageNotification(win.gFolderDisplay.selectedMessage);

  } else {
    utils.showGnotifierNotification("You need to select a message to test this feature.");
  }
}

function isFolderExcluded(folder) {
  // Reference: https://mxr.mozilla.org/comm-central/source/mailnews/base/public/nsMsgFolderFlags.idl

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

function isFolderAllowed(folder) {
  // Allow user to filter specific folders.

  var sps = require("sdk/simple-prefs").prefs;
  foldersAllowedListPref = sps['foldersAllowedList'];
  if (foldersAllowedListPref !== "") {
    var foldersAllowedList = foldersAllowedListPref.split(",")
    for (var i = 0; i < foldersAllowedList.length; i++) {
      var folderName1 = foldersAllowedList[i].toLowerCase().trim();
      var folderName2;
      if (folderName1.indexOf("|") !== -1) {
        // Folder name contains rootFolder name
        folderName2 = folder.rootFolder.prettiestName.toLowerCase() + "|" + folder.prettiestName.toLowerCase();
      } else {
        folderName2 = folder.prettiestName.toLowerCase();
      }
      if (folderName1 == folderName2) {
        return true;
      }
    }
  } else {
    //allow all folders if setting is empty
    return true;
  }
  return false;
}

function getFoldersWithNewMail (aFolder) {
  var folderList = [];
  if (aFolder) {
    if (aFolder.biffState == Ci.nsIMsgFolder.nsMsgBiffState_NewMail) {
      if (aFolder.hasNewMessages)
        folderList.push(aFolder);
      if (aFolder.hasSubFolders) {
        var subFolders = aFolder.subFolders;
        while (subFolders.hasMoreElements()) {
          var subFolder = subFolders.getNext().QueryInterface(Ci.nsIMsgFolder);
          if (subFolder)
            folderList = folderList.concat(getFoldersWithNewMail(subFolder));
        }
      }
    }
  }
  return folderList;
}

var mailListener = {
  OnItemIntPropertyChanged: function (aItem,aProperty,aOldValue,aNewValue) {
    var sps = require("sdk/simple-prefs").prefs;

    if (!sps['enableRSS'] && isFolderRSS(aItem)) {
      // Notifications for RSS are disabled
      return;
    }

    // New mail if BiffState == nsMsgBiffState_NewMail or NewMailReceived
    if (
      (aProperty == "BiffState" && aNewValue == Ci.nsIMsgFolder.nsMsgBiffState_NewMail &&
        (aOldValue == Ci.nsIMsgFolder.nsMsgBiffState_NoMail || aOldValue == Ci.nsIMsgFolder.nsMsgBiffState_Unknown)) ||
      (aProperty == "NewMailReceived")
    ) {

      var folderList = getFoldersWithNewMail(aItem);
      if (folderList.length == 0) {
          // Can't find folder with BiffState == nsMsgBiffState_NewMail
          return;
      }

      for (var i in folderList) {
        if (folderList[i]) {
          var folder = folderList[i];
          if (!isFolderExcluded(folder) && isFolderAllowed(folder)) {
            // Looking for messages with flag == Ci.nsMsgMessageFlags.New
            var messages = folder.messages;
            while (messages.hasMoreElements()) {
              var message = messages.getNext().QueryInterface(Ci.nsIMsgDBHdr);
              if (message.flags & Ci.nsMsgMessageFlags.New) {
                if (message.getUint32Property("gnotifier-done") != 1) {
                  bufferNewEmailNotification(message);
                  message.setUint32Property("gnotifier-done",1);
                }
              }
            }
          }
        }
      }

    }
  }
};

exports.init = function() {
  // Disabling native new email alert
  var ps = require('sdk/preferences/service');
  ps.set("mail.biff.show_alert", false);

  // Folder listeners registration for OnItemIntPropertyChanged
  var folderListenerManager = Cc["@mozilla.org/messenger/services/session;1"].getService(Ci.nsIMsgMailSession);
  folderListenerManager.AddFolderListener(mailListener, 0x8);

  var sp = require("sdk/simple-prefs");
  sp.on("test", function() {
    testNotification();
  });
};

exports.deInit = function() {
  bufferedMessages = [];

  // Enabling native new email alert
  var ps = require('sdk/preferences/service');
  ps.set("mail.biff.show_alert", true);

  var folderListenerManager = Cc["@mozilla.org/messenger/services/session;1"].getService(Ci.nsIMsgMailSession);
  folderListenerManager.RemoveFolderListener(mailListener);
};
