/**
 * GNotifier - Firefox/Thunderbird add-on that replaces
 * built-in notifications with the OS native notifications
 *
 * Licensed under GNU General Public License 3.0 or later.
 * Some rights reserved. See COPYING, AUTHORS.
 *
 * @license GPL-3.0 <https://www.gnu.org/licenses/gpl-3.0.html>
 */

const {Cc, Ci} = require("chrome");

const system = require("sdk/system");
const sps = require("sdk/simple-prefs").prefs;
//var Application = Cc["@mozilla.org/steel/application;1"].getService(Ci.steelIApplication);

exports.openFile = (path)=>{
  //console.log("openFile path: " + path);
  const ioService = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
  let uri = ioService.newURI("file://"+path, null, null);
  if (uri instanceof Ci.nsIFileURL) {
    uri.file.launch();
  }
};

exports.showGnotifierNotification = (text)=>{
  //const data = require("sdk/self").data;
  const notifications = require("sdk/notifications");
  notifications.notify({
    title: "GNotifier",
    text: text,
    //iconURL: data.url("gnotifier.png")
    iconURL: exports.getIcon()
  });
};

exports.openDir = (path)=>{
  //console.log("openDir path: " + path);
  if (system.platform === "winnt") {
    // Executing Explorer with file selection
    const wu = require("./windowsUtils.js");
    wu.openExplorer(path);
  } else {
    exports.openFile(path.replace(/[^\\/]*$/, ""));
  }
};

exports.randStr = (length)=>{
  // Source: https://stackoverflow.com/a/1349426
  let text = "";
  let possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

  for (var i = 0; i < length; i++)
    text += possible.charAt(Math.floor(Math.random() * possible.length));

  return text;
};

exports.getHash = (text)=>{
  let hash = 0;
  let chr;
  if (text.length === 0) return hash;
  for (let i = 0, len = text.length; i < len; i++) {
    chr = text.charCodeAt(i);
    hash  = ((hash << 5) - hash) + chr;
    //hash |= 0; // Convert to 32bit integer
  }
  return (hash > 0) ? hash : 0 - hash;
};

function getFileUrltoResource(path) {
  let data = require("sdk/self").data;
  let url = require("sdk/url");
  return "file://" + url.toFilename(data.url(path));
}

exports.getIcon = ()=>{
  // Windows already attaches the program icon to notifications,
  // but some icons are not displayed well, so will provided by gnotifier

  let picon = sps["notifyIcon"];
  const isWin = system.platform === "winnt";

  if (picon == "default") {
    if (system.name === "Firefox")
      return isWin ? getFileUrltoResource("firefox.png") : "firefox";
    if (system.name === "Thunderbird")
      return isWin ? getFileUrltoResource("thunderbird.png") : "thunderbird";
    if (system.name === "SeaMonkey")
      return isWin ? getFileUrltoResource("seamonkey.png") : "seamonkey";
    if (system.name === "Pale Moon")
      return isWin ? getFileUrltoResource("palemoon.png") : "palemoon";
    if (system.name === "Waterfox")
      return isWin ? getFileUrltoResource("waterfox.png") : "waterfox";
    if (system.name === "IceCat")
      return isWin ? getFileUrltoResource("icecat.png") : "icecat";
    if (system.name === "Icedove")
      return isWin ? "" : "icedove";
    if (system.name === "Iceweasel")
      return isWin ? "" : "iceweasel";

    // default GNotifier icon for linux, or built-in icon for windows
    return isWin ? "" : getFileUrltoResource("gnotifier.png");
  }

  // Extra named icons
  if (picon === "gnotifier")
    return getFileUrltoResource("gnotifier.png");
  if (picon === "aurora")
    return getFileUrltoResource("aurora.png");
  if (picon === "nightly")
    return getFileUrltoResource("nightly.png");

  return picon;
};

exports.isUrlValid = (s)=>{
  // Source: http://dzone.com/snippets/validate-url-regexp
  const re = /(http|https|file):\/\/(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\\/]))?/;
  let ret = re.test(s);
  //console.log("isUrlValid: " + s + " " + ret);
  return ret;
};

exports.escapeTags = (text)=>{
  let map = {
    "<": "&lt;",
    ">": "&gt;"
  };

  return text.replace(/[<>]/g, function(m) {
    return map[m];
  });
};

exports.escapeUnsupportedTags = (text)=>{
  // Source: https://stackoverflow.com/a/31259386

  // Allowed markups:
  //  <b> ... </b> Bold
  //  <i> ... </i> Italic
  //  <u> ... </u> Underline
  //  <a href="..."> ... </a> Hyperlink
  //  <img src="..." alt="..."/> Image
  // Reference: https://developer.gnome.org/notification-spec/#markup

  const allowedTags = "<b><i><u><a><img><input>";
  const disallowedEntities = "&tab;&newline;&nbsp;";

  const tags = /<\/?([a-z][a-z0-9]*)\b[^>]*>/gi;
  const commentsAndPhpTags = /<!--[\s\S]*?-->|<\?(?:php)?[\s\S]*?\?>/gi;
  const entries = /(&[^;]*;)/gi;

  return text
    .replace(commentsAndPhpTags, "")
    .replace(entries, function($0, $1) {
      return disallowedEntities.indexOf($1.toLowerCase()) > -1 ? "" : $0;
    })
    .replace(tags, function($0, $1) {
      // Return allowed tags and escape others
      const allowed = allowedTags.indexOf("<" + $1.toLowerCase() + ">") > -1;
      return allowed ? $0 : exports.escapeTags($0);
    });
};

exports.escapeShell = (text)=>{
  if (system.platform === "linux") {
    return text.replace(/(["\s'$`\\])/g,"\\$1");
  } else {
    return text;
  }
};

exports.plain = (s)=>{
  // Reference: https://developer.mozilla.org/en-US/Add-ons/Overlay_Extensions/
  //         XUL_School/DOM_Building_and_HTML_Insertion#Safely_Using_Remote_HTML
  const parser = Cc["@mozilla.org/parserutils;1"].getService(Ci.nsIParserUtils);
  const flags = parser.SanitizerDropNonCSSPresentation | parser.SanitizerDropForms;
  s = parser.convertToPlainText(s, flags, 0);
  return s;
};

exports.sanitize = (s)=>{
  // Reference: https://developer.mozilla.org/en-US/Add-ons/Overlay_Extensions/
  //         XUL_School/DOM_Building_and_HTML_Insertion#Safely_Using_Remote_HTML
  const parser = Cc["@mozilla.org/parserutils;1"].getService(Ci.nsIParserUtils);
  const flags = parser.SanitizerDropNonCSSPresentation | parser.SanitizerDropForms;
  s = parser.sanitize(s, flags);
  const re = /<body\s*[^>]*>([\S\s]*?)<\/body>/i;
  let match = re.exec(s);

  return match[1];
};

exports.getFilename = (path)=> {
  if (path)
    return path.replace(/^.*[\\/]/, "");
  return "";
};

exports.getFileExtension = (filename)=>{
  // Source: http://stackoverflow.com/a/1203361
  let a = filename.split(".");
  if (a.length === 1 || ( a[0] === "" && a.length === 2 ) ) {
    return "";
  }
  return a.pop().trim();
};

exports.execute = function(command) {
  const child_process = require("sdk/system/child_process");
  const { env } = require("sdk/system/environment");
  let c;
  let c_env;
  if (system.platform === "winnt") {
    c_env = {env: {
      "ALLUSERSPROFILE":env.ALLUSERSPROFILE,
      "APPDATA":env.APPDATA,
      "CommonProgramFiles":env.CommonProgramFiles,
      "CommonProgramW6432":env.CommonProgramW6432,
      "COMPUTERNAME":env.COMPUTERNAME,
      "ComSpec":env.ComSpec,
      "FPS_BROWSER_APP_PROFILE_STRING":env.FPS_BROWSER_APP_PROFILE_STRING,
      "FPS_BROWSER_USER_PROFILE_STRING":env.FPS_BROWSER_USER_PROFILE_STRING,
      "HOMEDRIVE":env.HOMEDRIVE,
      "HOMEPATH":env.HOMEPATH,
      "LOCALAPPDATA":env.LOCALAPPDATA,
      "LOGONSERVER":env.LOGONSERVER,
      "NUMBER_OF_PROCESSORS":env.NUMBER_OF_PROCESSORS,
      "OS":env.OS,
      "Path":env.Path,
      "PATHEXT":env.PATHEXT,
      "PROCESSOR_ARCHITECTURE":env.PROCESSOR_ARCHITECTURE,
      "PROCESSOR_IDENTIFIER":env.PROCESSOR_IDENTIFIER,
      "PROCESSOR_LEVEL":env.PROCESSOR_LEVEL,
      "PROCESSOR_REVISION":env.PROCESSOR_REVISION,
      "ProgramData":env.ProgramData,
      "ProgramFiles":env.ProgramFiles,
      "ProgramW6432":env.ProgramW6432,
      "PROMPT":"$P$G",
      "PSModulePath":env.PSModulePath,
      "PUBLIC":env.PUBLIC,
      "SESSIONNAME":env.SESSIONNAME,
      "SystemDrive":env.SystemDrive,
      "SystemRoot":env.SystemRoot,
      "TEMP":env.TEMP,
      "TMP":env.TMP,
      "USERDOMAIN":env.USERDOMAIN,
      "USERDOMAIN_ROAMINGPROFILE":env.USERDOMAIN_ROAMINGPROFILE,
      "USERNAME":env.USERNAME,
      "USERPROFILE":env.USERPROFILE,
      "windir":env.windir
    }};
  } else {
    c_env = {env: {
      "USER":env.USER,
      "HOME":env.HOME,
      "ALSA_CONFIG_PATH":env.ALSA_CONFIG_PATH,
      "AUDIODRIVER":env.AUDIODRIVER,
      "DBUS_SESSION_BUS_ADDRESS":env.DBUS_SESSION_BUS_ADDRESS,
      "DISPLAY":env.DISPLAY,
      "PATH":env.PATH,
      "JAVA_BINDIR":env.JAVA_BINDIR,
      "JAVA_HOME":env.JAVA_HOME,
      "JAVA_ROOT":env.JAVA_ROOT,
      "JRE_HOME":env.JRE_HOME,
      "DESKTOP_SESSION":env.DESKTOP_SESSION
    }};
  }

  c = child_process.exec(command, c_env);

  c.stdout.on("data", function (data) {
    console.log("command stdout: " + data);
  });

  c.stderr.on("data", function (data) {
    console.log("command stderr: " + data);
  });
};
