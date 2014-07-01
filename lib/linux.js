// linux code
module.exports = linux = {};

var { Cc, Ci, Cu, Cm, Cr } = require('chrome');
Cu.import("resource://gre/modules/ctypes.jsm", this);

var libc;
var callbackFunArray = [];

var serverCapabilities = [];
var serverName;
var serverVendor;
var serverVersion;
var serverSpecVersion;

function showServerInfo() {
  
  var notify_get_server_info = libc.declare("notify_get_server_info",ctypes.default_abi,ctypes.bool,ctypes.char.ptr.ptr,ctypes.char.ptr.ptr,ctypes.char.ptr.ptr,ctypes.char.ptr.ptr);
  var ret_name = new ctypes.char.ptr;
  var ret_vendor = new ctypes.char.ptr;
  var ret_version = new ctypes.char.ptr;
  var ret_spec_version = new ctypes.char.ptr;
  
  notify_get_server_info(ret_name.address(),ret_vendor.address(),ret_version.address(),ret_spec_version.address());
  
  console.log("libnotify server info:");
  console.log("name: " + ret_name.readString());
  console.log("vendor: " + ret_vendor.readString());
  console.log("version: " + ret_version.readString());
  console.log("spec_version: " + ret_spec_version.readString());
}

function showServerCapabilities() {
  
  const struct_glist = new ctypes.StructType("GList",[{ "data": ctypes.voidptr_t },{ "next": ctypes.voidptr_t },{ "prev": ctypes.voidptr_t }]); 
  var notify_get_server_caps = libc.declare("notify_get_server_caps",ctypes.default_abi,struct_glist.ptr);
  var server_caps = ctypes.cast(notify_get_server_caps(),struct_glist.ptr);
  
  console.log("libnotify server capabilities:");
  while (!server_caps.isNull()) {
    var cap = server_caps.contents.addressOfField("data").contents;
    console.log(ctypes.cast(cap,ctypes.char.ptr).readString());
    server_caps = ctypes.cast(server_caps.contents.addressOfField("next").contents,struct_glist.ptr);
  }
}

function checkServerInfo() {
  
  var notify_get_server_info = libc.declare("notify_get_server_info",ctypes.default_abi,ctypes.bool,ctypes.char.ptr.ptr,ctypes.char.ptr.ptr,ctypes.char.ptr.ptr,ctypes.char.ptr.ptr);
  var ret_name = new ctypes.char.ptr;
  var ret_vendor = new ctypes.char.ptr;
  var ret_version = new ctypes.char.ptr;
  var ret_spec_version = new ctypes.char.ptr;
  
  notify_get_server_info(ret_name.address(),ret_vendor.address(),ret_version.address(),ret_spec_version.address());
  
  serverName = ret_name.readString();
  serverVendor = ret_vendor.readString();
  serverVersion = ret_version.readString();
  serverSpecVersion = ret_spec_version.readString();
  
  return serverName;
}

function checkServerCapabilities() {
  
  const struct_glist = new ctypes.StructType("GList",[{ "data": ctypes.voidptr_t },{ "next": ctypes.voidptr_t },{ "prev": ctypes.voidptr_t }]); 
  var notify_get_server_caps = libc.declare("notify_get_server_caps",ctypes.default_abi,struct_glist.ptr);
  var server_caps = ctypes.cast(notify_get_server_caps(),struct_glist.ptr);
  
  var retValue = false;
  while (!server_caps.isNull()) {
    var cap = ctypes.cast(server_caps.contents.addressOfField("data").contents,ctypes.char.ptr).readString();
    serverCapabilities.push(cap);
    if (cap === "body")
      retValue = true;
    server_caps = ctypes.cast(server_caps.contents.addressOfField("next").contents,struct_glist.ptr);
  }
  
  console.log("checkServerCapabilities: "+retValue);
  return retValue;
}

linux.checkAvailable = function() {

  var retValue = false;
  try {
    libc = ctypes.open("libnotify.so.4");
    retValue = true;
  } catch (e) {
    try {
      libc = ctypes.open("/usr/local/lib/libnotify.so.4");
      retValue = true;
    } catch (e) {
      retValue = false;
    }
  }
  
  if (retValue) {
    console.log("Notify server name: " + checkServerInfo());
    retValue = checkServerCapabilities();
  }
  
  return retValue;
}

linux.notify = function(iconURL, title, text, notifier, closeHandler, clickHandler){
  
  //showServerInfo();
  //showServerCapabilities();
  
  // Getting input tags from text
  var input = "";
  var _text = text.replace(/<[\/]{0,1}(input|INPUT)[^><]*>/g,function(match){
    input = / text='([^']*)'/g.exec(match)[1]; return "";
  });
  
  const struct_gerror = new ctypes.StructType("GError",
    [ { "gerror_domain": ctypes.uint32_t },
      { "gerror_code": ctypes.int },
      { "gerror_message": ctypes.char.ptr }]);    
  const struct_gerror_ptr = new ctypes.PointerType(struct_gerror);
  const struct_notification = new ctypes.StructType("NotifyNotification");

  var notify_init = libc.declare("notify_init", ctypes.default_abi, ctypes.bool, ctypes.char.ptr);    
  var notify_is_initted = libc.declare("notify_is_initted", ctypes.default_abi, ctypes.bool);
  var notify_notification_new = libc.declare(
    "notify_notification_new", ctypes.default_abi,
    struct_notification.ptr, ctypes.char.ptr,
    ctypes.char.ptr, ctypes.char.ptr);  
  var notify_notification_show = libc.declare(
    "notify_notification_show", ctypes.default_abi, ctypes.bool,
    struct_notification.ptr, struct_gerror_ptr);
  
  // Initing libnotify
  notify_init(notifier);
  if (!notify_is_initted()) {
    console.log("Notify is not inited!");
    return false;
  }
  
  // Creating notification
  var notification = notify_notification_new(title,_text,iconURL);
  
  // Adding action
  if (clickHandler && typeof(clickHandler)==="function" && input!="" && serverCapabilities.indexOf("actions")!=-1) {
    console.log("Action label is: " + input);
    const actionFunType = ctypes.FunctionType(ctypes.default_abi,ctypes.void_t,[struct_notification.ptr,ctypes.char.ptr,ctypes.voidptr_t]).ptr;
    var notify_notification_add_action = libc.declare("notify_notification_add_action",ctypes.default_abi,ctypes.void_t,struct_notification.ptr,ctypes.char.ptr,ctypes.char.ptr,ctypes.voidptr_t,ctypes.voidptr_t,ctypes.voidptr_t);
    // Defing callback function for action
    var actionFun = actionFunType(function(notification, action, data){
      clickHandler();
      
      // Closing notification
      //var notify_notification_close = libc.declare("notify_notification_close",ctypes.default_abi,ctypes.bool,struct_notification.ptr,struct_gerror_ptr);
      //var error = new struct_gerror_ptr;
      //notify_notification_close(notification,error.ptr);

    });
    callbackFunArray.push(actionFun);
    notify_notification_add_action(notification,ctypes.char.array()("default"),ctypes.char.array()(input),actionFun,ctypes.char.array()("gnotifier"),null);
  }
  
  // Showing notification
  var error = new struct_gerror_ptr;
  if (!notify_notification_show(notification,error)) {
    console.log("Notify_notification_show fails:");
    console.log("error code: " + error.fields["gerror_code"]);
    console.log("error message: " + error.fields["gerror_message"].readString());
    return false;
  }
  
  // Connecting closed signal
  if (closeHandler && typeof(closeHandler)==="function") {
    const callbackFunType = ctypes.FunctionType(ctypes.default_abi,ctypes.void_t,[struct_notification.ptr, ctypes.voidptr_t]).ptr;
    var g_signal_connect_data = libc.declare("g_signal_connect_data",ctypes.default_abi,ctypes.unsigned_long,ctypes.voidptr_t,ctypes.char.ptr,ctypes.voidptr_t,ctypes.voidptr_t,ctypes.voidptr_t,ctypes.unsigned_int);
    
    // Defing callback function for 'closed' signal
    var callbackFun = callbackFunType(function(notification, data){
      closeHandler();
    });
    
    callbackFunArray.push(callbackFun);
    g_signal_connect_data(notification,ctypes.char.array()("closed"),callbackFun,ctypes.char.array()("gnotifier"),null,0);
  }
  
  
    
  return true;
}