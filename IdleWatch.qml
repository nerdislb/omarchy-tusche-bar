import QtQuick
import Quickshell.Wayland

// Whether anybody is there: the compositor's idle notification (the same one
// Omarchy's idle service uses), asked only while `active` (the Omi seal is on
// screen and his idle life is not off). It respects idle inhibitors, so a video
// that keeps the screen awake keeps Omi calm too. Reports a lasting absence of
// `seconds`; any input ends it at once.
Item {
  id: watch
  visible: false
  width: 0; height: 0

  property bool active: false
  property int seconds: 20
  readonly property bool idle: active && monitor.isIdle

  IdleMonitor {
    id: monitor
    enabled: watch.active && watch.seconds > 0
    timeout: Math.max(1, watch.seconds)
    respectInhibitors: true
  }
}
