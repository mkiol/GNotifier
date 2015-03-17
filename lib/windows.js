// windows
module.exports = windows = {};
var system = require("sdk/system");

var { Cc, Ci, Cu, Cm, Cr } = require('chrome');
Cu.import("resource://gre/modules/ctypes.jsm");
Cu.import("resource://gre/modules/FileUtils.jsm");

var dllName;

if (ctypes.voidptr_t.size == 4) {
  dllName = "ToastNotification.dll";
} else{
  dllName = "ToastNotification64.dll";
}
var winToast = ctypes.open(FileUtils.getFile("ProfD",
	["extensions", "jid1-OoNOA6XBjznvLQ@jetpack", "resources", "gnotifier", "data", dllName]).path);

windows.checkAvailable = function()
{
  var setAppId = winToast.declare("SetAppId", ctypes.winapi_abi, ctypes.bool);
  return setAppId();
}
// Do a real notification
windows.notify = function(iconURL, title, text, notifier, closeHandler, clickHandler){
  try{
      const clickCallbackType = ctypes.FunctionType(ctypes.stdcall_abi, ctypes.bool).ptr;
      const closeCallbackType = ctypes.FunctionType(ctypes.stdcall_abi, ctypes.bool).ptr;
      var DisplayToastNotification = winToast.declare("DisplayToastNotification",
                                     ctypes.winapi_abi,
                                     ctypes.bool,
                                     ctypes.jschar.ptr,
                                     ctypes.jschar.ptr,
                                     ctypes.jschar.ptr,
                                     ctypes.jschar.ptr,
                                     clickCallbackType,
                                     closeCallbackType);
									 
    var closeCallback = null;
    if (closeHandler && typeof(closeHandler)==="function") {
      closeCallback = closeCallbackType(function(){
        closeHandler();
      });
    }
	
    var clickCallback = null;
    if (clickHandler && typeof(clickHandler)==="function") {
      clickCallback = clickCallbackType(function(){
        clickHandler();
      });
    }
	
    //return DisplayToastNotification(iconURL, title, text, notifier, clickCallback, closeCallback);
    return DisplayToastNotification(iconURL, title, text, notifier, null, null);
	
  } catch(e){ return false; }
}