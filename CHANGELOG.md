## 1.10.0
  - Enhancements for multiple messages notification. New options: "Title for multiple messages notification", "Text for multiple messages notification", "Click action for multiple messages notification"
  - Delete action. On Linux, every new e-mail notification has now 3 buttons: "Open", "Mark as read" and "Delete"
  - Better notifications for no-subject/no-body emails
  - Linux: Notification is hidden from the tray when the message is marked as read
  - BUG FIX: Notification wasn't displayed when incoming folder and sent folder were the same
  - BUG FIX: All messages notifications stop working after a while (thanks to [gabrielfin](https://github.com/gabrielfin))

## 1.9.8
  - Notification filtering based on filename extension
  - Windows: Support for 'Custom command'
  - Windows: Better icon presentation and support for custom 'Notification Icon' option
  - Windows: Click action on downolad complete notification focuses file
  - Thunderbird: Notification filtering based on mailbox and folder name (thanks to [pd5rm](https://github.com/pd5rm))
  - Thunderbird: Notifications aggregation (in case of many simultaneous new messages)
  - Linux: Default action is triggered by clicking on the whole notification (GNOME, Cinnamon)
  - BUG FIX: Support for multiple RSS accounts (thanks to [Stefan Reichelt](https://github.com/Songworks))

## 1.9.7
  - Thunderbird: Clickable new e-mail notification (thanks to [dffischer](https://github.com/dffischer))

## 1.9.6
  - Linux: Option to execute custom shell command
  - Thunderbird: Customizable new e-mail notification (thanks to [gabrielfin](https://github.com/gabrielfin))
  - Portuguese-Brazilian (pt-BR) translation (thanks to [david721](https://github.com/david721))
  - BUG FIX: Notifications from SentMail, Drafts, Archive and Templates folders should be disabled

## 1.9.5
  - Chinese (zh-CN) translation (thanks to [wsxy162](https://github.com/wsxy162))
  - Russian (ru-RU) translation (thanks to [Vladimir Isaev](https://github.com/VVIsaev))
  - Support for FF >= 46.0b1
  - Thunderbird: Improved new email detection

## 1.9.4
  - Chinese (zh-TW) translation (thanks to [Jeff Huang](https://github.com/s8321414))
  - BUG FIX: DLL missing in XPI for Windows

## 1.9.3
  - Spanish (es) translation (thanks to [Menti](https://github.com/Menti))
  - Option to disable notifications for RSS feeds
  - Compatibility with SOGo Integrator extension
  - Linux: Notification timeout option

## 1.9.1
  - Czech translation
  - Russian (ru-RU) translation (thanks to [Vladimir Isaev](https://github.com/VVIsaev))
  - Turkish (tr) translation (thanks to [Çağdaş Tatar](https://github.com/echelonx))
  - Linux: Provide both image and icon to servers when possible (thanks to [Quentin Glidic](https://github.com/sardemff7))
  - Linux: Better sanitization of notification body
  - Support for Icedove

## 1.9.0
  - Win8+: Thunderbird support (thanks to [Andrew Nagle](https://github.com/kabili207))
  - Linux: Download complete notification with 'Open file' & 'Open folder' buttons
  - Thunderbird: Change notification title to include author (thanks to [Alex Mayer](https://github.com/amayer5125))
  - Thunderbird: Better handling notifications when filtering on folders is enabled
  - Serbian (sr) translation (thanks to [kostich](https://github.com/kostich))
  - Download complete notification default action is 'Open file'
  - BUG FIX: Some temporary files not cleaned properly
  - BUG FIX: Double download complete notification is shown when downloaded file is deleted

## 1.8.9
  - Win8+: Fixed issue with Firefox freezing when displaying notifications

## 1.8.8
  - Win8+ support (thanks to [Andrew Nagle](https://github.com/kabili207))
  - Dutch translation (thanks to Nathan Follens)
  - Estonian (et) translation update (thanks to [Sander Lepik](https://github.com/sander85))
  - BUG FIX: Sender sometimes are not included in a new email notification

## 1.8.7
  - Thunderbird: 'Show simple New mail notification' option in settings
  - BUG FIX: Notification fails to display

## 1.8.6
  - SeaMonkey support
  - Thunderbird: Author/Subject information in new mail notification
  - BUG FIX: Temp files are not deleted if size is zero

## 1.8.5
  - Thunderbird: New mail notification

## 1.8.1
  - Clickable download complete notifications
  - Better closed signal handling

## 1.7.9
  - 'Show Download Complete alert' option in settings
  - Estonian (et) translation (thanks to [Merike Sell](https://github.com/merike))
  - BUG FIX: system.name as libnotify app name

## 1.7.8
  - Thunderbird support

## 1.7.7
  - Hungarian (hu-HU) translation (thanks to [Gyaraki László](https://github.com/gyarakilaszlo))
  - BUG FIX: add-on unload better handling

## 1.7.6
  - Disable custom alert-service for osx

## 1.7.5
  - BUG FIX: icons in notifications

## 1.7.2
  - OSX support (thanks to [Joe Simpson](https://github.com/kennydude))

## 1.7.1
  - Turkish (tr) translation
  - Fixes few translations
