/**
 * GNotifier - Firefox/Thunderbird add-on that replaces
 * built-in notifications with the OS native notifications
 *
 * Licensed under GNU General Public License 3.0 or later.
 * Some rights reserved. See COPYING, AUTHORS.
 *
 * @license GPL-3.0 <https://www.gnu.org/licenses/gpl-3.0.html>
 */

const {Cu} = require("chrome");

Cu.import("resource://gre/modules/ctypes.jsm");
Cu.import("resource://gre/modules/FileUtils.jsm");

let dllName;
let callbackFunArray = [];
let winToast = null;

if (ctypes.voidptr_t.size == 4) {
  dllName = "ToastNotification.dll";
} else {
  dllName = "ToastNotification64.dll";
}

exports.init = ()=>{
  if (winToast) {
    winToast.close();
    winToast = null;
  }
  try {
    winToast = ctypes.open(FileUtils.getFile("ProfD",
      ["extensions", "jid1-OoNOA6XBjznvLQ@jetpack", "resources", "gnotifier", "data", dllName]).path);
  } catch (e) {
    console.error(e);
  }

  if (!winToast) {
    console.error("Unable to load " + dllName);
    return false;
  }

  let setAppId = winToast.declare("SetAppId", ctypes.winapi_abi, ctypes.bool);
  return setAppId();
};

exports.deInit = ()=>{
  if (winToast)
    winToast.close();
};

// Do a real notification
exports.notify = (iconURL, title, text, notifier, closeHandler, clickHandler)=>{
  try{
    const clickCallbackType = ctypes.FunctionType(ctypes.stdcall_abi, ctypes.void_t).ptr;
    const closeCallbackType = ctypes.FunctionType(ctypes.stdcall_abi, ctypes.void_t).ptr;
    let DisplayToastNotification = winToast.declare("DisplayToastNotification",
      ctypes.winapi_abi,
      ctypes.bool,
      ctypes.jschar.ptr,
      ctypes.jschar.ptr,
      ctypes.jschar.ptr,
      ctypes.jschar.ptr,
      clickCallbackType,
      closeCallbackType);

    let closeCallback = null;
    if (closeHandler && typeof(closeHandler)==="function") {
      closeCallback = closeCallbackType(()=>{closeHandler();});
      callbackFunArray.push(closeCallback);
    }

    let clickCallback = null;
    if (clickHandler && typeof(clickHandler)==="function") {
      clickCallback = clickCallbackType(()=>{clickHandler();});
      callbackFunArray.push(clickCallback);
    }

    return DisplayToastNotification(iconURL, title, text,
      notifier, clickCallback, closeCallback);

  } catch (e){
    console.error(e);
    return false;
  }
};
