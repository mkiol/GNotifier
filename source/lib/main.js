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

//Cu.import("resource://gre/modules/Timer.jsm");
Cu.import("resource://gre/modules/FileUtils.jsm");
Cu.import("resource://gre/modules/NetUtil.jsm");
Cu.import("resource://gre/modules/XPCOMUtils.jsm");

const utils = require("./utils.js");
const sps = require("sdk/simple-prefs").prefs;
const system = require("sdk/system");

const origAlertsServiceFactory = Cm.getClassObject(Cc["@mozilla.org/alerts-service;1"], Ci.nsIFactory);
const origAlertsService = Cc["@mozilla.org/alerts-service;1"].getService(Ci.nsIAlertsService);

let notifApi = null;
let thunderbirdApi = null;
let downloadCompleteApi = null;

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

        imageUrl = utils.escapeShell(imageUrl);
        title = utils.escapeShell(title);
        text = utils.escapeShell(text);

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
    let filename = entry.path.replace(/^.*[\\/]/, "");
    console.log("deleteTempFiles: " + entry.path + " " + filename);
    if (filename.substring(0, 10) === "gnotifier-")
      entry.remove(false);
  }
}

/* eslint-disable no-unused-vars */
exports.main = (options, callbacks)=>{
  console.log("Load");

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

  // Test HTML notifications button
  sp.on("devTestButton", function() {
    let rawString = "HTML entities: &lt; &gt; &nbsp; &commat; " +
                    "Tags: <b>Bold</b> <i>Italic</i> <u>Underline</u> " +
                    "<a href=\"https://www.mozilla.org/\">Hyperlink</a> " +
                    "<img src=\"https://www.mozilla.org/media/img/favicon/favicon-196x196.png\" alt=\"Image\"/> " +
                    "Unsupported tags: <strong>Strong<strong> <script>Script</script> <input>Input</input>";
    utils.showGnotifierNotification(rawString);
  });

  // Download complete init
  downloadCompleteApi = require("./download_complete.js");
  downloadCompleteApi.init(notifApi);

  // Thunderbird init
  if (system.name == "Thunderbird" ||
      system.name == "SeaMonkey" ||
      system.name == "Icedove" ||
      system.name == "FossaMail") {
    thunderbirdApi = require("./thunderbird.js");
    thunderbirdApi.init(notifApi);
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

  if (notifApi) {
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
  }

  // Thunderbird deinit
  if (thunderbirdApi) {
    thunderbirdApi.deInit();
    thunderbirdApi = null;
  }

  // Download complete deinit
  if (downloadCompleteApi) {
    downloadCompleteApi.deInit();
    downloadCompleteApi = null;
  }
};
