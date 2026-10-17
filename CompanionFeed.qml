import QtQuick
import Quickshell.Io
import "FocusSeal.js" as Model

// What the Tusche Island reports for the focus seal's Omi face: unread
// notifications and failures, agents waiting or working, and a counter that moves
// when an agent finishes. One read of the island's own state IPC every
// `interval` ms, only while `active` (the bar is hidden and the face is shown);
// `omarchy-shell` answers in about 30 ms. Read only: nothing is sent, and
// without the island, or with an older one that has no `companion` object, `island`
// stays null and the face simply has less to say.
Item {
  id: feed
  visible: false
  width: 0; height: 0

  property bool active: false
  property int interval: 2000
  // A few failed reads in a row (the island reloading) do not make it vanish.
  property int tolerance: 3
  // The latest good reading, as FocusSeal.js `island` returns it, or null.
  property var island: null
  property int misses: 0

  onActiveChanged: {
    if (active) { poll(); timer.restart() }
    else { timer.stop(); island = null; misses = 0 }
  }
  function poll() { if (!reader.running) reader.running = true }
  function take(text) {
    var next = null
    try { next = Model.island(JSON.parse(text).companion) } catch (e) {}
    if (next) { island = next; misses = 0 }
    else if (++misses >= tolerance) island = null
  }

  Timer { id: timer; interval: feed.interval; repeat: true; onTriggered: feed.poll() }
  Process {
    id: reader
    command: ["omarchy-shell", "tusche-island", "state"]
    stdout: StdioCollector { onStreamFinished: feed.take(String(text)) }
  }
}
