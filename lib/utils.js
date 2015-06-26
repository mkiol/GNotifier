// Utils
module.exports = utils = {};

var { Cc, Ci, Cu, Cm, Cr } = require('chrome');
var _ = require('sdk/l10n').get;

utils.openFile = function (val) {
    //console.log("val: "+val);
    var ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
    var uri = ioService.newURI(val, null, null);
    if (uri instanceof Ci.nsIFileURL) {
        uri.file.QueryInterface(Ci.nsILocalFile).launch();
    }

    /*var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsILocalFile);
    file.initWithPath(val);
    file.launch();*/
}

// Gets icon for notification based on 'system.name' or 'notifyIcon' param
utils.getIcon = function () {
    var sps = require("sdk/simple-prefs").prefs;
    var system = require("sdk/system");

    console.log("system.name",system.name);

    var picon = sps['notifyIcon'];

    // Windows already attaches the program icon to notifications
    if (system.platform == "winnt") {
        picon = "";
    }

    if (picon == "default") {

        if (system.name == "Iceweasel")
            picon = "iceweasel";
        if (system.name == "Thunderbird")
            picon = "thunderbird";
        if (system.name == "Firefox")
            picon = "firefox";
        if (system.name == "SeaMonkey")
            picon = "seamonkey";
        if (system.name == "Pale Moon")
            picon = "palemoon";

        // default Firefox icon
        if (picon == "default")
            picon = "firefox";
    }
    return picon;
}
