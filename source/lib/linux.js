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

var { Cc, Ci, Cu, Cm, Cr } = require('chrome');
Cu.import("resource://gre/modules/ctypes.jsm", this);
var _ = require('sdk/l10n').get;

var libc = null;
var actionsCallbackFunArray = [];
var closedCallbackFunArray = [];

var serverCapabilities = [];
var serverName;
var serverVendor;
var serverVersion;
var serverSpecVersion;

// libnotify data types
const struct_gerror = new ctypes.StructType("GError", [{"gerror_domain": ctypes.uint32_t}, {"gerror_code": ctypes.int}, {"gerror_message": ctypes.char.ptr}]);
const struct_gerror_ptr = new ctypes.PointerType(struct_gerror);
const struct_notification = new ctypes.StructType("NotifyNotification");
const struct_glist = new ctypes.StructType("GList",[{ "data": ctypes.voidptr_t },{ "next": ctypes.voidptr_t },{ "prev": ctypes.voidptr_t }]);
const struct_gvariant = new ctypes.StructType("GVariant");
const callbackFunType = ctypes.FunctionType(ctypes.default_abi, ctypes.void_t, [struct_notification.ptr, ctypes.voidptr_t]).ptr;
const actionFunType = ctypes.FunctionType(ctypes.default_abi, ctypes.void_t, [struct_notification.ptr, ctypes.char.ptr, ctypes.voidptr_t]).ptr;
var g_variant_new_string;
var notify_init;
var notify_is_initted;
var notify_notification_new;
var notify_notification_set_hint;
var notify_notification_show;
var g_signal_connect_data;
var notify_get_server_info;
var notify_get_server_caps;
var notify_notification_add_action;
var notify_notification_get_closed_reason;

var c_close_handler = callbackFunType(handleClose);
var c_action_handle = actionFunType(handleAction);

function showServerInfo () {
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

function showServerCapabilities () {
    var server_caps = ctypes.cast(notify_get_server_caps(),struct_glist.ptr);
    console.log("libnotify server capabilities:");
    while (!server_caps.isNull()) {
        var cap = server_caps.contents.addressOfField("data").contents;
        console.log(ctypes.cast(cap,ctypes.char.ptr).readString());
        server_caps = ctypes.cast(server_caps.contents.addressOfField("next").contents,struct_glist.ptr);
    }
}

function checkServerInfo () {
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

function checkServerCapabilities () {
    var server_caps = ctypes.cast(notify_get_server_caps(),struct_glist.ptr);

    var retValue = false;
    while (!server_caps.isNull()) {
        var cap = ctypes.cast(server_caps.contents.addressOfField("data").contents,ctypes.char.ptr).readString();
        serverCapabilities.push(cap);
        if (cap === "body")
        retValue = true;
        server_caps = ctypes.cast(server_caps.contents.addressOfField("next").contents,struct_glist.ptr);
    }

    return retValue;
}

function handleAction (notification, action, data) {
  if (!data.isNull()) {
    // Getting handler from actionsCallbackFunArray by action_id
    // action_id is pointer value of 'data' arg
    var action_id = ctypes.cast(data, ctypes.uintptr_t).value.toString();
    var notification_id; //undefined

    for(var i = 0; i < actionsCallbackFunArray.length; i++){
        if(actionsCallbackFunArray[i]["action_id"] == action_id){
            notification_id = actionsCallbackFunArray[i]["notification_id"];
            //console.log("Calling action handler...")
            actionsCallbackFunArray[i]["handler"]();
        }
    }

    // Deleting all actions with notification_id
    if (notification_id !== undefined) {
      for(var i = actionsCallbackFunArray.length -1; i >= 0 ; i--){
          if(actionsCallbackFunArray[i]["notification_id"] == notification_id){
              //console.log("Deleting action for " + notification_id)
              actionsCallbackFunArray.splice(i, 1);
          }
      }
    }

  } else {
      console.log("Data is null!");
  }
}

function handleClose (notification, data) {
  if (!data.isNull()) {
    // Getting handler from closedCallbackFunArray by notification_id
    // notification_id is pointer value of 'data' arg
    var notification_id = ctypes.cast(data, ctypes.uintptr_t).value.toString();
    var i = closedCallbackFunArray.length
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
    for(var i = actionsCallbackFunArray.length -1; i >= 0 ; i--){
        if(actionsCallbackFunArray[i]["notification_id"] == notification_id){
            //console.log("Deleting action for " + notification_id)
            actionsCallbackFunArray.splice(i, 1);
        }
    }

  } else {
    console.log("Data is null!");
  }
}

exports.checkButtonsSupported = function () {
  if (serverCapabilities.indexOf("actions")==-1)
    return false;
  return true;
}

exports.checkOverlayIconSupported = function () {
  if (serverCapabilities.indexOf("x-eventd-overlay-icon")==-1)
    return false;
  return true;
}

exports.checkPlasma = function () {
  if (serverName === "Plasma")
    return true;
  return false;

}

exports.init = function () {
    if (libc) {
        libc.close();
        libc = null;
    }

    try {
        libc = ctypes.open("libnotify.so.4");
    } catch (e) {
        try {
            libc = ctypes.open("/usr/local/lib/libnotify.so.4");
        } catch (e) {
            console.log(e);
        }
    }

    if (!libc) {
        console.log("Libnotify library not found!");
        return false;
    }

    // Initing data types
    g_variant_new_string = libc.declare("g_variant_new_string",
      ctypes.default_abi, struct_gvariant.ptr, ctypes.char.ptr);
    notify_init = libc.declare("notify_init", ctypes.default_abi,
      ctypes.bool, ctypes.char.ptr);
    notify_is_initted = libc.declare("notify_is_initted",
      ctypes.default_abi, ctypes.bool);
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
    g_signal_connect_data = libc.declare("g_signal_connect_data",
      ctypes.default_abi, ctypes.unsigned_long, ctypes.voidptr_t,
      ctypes.char.ptr, ctypes.voidptr_t, ctypes.voidptr_t,
      ctypes.voidptr_t, ctypes.unsigned_int);
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

    checkServerInfo();
    //console.log("Notify server name: " + checkServerInfo());
    retValue = checkServerCapabilities();

    // Debug...
    //showServerInfo();
    //showServerCapabilities();
    return true;
}

exports.deInit = function() {
  actionsCallbackFunArray = [];
  closedCallbackFunArray = [];

  if (libc)
    libc.close();
}

exports.notify = function (iconURL, title, text, notifier, closeHandler, clickHandler) {
    // Getting input tag from text; by default is "open"
    var input = _("open");
    var _text = text.replace(/<[\/]{0,1}(input|INPUT)[^><]*>/g,function(match){
      input = / text='([^']*)'/g.exec(match)[1]; return "";
    });

    // Creating array with "open" action if clickHandler and actions supported
    if (clickHandler && typeof(clickHandler)==="function" && serverCapabilities.indexOf("actions") != -1) {
        var actions = [{ label: input, handler: clickHandler }];
        return exports.notifyWithActions(iconURL, title, _text, notifier, closeHandler, actions);
    }

    return exports.notifyWithActions(iconURL, title, _text, notifier, closeHandler, null);
}

exports.notifyWithActions = function (iconURL, title, text, notifier, closeHandler, actionsList) {
    // Sanitization
    var utils = require("./utils.js");
    text = utils.sanitize(text);

    // Initing libnotify
    notify_init(notifier);
    if (!notify_is_initted()) {
        console.log("Notify is not inited!");
        return false;
    }

    var image_path_hint_name = "image-path";
    var image_path_hint = null;

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
            console.log("Your org.freedesktop.Notifications server should update to the 1.2 specification");
            return false;
        }
    }

    // Creating notification
    var notification = notify_notification_new(title, text, iconURL);
    var notification_id = ctypes.cast(notification, ctypes.uintptr_t).value.toString();

    if (image_path_hint) {
        notify_notification_set_hint(notification, image_path_hint_name, image_path_hint);
    }

    var sps = require("sdk/simple-prefs").prefs;
    if (sps['timeoutExpire']) {
        if (sps['timeout'] >= 1)
          notify_notification_set_timeout(notification, sps['timeout'] * 1000);
    } else {
        notify_notification_set_timeout(notification, 0);
    }

    // Adding actions
    if (actionsList) {
        for (var i in actionsList) {
            var label = actionsList[i]["label"];
            var handler = actionsList[i]["handler"];
            if (handler && typeof(handler) === "function") {
                // Defing callback function for action
                var user_data_ptr = ctypes.int(i).address();
                var action_id = ctypes.cast(user_data_ptr, ctypes.uintptr_t).value.toString();

                // First action will be "default"
                var action_name = (i == 0 ? "default" : "gnotifier_"+action_id);

                actionsCallbackFunArray.push({
                    "action_id": action_id,
                    "notification_id": notification_id,
                    "handler": handler
                });
                notify_notification_add_action(notification, ctypes.char.array()(action_name), ctypes.char.array()(label), c_action_handle, user_data_ptr, null);
            }
        }
    }

    // Showing notification
    var error = new struct_gerror_ptr;
    if (!notify_notification_show(notification, error)) {
        console.log("Notify_notification_show fails:");
        console.log("error code: " + error.fields["gerror_code"]);
        console.log("error message: " + error.fields["gerror_message"].readString());
        return false;
    }

    // Connecting closed signal
    if (closeHandler && typeof(closeHandler) === "function") {
        // Defing callback function for 'closed' signal
        closedCallbackFunArray.push({
            "notification_id": notification_id,
            "handler": closeHandler
        });
        g_signal_connect_data(notification, ctypes.char.array()("closed"), c_close_handler, notification, null, 0);
    }

    return true;
}
