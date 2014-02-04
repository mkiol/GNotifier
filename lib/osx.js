// osx
module.exports = osx = {};

var { Cc, Ci, Cu, Cm, Cr } = require('chrome');
Cu.import("resource://gre/modules/ctypes.jsm");
/*
let foundation = ctypes.open("/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation");
let CFStringRef = new ctypes.PointerType("CFStringRef");
let CFStringCreateWithCharacters = foundation.declare("CFStringCreateWithCharacters",
                                ctypes.default_abi,
                                CFStringRef,         // returns a new CFStringRef
                                ctypes.voidptr_t,         // allocator
                                ctypes.jschar.ptr,        // pointer to the Unicode string
                                ctypes.int32_t);          // length of the string
*/

let objc = ctypes.open(ctypes.libraryName("objc"));

let id = ctypes.voidptr_t;
let SEL = ctypes.voidptr_t;
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

let NSString = objc_getClass("NSString");
let stringWithUTF8String = sel_registerName("stringWithUTF8String:");

function makeString(input){
	let x = objc_msgSend(NSString, stringWithUTF8String, ctypes.char.array(30)(input));
	return x;
}

var libc;

osx.checkAvailable = function(){
  /*try {
    libc = ctypes.open("/System/Library/Frameworks/Foundation.framework/Foundation");
    return true;
  } catch (e) {
    return false;
  }*/
  osx.notify("", "test", "ok");
  return true; // no idea lol
}

let NSUserNotificationCenter = objc_getClass("NSUserNotificationCenter");
let defaultUserNotificationCenter = sel_registerName("defaultUserNotificationCenter");
let nC = objc_msgSend(NSUserNotificationCenter, defaultUserNotificationCenter);
let deliverNotification = sel_registerName("deliverNotification:")

osx.notify = function(iconURL, title, text, notifier){
	try{
		let NSNotification = objc_getClass("NSUserNotification");
		let alloc = sel_registerName("alloc");
		let init = sel_registerName("init");

		let notification = objc_msgSend(objc_msgSend(NSNotification, alloc), init); // make instance
		
		// setTitle
		let setTitle = sel_registerName("setTitle:");
		objc_msgSend( notification, setTitle, makeString(title) );

		// setInformativeText
		let setInformativeText = sel_registerName("setInformativeText:");
		objc_msgSend( notification, setInformativeText, makeString(text) );

		// Send Notification
		objc_msgSend( nC, deliverNotification, notification );
		return true;
	} catch(e){ return false; }
}