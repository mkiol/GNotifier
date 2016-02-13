// osx
module.exports = osx = {};
var system = require("sdk/system");

var { Cc, Ci, Cu, Cm, Cr } = require('chrome');
Cu.import("resource://gre/modules/ctypes.jsm");

let objc = ctypes.open(ctypes.libraryName("objc"));

let id = ctypes.voidptr_t;
let SEL = ctypes.voidptr_t;
let IMP = ctypes.voidptr_t;
let Protocol = ctypes.voidptr_t;

// Import Objective-C Methods
let objc_getClass = objc.declare("objc_getClass",
    ctypes.default_abi,
    id,
    ctypes.char.ptr);
let sel_registerName = objc.declare("sel_registerName",
    ctypes.default_abi,
    SEL,
    ctypes.char.ptr);
let objc_msgSend = objc.declare("objc_msgSend",
    ctypes.default_abi,
    id,
    id,
    SEL,
    "...");

let objc_allocateClassPair = objc.declare("objc_allocateClassPair",
    ctypes.default_abi,
    id,
    id,
    ctypes.char.ptr,
    ctypes.size_t);

let objc_registerClassPair = objc.declare("objc_registerClassPair",
    ctypes.default_abi,
    id,
    id);

let class_addMethod = objc.declare("class_addMethod",
    ctypes.default_abi,
    ctypes.bool,
    id,
    SEL,
    IMP,
    ctypes.char.ptr);

let objc_getProtocol = objc.declare("objc_getProtocol",
    ctypes.default_abi,
    Protocol,
    ctypes.char.ptr);

let class_addProtocol = objc.declare("class_addProtocol",
    ctypes.default_abi,
    ctypes.bool,
    id,
    Protocol);


let NSString = objc_getClass("NSString");
let stringWithUTF8String = sel_registerName("stringWithUTF8String:");

// Method to make a new NSString
function makeString(input){
    let x = objc_msgSend(NSString, stringWithUTF8String, ctypes.char.array()(input));
    return x;
}

osx.checkAvailable = function(){
    //osx.notify(null, "okHello Sノラガミ - Noragami OP ", "TEST");
    return true; // no idea lol
}

let NSUserNotificationCenter = objc_getClass("NSUserNotificationCenter");
let defaultUserNotificationCenter = sel_registerName("defaultUserNotificationCenter");
let nC = objc_msgSend(NSUserNotificationCenter, defaultUserNotificationCenter);
let deliverNotification = sel_registerName("deliverNotification:")

// Class to override OSX's NSUserNotificationCenterDelegate
let NSObject = objc_getClass("NSObject")
let delegate = objc_allocateClassPair( NSObject, "kennydudeNotificationCentreDelegate", 0 );

// Return true
function rT(x, y, z){
    return true;
}
let shouldPresentNotification = sel_registerName("userNotificationCenter:shouldPresentNotification:");
let fType = ctypes.FunctionType( ctypes.default_abi, ctypes.bool, [id, SEL, id] );
let callback = fType.ptr( rT );
let r = class_addMethod( delegate, shouldPresentNotification, callback, "{NSUserNotification=#}");

// Do the ObjC shit
objc_registerClassPair(delegate);

let NSUserNotificationCenterDelegate = objc_getProtocol("NSUserNotificationCenterDelegate");
r = class_addProtocol( delegate, NSUserNotificationCenterDelegate );

let alloc = sel_registerName("alloc");
let init = sel_registerName("init");
let delegateInstance = objc_msgSend(objc_msgSend(delegate, alloc), init);

let setDelegate = sel_registerName("setDelegate:");
objc_msgSend( nC, setDelegate, delegateInstance );

let NSNotification = objc_getClass("NSUserNotification");

// Do a real notification
osx.notify = function(iconURL, title, text, notifier){
    try{
        let notification = objc_msgSend(objc_msgSend(NSNotification, alloc), init); // make instance

        // setTitle
        let setTitle = sel_registerName("setTitle:");
        objc_msgSend( notification, setTitle, makeString(title) );

        // setInformativeText
        let setInformativeText = sel_registerName("setInformativeText:");
        objc_msgSend( notification, setInformativeText, makeString(text) );

        // Send Notification (nC is out NSUserNotificationCentre)
        objc_msgSend( nC, deliverNotification, notification );
        return true;
    } catch(e){ return false; }
}
