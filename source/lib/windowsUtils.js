// Windows helper functions

var { Cc, Ci, Cu, Cm, Cr } = require("chrome");
Cu.import('resource://gre/modules/Services.jsm');
Cu.import('resource://gre/modules/ctypes.jsm');
Cu.import("resource://gre/modules/FileUtils.jsm");

// Open Explorer with file selection
// Reference: https://support.microsoft.com/en-us/kb/314853
exports.openExplorer = function (file) {
  var env = Cc["@mozilla.org/process/environment;1"].getService(Ci.nsIEnvironment);
  var process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
  process.init(new FileUtils.File(env.get("windir")+"\\explorer.exe"));
  process.runAsync(["/select,", file], 2);
}

// Brings FF/TB window to the front on Windows
// Author: Noitidart <https://noitidart.github.io/>
// Source: https://stackoverflow.com/questions/32031856/bring-firefox-window-to-the-front-using-firefox-addon/32038880#32038880

if (ctypes.voidptr_t.size == 4 /* 32-bit */ ) {
    var is64bit = false;
} else if (ctypes.voidptr_t.size == 8 /* 64-bit */ ) {
    var is64bit = true;
} else {
    throw new Error('huh??? not 32 or 64 bit?!?!');
}

var user32 = ctypes.open('user32.dll');

var GetForegroundWindow = user32.declare('GetForegroundWindow', ctypes.winapi_abi,
    ctypes.voidptr_t // return
);

var DWORD = ctypes.uint32_t;
var LPDWORD = DWORD.ptr;

var GetWindowThreadProcessId = user32.declare('GetWindowThreadProcessId', ctypes.winapi_abi,
    DWORD, // return
    ctypes.voidptr_t, // hWnd
    LPDWORD // lpdwProcessId
);

var AttachThreadInput = user32.declare('AttachThreadInput', ctypes.winapi_abi,
    ctypes.bool, // return
    DWORD, // idAttach
    DWORD, // idAttachTo
    ctypes.bool // fAttach
);

var SetForegroundWindow = user32.declare('SetForegroundWindow', ctypes.winapi_abi,
    ctypes.bool, // return BOOL
    ctypes.voidptr_t // HWND
);

exports.forceFocus = function (window) {
    if (!window) {
        console.log("window is undefined");
        return false;
    }

    var hToBaseWindow = window.QueryInterface(Ci.nsIInterfaceRequestor)
        .getInterface(Ci.nsIWebNavigation)
        .QueryInterface(Ci.nsIDocShellTreeItem)
        .treeOwner
        .QueryInterface(Ci.nsIInterfaceRequestor)
        .getInterface(Ci.nsIBaseWindow);

    var hToString = hToBaseWindow.nativeHandle;
    var hTo = ctypes.voidptr_t(ctypes.UInt64(hToString));


    var hFrom = GetForegroundWindow();
    if (hFrom.isNull()) {
        var rez_SetSetForegroundWindow = SetForegroundWindow(hTo);
        return true;
    }

    if (hTo.toString() == hFrom.toString()) {
        console.log('window is already focused');
        return true;
    }

    var pid = GetWindowThreadProcessId(hFrom, null);

    var _threadid = GetWindowThreadProcessId(hTo, null); // _threadid is thread of my firefox id, and hTo is that of my firefox id so this is possible to do

    if (pid == _threadid) {
        var rez_SetSetForegroundWindow = SetForegroundWindow(hTo);
        return true;
    }

    var rez_AttachThreadInput = AttachThreadInput(_threadid, pid, true)
    if (!rez_AttachThreadInput) {
        throw new Error('failed to attach thread input');
    }
    var rez_SetSetForegroundWindow = SetForegroundWindow(hTo);
    var rez_AttachThreadInput = AttachThreadInput(_threadid, pid, false)
}
