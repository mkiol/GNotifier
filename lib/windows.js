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
      var callbackPtr = ctypes.FunctionType(ctypes.stdcall_abi, ctypes.void_t).ptr;
      var DisplayToastNotification = winToast.declare("DisplayToastNotification",
                                     ctypes.winapi_abi,
                                     ctypes.bool,
                                     ctypes.jschar.ptr,
                                     ctypes.jschar.ptr,
                                     ctypes.jschar.ptr,
                                     ctypes.jschar.ptr,
                                     callbackPtr,
                                     callbackPtr);
									 
    var closeCallback = null;
    if (closeHandler && typeof(closeHandler)==="function") {
      closeCallback = callbackPtr(function(){
        closeHandler();
      });
    }
	
    var clickCallback = null;
    if (clickHandler && typeof(clickHandler)==="function") {
      clickCallback = callbackPtr(function(){
        clickHandler();
      });
    }
	
    return DisplayToastNotification(iconURL, title, text, notifier, clickCallback, closeCallback);
	
  } catch(e){ return false; }
}