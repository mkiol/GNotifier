/**
 * GNotifier - Firefox/Thunderbird add-on that replaces
 * built-in notifications with the OS native notifications
 *
 * Licensed under GNU General Public License 3.0 or later.
 * Some rights reserved. See COPYING, AUTHORS.
 *
 * @license GPL-3.0 <https://www.gnu.org/licenses/gpl-3.0.html>
 */

const {Cc, Ci, Cu, Cm, components} = require("chrome");

Cu.import("resource://gre/modules/Timer.jsm");
Cu.import("resource://gre/modules/FileUtils.jsm");
Cu.import("resource://gre/modules/NetUtil.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");
Cu.import("resource://gre/modules/Task.jsm");
Cu.import("resource://gre/modules/Downloads.jsm");

const _ = require("sdk/l10n").get;
const utils = require("./utils.js");
const sps = require("sdk/simple-prefs").prefs;
const system = require("sdk/system");

const origAlertsServiceFactory = Cm.getClassObject(Cc["@mozilla.org/alerts-service;1"], Ci.nsIFactory);
const origAlertsService = Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService);

let notifApi;

function showDownloadCompleteNotification(path) {
  const filename = path.replace(/^.*[\\\/]/, "");

  // Check if file extension is excluded
  const ext = utils.getFileExtension(filename).toLowerCase();
  if (sps.excludedExtensionsList !== "") {
    const excludedExtensionsList = sps["excludedExtensionsList"].split(",");
    for (let i = 0; i < excludedExtensionsList.length; i++) {
      const eext = excludedExtensionsList[i].toLowerCase().trim();
      if (ext === eext) {
        // File extension is excluded
        return;
      }
    }
  }

  let title = _("download_finished");
  let text = filename;

  // If engine = 1 & linux & supports action buttons, add 2 actions:
  // open file & open folder
  if (sps.engine === 1 &&
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
  if (sps.engine === 1 && system.platform === "linux")
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
      onDownloadChanged: (download)=>{
        if(sps.downloadCompleteAlert && download.succeeded) {
          if (download.target.exists === undefined || download.target.exists === true) {
            //console.log("onDownloadChanged: " + download.target.path);
            showDownloadCompleteNotification(download.target.path);
          }
        }
      }
    };
    yield list.addView(view);
  } catch(e) {
    console.error(e);
  }
}).then(null, Cu.reportError);

// New implmentation of Alert Service
function AlertsService() {}
AlertsService.prototype = {
  QueryInterface: XPCOMUtils.generateQI([Ci.nsIAlertsService]),
  // New nsIAlertsService API (FF 46)
  showAlert: function(alert, alertListener) {
    this.showAlertNotification(alert.imageURL, alert.title, alert.text,
      alert.textClickable, alert.cookie, alertListener, alert.name,
      alert.dir, alert.lang);
  },
  showAlertNotification: function(imageUrl, title, text, textClickable,
                        cookie, alertListener, name, dir, lang) {
    // Engine 0 - FF built-in
    if (sps.engine === 0) {
      origAlertsService.showAlertNotification(imageUrl, title, text,
        textClickable, cookie, alertListener, name, dir, lang);
      return;
    }

    // Engine 2 - custom command
    if (sps.engine === 2) {
      if (sps.command !== "") {
        let command = sps["command"];
        command = command.replace("%image",imageUrl);
        command = command.replace("%title",title);
        command = command.replace("%text",text);
        utils.execute(command);
      }
      return;
    }

    function GNotifier_AlertsService_showAlertNotification_cb(iconPath) {
      let id = null;

      /* eslint-disable no-unused-vars */
      let closeHandler = reason=>{
        if(alertListener) {
          alertListener.observe(null, "alertfinished", cookie);
        }
      /* eslint-enable no-unused-vars */
      };

      let clickHandler = textClickable ? ()=>{
        if(alertListener) {
          alertListener.observe(null, "alertclickcallback", cookie);
          if (id && notifApi && sps.engine === 1 && system.platform === "linux")
            notifApi.close(id);
        }
      } : null;

      // Send notification via notifyApi implemenation
      id = notifApi.notify(iconPath, title, text, system.name,
        closeHandler, clickHandler);
      if (id) {
        // Generating "alertshow"
        if(alertListener) {
          alertListener.observe(null, "alertshow", cookie);
        }
      } else {
        console.error("Notify fails!");
      }
    }

    if (!imageUrl) {
      GNotifier_AlertsService_showAlertNotification_cb("");
      return;
    }

    try {
      // Try using a local icon file URL
      let imageURI = NetUtil.newURI(imageUrl);
      let iconFile = imageURI.QueryInterface(Ci.nsIFileURL).file;
      GNotifier_AlertsService_showAlertNotification_cb(iconFile.path);
    } catch(e) {
      try {
        let imageHash = "gnotifier-"+utils.getHash(imageUrl);
        let tempIconFile = FileUtils.getFile("TmpD", ["gnotifier", imageHash]);
        if (tempIconFile.exists()) {
          // icon file exists in tmp, using tmp file
          GNotifier_AlertsService_showAlertNotification_cb(tempIconFile.path);
        } else {
          // icon file doesn't exist in tmp, downloading icon to tmp file
          let imageFile = NetUtil.newChannel(imageUrl);
          NetUtil.asyncFetch(imageFile, (imageStream,result)=>{
            if (!components.isSuccessCode(result)) {
              console.warn("NetUtil.asyncFetch error! result:", result);
              return;
            }
            // Create temporary local file
            // (Required since I don't want to manually
            //  populate a GdkPixbuf...)
            tempIconFile.createUnique(
              Ci.nsIFile.NORMAL_FILE_TYPE,
              FileUtils.PERMS_FILE
            );
            let iconStream = FileUtils.openSafeFileOutputStream(tempIconFile);
            NetUtil.asyncCopy(imageStream, iconStream, function(result) {
              if (!components.isSuccessCode(result)) {
                console.log("NetUtil.asyncCopy error! result:", result);
                return;
              }
              GNotifier_AlertsService_showAlertNotification_cb(tempIconFile.path);
              iconStream.close();
              imageStream.close();
            });
          });
        }
      } catch(e) {
        GNotifier_AlertsService_showAlertNotification_cb(imageUrl);
      }
    }
  }
};

function deleteTempFiles() {
  const tempDir = FileUtils.getDir("TmpD",["gnotifier"]);
  const entries = tempDir.directoryEntries;
  while(entries.hasMoreElements()) {
    let entry = entries.getNext();
    entry.QueryInterface(Ci.nsIFile);
    let filename = entry.path.replace(/^.*[\\\/]/, "");
    if (filename.substring(0, 10) === "gnotifier-")
      entry.remove(false);
  }
}

/* eslint-disable no-unused-vars */
exports.main = (options, callbacks)=>{
/* eslint-enable no-unused-vars */
  if (!notifApi) {
    if (system.platform === "winnt") {
      notifApi = require("./windows.js");
    } else {
      notifApi = require("./linux.js");
    }
  }

  const sp = require("sdk/simple-prefs");

  if(notifApi.init()) {
    // Replace alert-service
    const contract = "@mozilla.org/alerts-service;1";
    let registrar = Cm.QueryInterface(Ci.nsIComponentRegistrar);

    // Unregister built-in alerts-service class factory
    registrar.unregisterFactory(
      Cc[contract],
      Cm.getClassObject(Cc[contract], Ci.nsIFactory)
    );

    // Register new factory
    registrar.registerFactory(
      Cc[contract],
      "GNotifier Alerts Service",
      contract,
      XPCOMUtils.generateSingletonFactory(AlertsService)
    );

    // Close notification button
    sp.on("close", function() {
      if (system.platform !== "linux") {
        utils.showGnotifierNotification("This works only in Linux!");
        return;
      }
      if (sps.engine !== 1) {
        utils.showGnotifierNotification("This works only if \"Notification engine\" is set to \"Gnotifier\"!");
        return;
      }
      notifApi.closeAll();
    });

  } else {
    notifApi = null;
    console.error("Notification API init has failed!");
    return;
  }

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

  // Thunderbird init
  if (system.name == "Thunderbird" ||
      system.name == "SeaMonkey" ||
      system.name == "Icedove") {
    let thunderbird = require("./thunderbird.js");
    thunderbird.init();
  } else {
    sp.on("test", ()=>{
      utils.showGnotifierNotification("This works only in Thunderbird!");
    });
    sp.on("testAggregated", ()=>{
      utils.showGnotifierNotification("This works only in Thunderbird!");
    });
  }
};

exports.onUnload = (reason)=>{
  console.log("Unload reason: " + reason);
  deleteTempFiles();

  if (!notifApi) {
    return;
  }

  notifApi.deInit();
  notifApi = null;

  // Unregister current alerts-service class factory
  const contract = "@mozilla.org/alerts-service;1";
  let registrar = Cm.QueryInterface(Ci.nsIComponentRegistrar);
  registrar.unregisterFactory(
    Cc[contract],
    Cm.getClassObject(Cc[contract], Ci.nsIFactory)
  );

  // Register orig alert service factory
  registrar.registerFactory(
    Cc[contract],
    "Orig Alerts Service",
    contract,
    origAlertsServiceFactory
  );

  // Works only in FF<26
  try {
    let ps = require("sdk/preferences/service");
    ps.set("browser.download.manager.showAlertOnComplete", true);
  } catch(e) {
    // continue regardless of error
  }

  // Thunderbird deinit
  if (system.name == "Thunderbird" ||
      system.name == "SeaMonkey" ||
      system.name == "Icedove") {
    let thunderbird = require("./thunderbird.js");
    thunderbird.deInit();
  }
};
