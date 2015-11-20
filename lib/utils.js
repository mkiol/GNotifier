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
	if (system.name == "Icedove")
	  return "icedove";
	
        // default Firefox icon
        return "firefox";
    }
    return picon;
}

// Source: http://dzone.com/snippets/validate-url-regexp
utils.isUrlValid = function (s) {
  var re = /(http|https|file):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?/;
  return re.test(s);
}

utils.sanitize = function(s) {

    // Source: https://developer.mozilla.org/en-US/Add-ons/Overlay_Extensions/XUL_School/DOM_Building_and_HTML_Insertion#Safely_Using_Remote_HTML
  
    var parser = Cc["@mozilla.org/parserutils;1"].getService(Ci.nsIParserUtils);
    s = parser.sanitize(s, parser.SanitizerCidEmbedsOnly);
    var re = /<body\s*[^>]*>([\S\s]*?)<\/body>/i;
    var match = re.exec(s);
    
    return match[1];
  
}
