import QtQuick
import "../bridge" as Bridge
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Commons as Commons

// Current temperature next to the native weather widget (same location as
// the weather panel, from Open-Meteo). Custom QML module of the Tusche Bar:
//   { "id": "tusche.centre", "source": ".../modules/Centre.qml" }
// The weather and world-clock widgets stay native: their popups place
// themselves through the bar's centre section.
Item {
  id: root

  property var bar: null
  property string moduleName: "tusche.centre"
  property var settings: ({})
  readonly property int barSize: bar && bar.barSize ? bar.barSize : Style.bar.sizeHorizontal
  readonly property color fg: bar && bar.barForeground ? bar.barForeground : Commons.Color.bar.text
  readonly property string home: Quickshell.env("HOME")

  visible: temperature !== ""
  implicitHeight: barSize
  implicitWidth: label.implicitWidth + Style.space(6)

  Text { renderType: Text.NativeRendering;
    id: label
    anchors.verticalCenter: parent.verticalCenter
    text: root.temperature
    font.family: Style.font.family; font.pixelSize: Style.font.bodySmall
    color: Bridge.ModuleBus.secondary(root, root.fg, 0.75)
  }

  property string temperature: ""
  property var location: null
  FileView {
    path: root.home + "/.local/state/omarchy/settings/weather.json"
    printErrors: false
    watchChanges: true
    onFileChanged: reload()
    onLoaded: { try { root.location = JSON.parse(text()) } catch (e) { root.location = null }; root.fetch() }
  }
  Process {
    id: proc
    stdout: StdioCollector {
      onStreamFinished: {
        try {
          var t = JSON.parse(text).current.temperature_2m
          if (isFinite(Number(t))) root.temperature = Math.round(Number(t)) + "°"
        } catch (e) {}
      }
    }
  }
  function fetch() {
    var l = location
    if (!l || !isFinite(Number(l.latitude)) || !isFinite(Number(l.longitude)) || proc.running) return
    proc.command = ["curl", "-fsS", "--max-time", "8", "https://api.open-meteo.com/v1/forecast?latitude=" + Number(l.latitude)
                    + "&longitude=" + Number(l.longitude) + "&current=temperature_2m&timezone=auto"]
    proc.running = true
  }
  Timer { interval: 15 * 60000; running: true; repeat: true; onTriggered: root.fetch() }
  Timer { interval: 4000; running: root.temperature === ""; repeat: true; onTriggered: root.fetch() }
}
