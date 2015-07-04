/**
 * GNotifier - Add-on for Firefox and Thunderbird. Integrates 
 * notifications with the OS's native notification system.
 *
 * Copyright 2014 by Michal Kosciesza <michal@mkiol.net>
 *
 * Licensed under GNU General Public License 3.0 or later. 
 * Some rights reserved. See COPYING, AUTHORS.
 *
 * @license GPL-3.0 <https://www.gnu.org/licenses/gpl-3.0.html>
 */

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

    // Windows already attaches the program icon to notifications
    var system = require("sdk/system");
    if (system.platform == "winnt")
        return "";

    var sps = require("sdk/simple-prefs").prefs;
    var picon = sps['notifyIcon'];
    if (picon == "default") {
        if (system.name == "Firefox")
            return "firefox";
        if (system.name == "Thunderbird")
            return "thunderbird";
	if (system.name == "Iceweasel")
            return "iceweasel";
        if (system.name == "SeaMonkey")
            return "seamonkey";
        if (system.name == "Pale Moon")
            return "palemoon";
	
        // default Firefox icon
        return "firefox";
    }
    return picon;
}
