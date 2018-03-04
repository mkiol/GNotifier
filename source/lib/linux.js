/**
 * GNotifier - Firefox/Thunderbird add-on that replaces
 * built-in notifications with the OS native notifications
 *
 * Licensed under GNU General Public License 3.0 or later.
 * Some rights reserved. See COPYING, AUTHORS.
 *
 * @license GPL-3.0 <https://www.gnu.org/licenses/gpl-3.0.html>
 */

// This file is using libnotify, which is the client-side
// implementation of the org.freedesktop.Notifications D-Bus
// interface.
//
// Relevant specification descriptions can be found here:
// https://people.gnome.org/~mccann/docs/notification-spec/
//
// In the code, checking for "1.2" or other server versions
// refers to the version implemented server-side.

const {Cu} = require("chrome");

Cu.import("resource://gre/modules/ctypes.jsm", this);
const _ = require("sdk/l10n").get;
const utils = require("./utils.js");
const sps = require("sdk/simple-prefs").prefs;
const system = require("sdk/system");

let libc = null;
let actionsCallbackFunArray = [];
let closedCallbackFunArray = [];
let notificationMap = new Map();

let serverCapabilities = [];
let serverName;

/* eslint-disable no-unused-vars */
let serverVendor;
let serverVersion;
/* eslint-enable no-unused-vars */
let serverSpecVersion;


// libnotify data types
const struct_gerror = new ctypes.StructType("GError", [{"gerror_domain": ctypes.uint32_t}, {"gerror_code": ctypes.int}, {"gerror_message": ctypes.char.ptr}]);
const struct_gerror_ptr = new ctypes.PointerType(struct_gerror);
const struct_notification = new ctypes.StructType("NotifyNotification");
const struct_glist = new ctypes.StructType("GList",[{ "data": ctypes.voidptr_t },{ "next": ctypes.voidptr_t },{ "prev": ctypes.voidptr_t }]);
const struct_gvariant = new ctypes.StructType("GVariant");
const callbackFunType = ctypes.FunctionType(ctypes.default_abi, ctypes.void_t, [struct_notification.ptr, ctypes.voidptr_t]).ptr;
const actionFunType = ctypes.FunctionType(ctypes.default_abi, ctypes.void_t, [struct_notification.ptr, ctypes.char.ptr, ctypes.voidptr_t]).ptr;
let g_variant_new_string;
let notify_init;
let notify_uninit;
let notify_is_initted;
let notify_set_app_name;
let notify_notification_new;
let notify_notification_set_hint;
let notify_notification_set_timeout;
let notify_notification_show;
let notify_notification_close;
let g_signal_connect_data;
//let g_signal_handler_disconnect;
let notify_get_server_info;
let notify_get_server_caps;
let notify_notification_add_action;
let notify_notification_get_closed_reason;

const c_close_handler = callbackFunType(handleClose);
const c_action_handle = actionFunType(handleAction);

/* eslint-disable no-unused-vars */
function showServerInfo() {
  let ret_name = new ctypes.char.ptr;
  let ret_vendor = new ctypes.char.ptr;
  let ret_version = new ctypes.char.ptr;
  let ret_spec_version = new ctypes.char.ptr;

  notify_get_server_info(ret_name.address(),ret_vendor.address(),ret_version.address(),ret_spec_version.address());

  console.log("libnotify server info:");
  console.log("name: " + ret_name.readString());
  console.log("vendor: " + ret_vendor.readString());
  console.log("version: " + ret_version.readString());
  console.log("spec_version: " + ret_spec_version.readString());
}

function showServerCapabilities() {
  let server_caps = ctypes.cast(notify_get_server_caps(),struct_glist.ptr);
  console.log("libnotify server capabilities:");
  while (!server_caps.isNull()) {
    let cap = server_caps.contents.addressOfField("data").contents;
    console.log(ctypes.cast(cap,ctypes.char.ptr).readString());
    server_caps = ctypes.cast(server_caps.contents.addressOfField("next").contents,struct_glist.ptr);
  }
}
/* eslint-enable no-unused-vars */

function checkServerInfo() {
  let ret_name = new ctypes.char.ptr;
  let ret_vendor = new ctypes.char.ptr;
  let ret_version = new ctypes.char.ptr;
  let ret_spec_version = new ctypes.char.ptr;

  notify_get_server_info(ret_name.address(),ret_vendor.address(),ret_version.address(),ret_spec_version.address());

  serverName = ret_name.readString();
  serverVendor = ret_vendor.readString();
  serverVersion = ret_version.readString();
  serverSpecVersion = ret_spec_version.readString();

  return serverName;
}

function checkServerCapabilities() {
  let server_caps = ctypes.cast(notify_get_server_caps(),struct_glist.ptr);

  let retValue = false;
  while (!server_caps.isNull()) {
    let cap = ctypes.cast(server_caps.contents.addressOfField("data").contents,ctypes.char.ptr).readString();
    serverCapabilities.push(cap);
    if (cap === "body")
      retValue = true;
    server_caps = ctypes.cast(server_caps.contents.addressOfField("next").contents,struct_glist.ptr);
  }

  return retValue;
}

function handleAction(notification, action, data) {
  if (!data.isNull()) {
    // Getting handler from actionsCallbackFunArray by action_id
    // action_id is pointer value of 'data' arg
    const action_id = ctypes.cast(data, ctypes.uintptr_t).value.toString();
    let notification_id; //undefined

    for(let i = 0; i < actionsCallbackFunArray.length; i++){
      if(actionsCallbackFunArray[i]["action_id"] == action_id){
        notification_id = actionsCallbackFunArray[i]["notification_id"];
        //console.log("Calling action handler...")
        actionsCallbackFunArray[i]["handler"]();
      }
    }

    // Deleting all actions with notification_id
    if (notification_id !== undefined) {
      for(let i = actionsCallbackFunArray.length -1; i >= 0 ; i--){
        if(actionsCallbackFunArray[i]["notification_id"] == notification_id){
          //console.log("Deleting action for " + notification_id)
          actionsCallbackFunArray.splice(i, 1);
        }
      }
    }

  } else {
    console.warn("handleAction: Data is null!");
  }
}

/*function disconnectCloseHandlers() {
  let l = closedCallbackFunArray.length;
  for (let i = 0; i < l; i++) {
    let notification_id = closedCallbackFunArray[i]["notification_id"];

    if (notificationMap.has(notification_id)) {
      let notification = notificationMap[notification_id];
      let handler_id = closedCallbackFunArray[i]["handlerId"];

      if (handler_id > 0) {
        console.log("Disconnecting close handler: " + handler_id);
        g_signal_handler_disconnect(notification, handler_id);
      }
    }
  }
}*/

function handleClose(notification, data) {
  if (!data.isNull()) {
    // Getting handler from closedCallbackFunArray by notification_id
    // notification_id is pointer value of 'data' arg
    const notification_id = ctypes.cast(data, ctypes.uintptr_t).value.toString();

    //console.log("Notification " + notification_id + " has been closed.");
    if (notificationMap.has(notification_id))
      notificationMap.delete(notification_id);

    let i = closedCallbackFunArray.length;
    while (i > 0 && closedCallbackFunArray.length > 0) {
      i--;
      if (closedCallbackFunArray[i]["notification_id"] === notification_id) {
        closedCallbackFunArray[i]["handler"](
          notify_notification_get_closed_reason(notification));
        closedCallbackFunArray.splice(i, 1);
        break;
      }
    }

    // Deleting all actions with notification_id
    for (let i = actionsCallbackFunArray.length -1; i >= 0 ; i--) {
      if (actionsCallbackFunArray[i]["notification_id"] == notification_id){
        //console.log("Deleting action for " + notification_id)
        actionsCallbackFunArray.splice(i, 1);
      }
    }

  } else {
    console.log("handleClose: Data is null!");
  }
}

function escapeUnsupportedTags(text) {
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
      return allowed ? $0 : utils.escapeTags($0);
    });
}

exports.checkButtonsSupported = ()=>{
  if (serverCapabilities.indexOf("actions")===-1)
    return false;
  return true;
};

exports.checkOverlayIconSupported = ()=>{
  if (serverCapabilities.indexOf("x-eventd-overlay-icon")===-1)
    return false;
  return true;
};

exports.checkPlasma = ()=>{
  if (serverName === "Plasma")
    return true;
  return false;
};

exports.init = ()=>{
  /*if (libc) {
    console.log("Closing libnotify");
    libc.close();
    libc = null;
  }*/

  if (!libc) {
    console.log("Opening libnotify");
    try {
      libc = ctypes.open("libnotify.so.4");
    } catch (e) {
      try {
        libc = ctypes.open("/usr/local/lib/libnotify.so.4");
      } catch (e) {
        console.error(e);
      }
    }
  }

  if (!libc) {
    console.error("Libnotify library not found!");
    return false;
  }

  // Initing data types
  g_variant_new_string = libc.declare("g_variant_new_string",
    ctypes.default_abi, struct_gvariant.ptr, ctypes.char.ptr);
  notify_init = libc.declare("notify_init", ctypes.default_abi,
    ctypes.bool, ctypes.char.ptr);
  notify_uninit = libc.declare("notify_uninit", ctypes.default_abi,
    ctypes.void_t);
  notify_is_initted = libc.declare("notify_is_initted",
    ctypes.default_abi, ctypes.bool);
  notify_set_app_name = libc.declare("notify_set_app_name",
    ctypes.default_abi, ctypes.void_t, ctypes.char.ptr);
  notify_notification_new = libc.declare(
    "notify_notification_new", ctypes.default_abi,
    struct_notification.ptr, ctypes.char.ptr,
    ctypes.char.ptr, ctypes.char.ptr);
  notify_notification_set_hint = libc.declare(
    "notify_notification_set_hint", ctypes.default_abi, ctypes.void_t,
    struct_notification.ptr, ctypes.char.ptr, struct_gvariant.ptr);
  notify_notification_set_timeout = libc.declare(
    "notify_notification_set_timeout", ctypes.default_abi, ctypes.bool,
    struct_notification.ptr, ctypes.int);
  notify_notification_show = libc.declare(
    "notify_notification_show", ctypes.default_abi, ctypes.bool,
    struct_notification.ptr, struct_gerror_ptr);
  notify_notification_close = libc.declare(
    "notify_notification_close", ctypes.default_abi, ctypes.bool,
    struct_notification.ptr, struct_gerror_ptr);
  g_signal_connect_data = libc.declare("g_signal_connect_data",
    ctypes.default_abi, ctypes.unsigned_long, ctypes.voidptr_t,
    ctypes.char.ptr, ctypes.voidptr_t, ctypes.voidptr_t,
    ctypes.voidptr_t, ctypes.unsigned_int);
  /*g_signal_handler_disconnect = libc.declare("g_signal_handler_disconnect",
    ctypes.default_abi, ctypes.void_t, ctypes.voidptr_t, ctypes.unsigned_long);*/
  notify_get_server_info = libc.declare("notify_get_server_info",
    ctypes.default_abi,ctypes.bool,ctypes.char.ptr.ptr,
    ctypes.char.ptr.ptr,ctypes.char.ptr.ptr,ctypes.char.ptr.ptr);
  notify_get_server_caps = libc.declare("notify_get_server_caps",
    ctypes.default_abi,struct_glist.ptr);
  notify_notification_add_action = libc.declare("notify_notification_add_action",
    ctypes.default_abi, ctypes.void_t, struct_notification.ptr,
    ctypes.char.ptr, ctypes.char.ptr, ctypes.voidptr_t, ctypes.voidptr_t,
    ctypes.voidptr_t);
  notify_notification_get_closed_reason = libc.declare(
    "notify_notification_get_closed_reason",
    ctypes.default_abi, ctypes.int, struct_notification.ptr);

  // Initing libnotify
  console.log("Initing libnotify");
  if (!notify_init(system.name)) {
    console.error("Unable to init libnotify");
    return false;
  }

  checkServerInfo();
  //console.log("Notify server name: " + checkServerInfo());
  let ret = checkServerCapabilities();
  // Debug...
  //showServerInfo();
  //showServerCapabilities();
  return ret;
};

exports.deInit = ()=>{
  exports.closeAll();
  //disconnectCloseHandlers();

  actionsCallbackFunArray = [];
  closedCallbackFunArray = [];
  notificationMap.clear();

  // Uniniting libnotify
  console.log("Uniniting libnotify");
  notify_uninit();

  /*if (libc) {
    console.log("Closing libnotify");
    libc.close();
  }*/
};

exports.closeAll = ()=>{
  for(let id of notificationMap.keys()) {
    exports.close(id);
  }
};

exports.close = id=>{
  try {
    if (notificationMap.has(id)) {
      let error = new struct_gerror_ptr;
      if (!notify_notification_close(notificationMap.get(id), error)) {
        console.error("Notify_notification_close fails");
      }
      //console.log("Request to close notification " + id + " has been sent.");
      notificationMap.delete(id);
    }
  } catch (e) {
    console.error(e);
  }
};

exports.notify = (iconURL, title, text, notifier, closeHandler, clickHandler)=>{
  // Getting <input text=?> from text; by default is "open"
  let input = _("open");
  let _text = text.replace(/<[/]{0,1}(input|INPUT)[^><]*>/g, (match)=>{
    let inp = / text='([^']*)'/g.exec(match);
    if (inp !== null)
      input = inp[1];
    return "";
  });

  // Creating array with "open" action if clickHandler and actions supported
  if (clickHandler && typeof(clickHandler)==="function" && serverCapabilities.indexOf("actions") != -1) {
    let actions = [{ default: true, label: input, handler: clickHandler }];
    return exports.notifyWithActions(iconURL, title, _text, notifier, closeHandler, actions);
  }

  return exports.notifyWithActions(iconURL, title, _text, notifier, closeHandler, null);
};

exports.notifyWithActions = (iconURL, title, text, notifier, closeHandler, actionsList)=>{
  // Escape unsupported tags
  text = escapeUnsupportedTags(text);

  if (!notify_is_initted()) {
    console.error("Notify is not inited!");
    return false;
  }

  if (exports.checkPlasma()) {
    // Plasma5 aggregates notifications with the same title and app_name.
    // Actions on aggregated notification are broken. The workaround is
    // to generate unique app_name per every notification
    notifier = notifier + "-" + utils.randStr(3);
  }
  notify_set_app_name(notifier);

  const image_path_hint_name = "image-path";
  let image_path_hint = null;

  if (exports.checkOverlayIconSupported()) {
    // This server can dispaly both an icon and an image
    // We pass it both
    switch (serverSpecVersion) {
    case "1.2":
      // From the specification (1.1 and 1.2):
      // "image-data hint should be either an URI (file://) or a name in a
      // freedesktop.org-compliant icon theme"
      if (!utils.isUrlValid(iconURL)) {
        if (iconURL.charAt(0) == "/") {
          iconURL = "file://" + iconURL;
        }
      }

      image_path_hint = g_variant_new_string(iconURL);

      // We can pass the image-data hint, so just pass the regular icon
      // in app_icon, since implementations may dispaly both if possible
      iconURL = utils.getIcon();
      break;
    default:
      console.error("Your org.freedesktop.Notifications server should " +
                    "update to the 1.2 specification");
      return false;
    }
  }

  // Creating notification
  let notification = notify_notification_new(title, text, iconURL);

  const notification_id = ctypes.cast(notification, ctypes.uintptr_t).value.toString();

  if (image_path_hint) {
    notify_notification_set_hint(notification, image_path_hint_name, image_path_hint);
  }

  if (sps.timeoutExpire) {
    if (sps.timeout >= 1) {
      notify_notification_set_timeout(notification, sps["timeout"] * 1000);
    }
  } else {
    notify_notification_set_timeout(notification, 0);
  }

  // Adding actions
  if (actionsList) {
    for (let i in actionsList) {
      const def = actionsList[i]["default"];
      const label = actionsList[i]["label"];
      const handler = actionsList[i]["handler"];

      if (handler && typeof(handler) === "function") {
        // Defing callback function for action
        let user_data_ptr = ctypes.int(i).address();
        const action_id = ctypes.cast(user_data_ptr, ctypes.uintptr_t).value.toString();

        // Default action
        const action_name = (def ? "default" : "gnotifier_"+action_id);

        actionsCallbackFunArray.push({
          "action_id": action_id,
          "notification_id": notification_id,
          "handler": handler
        });

        notify_notification_add_action(
          notification,
          ctypes.char.array()(action_name),
          ctypes.char.array()(label),
          c_action_handle,
          user_data_ptr,
          null
        );
      }
    }
  }

  // Showing notification
  let error = new struct_gerror_ptr;
  if (!notify_notification_show(notification, error)) {
    return false;
  }

  notificationMap.set(notification_id, notification);

  // Connecting closed signal
  if (closeHandler && typeof(closeHandler) === "function") {
    let handlerId = g_signal_connect_data(
      notification,
      ctypes.char.array()("closed"),
      c_close_handler,
      notification,
      null,
      0
    );

    // Defing callback function for 'closed' signal
    closedCallbackFunArray.push({
      "notification_id": notification_id,
      "handler": closeHandler,
      "handlerId": handlerId
    });
  }

  return notification_id;
};
