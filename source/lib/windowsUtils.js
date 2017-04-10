// Windows helper functions
const {Cc, Ci, Cu} = require("chrome");

Cu.import("resource://gre/modules/Services.jsm");
Cu.import("resource://gre/modules/ctypes.jsm");
Cu.import("resource://gre/modules/FileUtils.jsm");

// Open Explorer with file selection
// Reference: https://support.microsoft.com/en-us/kb/314853
exports.openExplorer = (file)=>{
  const env = Cc["@mozilla.org/process/environment;1"].getService(Ci.nsIEnvironment);
  const process = Cc["@mozilla.org/process/util;1"].createInstance(Ci.nsIProcess);
  process.init(new FileUtils.File(env.get("windir")+"\\explorer.exe"));
  process.runAsync(["/select,", file], 2);
};

// Brings FF/TB window to the front on Windows
// Author: Noitidart <https://noitidart.github.io/>
// Source: https://stackoverflow.com/questions/32031856/bring-firefox-window-to-the-front-using-firefox-addon/32038880#32038880

const user32 = ctypes.open("user32.dll");

const GetForegroundWindow = user32.declare("GetForegroundWindow", ctypes.winapi_abi,
    ctypes.voidptr_t // return
);

const DWORD = ctypes.uint32_t;
const LPDWORD = DWORD.ptr;

const GetWindowThreadProcessId = user32.declare("GetWindowThreadProcessId", ctypes.winapi_abi,
    DWORD, // return
    ctypes.voidptr_t, // hWnd
    LPDWORD // lpdwProcessId
);

const AttachThreadInput = user32.declare("AttachThreadInput", ctypes.winapi_abi,
    ctypes.bool, // return
    DWORD, // idAttach
    DWORD, // idAttachTo
    ctypes.bool // fAttach
);

const SetForegroundWindow = user32.declare("SetForegroundWindow", ctypes.winapi_abi,
    ctypes.bool, // return BOOL
    ctypes.voidptr_t // HWND
);

exports.forceFocus = (window)=>{
  if (!window) {
    console.log("window is undefined");
    return false;
  }

  let hToBaseWindow = window.QueryInterface(Ci.nsIInterfaceRequestor)
      .getInterface(Ci.nsIWebNavigation)
      .QueryInterface(Ci.nsIDocShellTreeItem)
      .treeOwner
      .QueryInterface(Ci.nsIInterfaceRequestor)
      .getInterface(Ci.nsIBaseWindow);

  let hToString = hToBaseWindow.nativeHandle;
  let hTo = ctypes.voidptr_t(ctypes.UInt64(hToString));


  let hFrom = GetForegroundWindow();
  if (hFrom.isNull()) {
    SetForegroundWindow(hTo);
    return true;
  }

  if (hTo.toString() == hFrom.toString()) {
    console.log("window is already focused");
    return true;
  }

  let pid = GetWindowThreadProcessId(hFrom, null);

  let _threadid = GetWindowThreadProcessId(hTo, null); // _threadid is thread of my firefox id, and hTo is that of my firefox id so this is possible to do

  if (pid == _threadid) {
    SetForegroundWindow(hTo);
    return true;
  }

  let rez_AttachThreadInput = AttachThreadInput(_threadid, pid, true);
  if (!rez_AttachThreadInput) {
    throw new Error("failed to attach thread input");
  }
  SetForegroundWindow(hTo);
  AttachThreadInput(_threadid, pid, false);
};
