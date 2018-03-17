/**
 * GNotifier - Firefox/Thunderbird add-on that replaces
 * built-in notifications with the OS native notifications
 *
 * Licensed under GNU General Public License 3.0 or later.
 * Some rights reserved. See COPYING, AUTHORS.
 *
 * @license GPL-3.0 <https://www.gnu.org/licenses/gpl-3.0.html>
 */

const {Cc, Ci, Cu} = require("chrome");

Cu.import("resource://gre/modules/Task.jsm");
Cu.import("resource://gre/modules/Downloads.jsm");
Cu.import("resource://gre/modules/osfile.jsm");
Cu.import("resource://gre/modules/Timer.jsm");

const _ = require("sdk/l10n").get;
const utils = require("./utils.js");
const sps = require("sdk/simple-prefs").prefs;
const system = require("sdk/system");

let notifApi = null; // Notification API
let timeoutID = null;
let bufferedPaths = [];

function isFileExcluded(filename) {
  // Check if file extension is excluded
  const ext = utils.getFileExtension(filename).toLowerCase();
  if (sps.excludedExtensionsList !== "") {
    const excludedExtensionsList = sps.excludedExtensionsList.split(",");
    for (let i = 0; i < excludedExtensionsList.length; i++) {
      const eext = excludedExtensionsList[i].toLowerCase().trim();
      if (ext === eext) {
        // File extension is excluded
        return true;
      }
    }
  }
  return false;
}

function bufferNotification(path) {
  if (isFileExcluded(path)) {
    return;
  }

  if (sps.maxDLbuffer == 0) {
    showDownloadCompleteNotification(path);
  } else {
    clearTimeout(timeoutID);
    bufferedPaths.push(path);
    timeoutID = setTimeout(()=>{showNotificationFromBuffer();}, 2000);
  }
}

function showNotificationFromBuffer() {
  if (sps.maxDLbuffer > 0 && bufferedPaths.length > sps.maxDLbuffer) {
    showAggregatedNotification();
  } else {
    for (let path of bufferedPaths) {
      showDownloadCompleteNotification(path);
    }
  }

  bufferedPaths = [];
  timeoutID = null;
}

function showAggregatedNotification() {
  let title = _("download_finished") + " (" + bufferedPaths.length + ")";
  let text = bufferedPaths.reduce((text, path)=>{
    return (text == "" ? "" : text + " ") + utils.getFilename(path);
  }, "");
  let path = bufferedPaths[bufferedPaths.length-1];

  // Below only makes sense for some linux distros e.g. KDE, Gnome Shell
  // If linux and libnotify is inited, add "Open" button:
  // <input text="Open" type="submit"/>
  if (sps.engine === 1 && notifApi && system.platform === "linux")
    text = text+"<input text='"+_("open")+"' type='submit'/>";

  // Generate standard desktop notification
  const notifications = require("sdk/notifications");
  notifications.notify({
    title: title,
    text: text,
    iconURL: utils.getIcon(),
    onClick: ()=>{utils.openDir(path);}
  });
}

function showDownloadCompleteNotification(path) {
  const filename = utils.getFilename(path);

  let title = _("download_finished");
  let text = filename;

  // If engine = 1 & linux & supports action buttons, add 2 actions:
  // open file & open folder
  if (sps.engine === 1 &&
      notifApi &&
      system.platform === "linux" &&
      notifApi.checkButtonsSupported()) {

    // Fix for Plasma4: Space on buttons is small so using short labels
    const plasma = notifApi.checkPlasma();

    let id = null;
    let actions;
    if (sps.clickOption == 0) {
      actions = [{
        label: plasma ? _("Folder") : _("Open_folder"),
        handler: ()=>{
          utils.openDir(path);
          if (id && notifApi && sps.engine === 1 && system.platform === "linux")
            notifApi.close(id);
        }
      }, {
        label: plasma ? _("File") : _("Open_file"),
        handler: ()=>{
          utils.openFile(path);
          if (id && notifApi && sps.engine === 1 && system.platform === "linux")
            notifApi.close(id);
        }
      }];
    } else {
      actions = [{
        label: plasma ? _("File") : _("Open_file"),
        handler: ()=>{
          utils.openFile(path);
          if (id && notifApi && sps.engine === 1 && system.platform === "linux")
            notifApi.close(id);
        }
      }, {
        label: plasma ? _("Folder") : _("Open_folder"),
        handler: ()=>{
          utils.openDir(path);
          if (id && notifApi && sps.engine === 1 && system.platform === "linux")
            notifApi.close(id);
        }
      }];
    }
    /* eslint-disable no-unused-vars */
    id = notifApi.notifyWithActions(utils.getIcon(), title, text,
      system.name, reason=>{}, actions);
    if (id)
      return;
    /* eslint-enable no-unused-vars */
  }

  // Below only makes sense for some linux distros e.g. KDE, Gnome Shell
  // If linux and libnotify is inited, add "Open" button:
  // <input text="Open" type="submit"/>
  if (sps.engine === 1 && notifApi && system.platform === "linux")
    text = text+"<input text='"+_("open")+"' type='submit'/>";

  // Generate standard desktop notification
  const notifications = require("sdk/notifications");
  notifications.notify({
    title: title,
    text: text,
    iconURL: utils.getIcon(),
    onClick: ()=>{
      if (sps["clickOption"] == 0) {
        utils.openDir(path);
      } else {
        utils.openFile(path);
      }
    }
  });
}

function testNotification() {
  Task.spawn(function*() {
    try {
      let list = yield Downloads.getList(Downloads.ALL);
      let download = yield Downloads.createDownload({
        source: {
          url: "https://www.mozilla.org"
        },
        target: {
          path: OS.Path.join(OS.Constants.Path.tmpDir, "test-download.html")
        }
      });
      yield list.add(download);
      yield download.start();
    } catch(e) {
      console.error("Unable to test download notification. Exception: " + e);
    }
  }).then(null, Cu.reportError);
}

// Works only for FF<26 and SeaMonkey
const downloadProgressListener = {
  onDownloadStateChange: (aState, aDownload)=>{
    const dm = Cc["@mozilla.org/download-manager;1"].getService(Ci.nsIDownloadManager);
    if (sps.downloadCompleteAlert) {
      switch(aDownload.state) {
      case dm.DOWNLOAD_FINISHED:
        showDownloadCompleteNotification(aDownload.target.path);
        break;
      }
    }
  }
};

// Works only for FF>=26
Task.spawn(function*() {
  try {
    let list = yield Downloads.getList(Downloads.ALL);
    let view = {
      /*onDownloadAdded: (download)=>{
        console.log("onDownloadAdded");
        console.log("  download.launcherPath: " + download.launcherPath);
        console.log("  download.target.path: " + download.target.path);
        console.log("  download.succeeded: " + download.succeeded);
        console.log("  download.progress: " + download.progress);
        console.log("  download.error: " + download.error);
        console.log("  download.stopped: " + download.stopped);
        console.log("  download.target.exists: " + download.target.exists);
      },
      onDownloadRemoved: (download)=>{
        console.log("onDownloadRemoved");
      },*/
      onDownloadChanged: (download)=>{
        /*console.log("onDownloadChanged");*/
        if(sps.downloadCompleteAlert && download.succeeded) {
          if (download.target.exists === undefined || download.target.exists === true) {
            //console.log("onDownloadChanged: " + download.target.path);
            //showDownloadCompleteNotification(download.target.path);
            bufferNotification(download.target.path);
          }
        }
      }
    };
    yield list.addView(view);
  } catch(e) {
    console.error(e);
  }
}).then(null, Cu.reportError);

exports.init = (_notifApi)=>{
  notifApi = _notifApi;

  try {
    // Works only in FF<26 and SeaMonkey
    let dm = Cc["@mozilla.org/download-manager;1"].getService(Ci.nsIDownloadManager);
    dm.addListener(downloadProgressListener);
  } catch(e) {
    // continue regardless of error
  }

  try {
    // Works only in FF<26 and SeaMonkey
    let ps = require("sdk/preferences/service");
    if (sps["downloadCompleteAlert"])
      ps.set("browser.download.manager.showAlertOnComplete", false);
    else
      ps.set("browser.download.manager.showAlertOnComplete", true);
  } catch(e) {
    // continue regardless of error
  }

  const sp = require("sdk/simple-prefs");
  sp.on("testDL", ()=>{
    testNotification();
  });
};

exports.deInit = ()=>{
  notifApi = null;

  // Works only in FF<26
  try {
    let ps = require("sdk/preferences/service");
    ps.set("browser.download.manager.showAlertOnComplete", true);
  } catch(e) {
    // continue regardless of error
  }
};
