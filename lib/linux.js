// linux code
exports = linux = {};

var { Cc, Ci, Cu, Cm, Cr } = require('chrome');
Cu.import("resource://gre/modules/ctypes.jsm", this);

var libc;

linux.checkAvailable = function(){
  try {
    libc = ctypes.open("libnotify.so.4");
    return true;
  } catch (e) {
    try {
      libc = ctypes.open("/usr/local/lib/libnotify.so.4");
      return true;
    } catch (e) {
      return false;
    }
  }
}

linux.notify = function(iconURL, title, text, notifier){
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
  notify_init((typeof(notifier) == "string" && notifier != "") ? notifier : "gnotifier");
  var error = new struct_gerror_ptr;
  var ret = notify_notification_show(
    notify_notification_new(title,text,iconURL),error);
  return ret;
}