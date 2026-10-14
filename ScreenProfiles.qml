import QtQuick
import qs.Commons
import qs.Commons as Commons
import "Presets.js" as Presets

// This editor never touches display topology. Only the owned bar modules get
// a presentation override; disconnected outputs keep their explicit choice.
Column {
  id: root
  property var screens: []
  property var profiles: ({})
  property string selected: ""
  signal picked(string name, string profile)
  spacing: Style.space(14)
  readonly property var entries: {
    var out = screens.slice(), names = out.map(function(s) { return s.name })
    Object.keys(profiles || {}).forEach(function(name) {
      if (names.indexOf(name) < 0 && Presets.screenNameValid(name)) out.push({name: name, width: 0, height: 0, disconnected: true})
    })
    return out
  }
  readonly property string chosen: entries.some(function(s) { return s.name === selected }) ? selected : entries.length ? entries[0].name : ""

  Text {
    width: parent.width; wrapMode: Text.WordWrap; textFormat: Text.PlainText
    text: "Choose a screen, then its presentation. Native widgets, accounts, resolution and refresh rate stay unchanged."
    color: Commons.Color.popups.text; font.family: Style.font.family; font.pixelSize: Style.font.body
  }
  Flow {
    width: parent.width; spacing: Style.space(10)
    Repeater {
      model: root.entries
      Rectangle {
        id: screenCard
        required property var modelData
        readonly property bool selected: root.chosen === modelData.name
        width: Math.min(root.width, Style.space(160)); height: Style.space(110)
        color: selected ? Util.alpha(Commons.Color.accent, 0.12) : "transparent"
        border.width: 1; border.color: selected ? Commons.Color.accent : Util.alpha(Commons.Color.popups.text, 0.3)
        Rectangle {
          x: (parent.width - width) / 2; y: Style.space(12)
          width: Style.space(88); height: Math.max(Style.space(26), Math.min(Style.space(55), width * (screenCard.modelData.height || 9) / (screenCard.modelData.width || 16)))
          color: "transparent"; border.width: 1; border.color: Commons.Color.popups.text
          Rectangle { x: 2; y: 2; height: 2; width: parent.width - 4; color: Commons.Color.accent }
        }
        Text {
          x: 4; y: parent.height - Style.space(36); width: parent.width - 8
          textFormat: Text.PlainText; horizontalAlignment: Text.AlignHCenter; elide: Text.ElideRight
          text: screenCard.modelData.name + (screenCard.modelData.disconnected ? " · offline" : "")
          color: Commons.Color.popups.text; font.family: Style.font.family; font.pixelSize: Style.font.body
        }
        Text {
          x: 4; y: parent.height - Style.space(19); width: parent.width - 8
          textFormat: Text.PlainText; horizontalAlignment: Text.AlignHCenter
          text: root.profiles[screenCard.modelData.name] || "inherit"
          color: Util.alpha(Commons.Color.popups.text, 0.65); font.family: Style.font.family; font.pixelSize: Style.font.caption
        }
        activeFocusOnTab: true
        Keys.onReturnPressed: root.selected = modelData.name
        Keys.onSpacePressed: root.selected = modelData.name
        MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: { screenCard.forceActiveFocus(); root.selected = screenCard.modelData.name } }
      }
    }
  }
  Text {
    text: root.chosen || "No connected screens"
    textFormat: Text.PlainText; color: Commons.Color.popups.text
    font.family: Style.font.family; font.pixelSize: Style.font.body; font.bold: true
  }
  Repeater {
    model: [
      {id: "inherit", label: "Use the shared bar", note: "No override. Uses the variants selected in Tusche Bar."},
      {id: "compact", label: "Compact", note: "Pips · AI only when needed · status deviations"},
      {id: "detailed", label: "Detailed", note: "Real workspace minimaps · AI rings · status groups"}
    ]
    Rectangle {
      id: choice
      required property var modelData
      readonly property bool selected: (root.profiles[root.chosen] || "inherit") === modelData.id
      width: root.width; height: copy.implicitHeight + Style.space(20)
      color: selected ? Util.alpha(Commons.Color.accent, 0.12) : "transparent"
      border.width: 1; border.color: selected || activeFocus ? Commons.Color.accent : Util.alpha(Commons.Color.popups.text, 0.2)
      Column {
        id: copy
        x: Style.space(12); y: Style.space(10); width: parent.width - 2 * x; spacing: Style.space(3)
        Text { width: parent.width; textFormat: Text.PlainText; wrapMode: Text.WordWrap; text: (choice.selected ? "✓ " : "") + choice.modelData.label; color: Commons.Color.popups.text; font.family: Style.font.family; font.pixelSize: Style.font.body; font.bold: choice.selected }
        Text { width: parent.width; textFormat: Text.PlainText; wrapMode: Text.WordWrap; text: choice.modelData.note; color: Util.alpha(Commons.Color.popups.text, 0.7); font.family: Style.font.family; font.pixelSize: Style.font.body }
      }
      activeFocusOnTab: true
      function choose() { if (root.chosen) root.picked(root.chosen, modelData.id) }
      Keys.onReturnPressed: choose()
      Keys.onSpacePressed: choose()
      MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: { choice.forceActiveFocus(); choice.choose() } }
    }
  }
  Text {
    width: parent.width; wrapMode: Text.WordWrap; textFormat: Text.PlainText
    text: "Only already-active Tusche modules change. A part set to ‘As today’ stays native; select a Tusche variant first. Choices are staged until Use or Save."
    color: Util.alpha(Commons.Color.popups.text, 0.7); font.family: Style.font.family; font.pixelSize: Style.font.body
  }
}
