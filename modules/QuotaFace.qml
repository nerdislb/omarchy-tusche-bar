import QtQuick
import ".." as Root
import qs.Commons
import qs.Commons as Commons

// Pure production quota face. No files, services, IPC or device actions.
// The real bar and Control Center supply the same snapshot to this renderer.
Item {
  id: root
  property string variant: "gauge"
  property int barSize: Style.bar.sizeHorizontal
  property color fg: Commons.Color.bar.text
  property color accent: Commons.Color.accent
  property color urgent: Commons.Color.urgent
  property var pal: ({})
  property var metal: null
  property var items: []
  property var ringItems: []
  property real hoverBoost: 0
  readonly property var letters: ({claude:"C", codex:"X", deepseek:"D", antigravity:"G", grok:"K", fireworks:"F"})
  readonly property var quotaItems: items.filter(function(x) { return x.percent >= 0 })
  readonly property var tightest: {
    var best = null
    for (var i = 0; i < quotaItems.length; i++) if (!best || quotaItems[i].percent > best.percent) best = quotaItems[i]
    return best
  }
  readonly property var balance: { for (var i = 0; i < items.length; i++) if (items[i].percent < 0) return items[i]; return null }
  readonly property bool hidden: variant === "ondemand" && !(tightest && tightest.percent >= 0.75)
  function tone(p) { return p >= 0.9 ? urgent : p >= 0.75 ? accent : p >= 0.5 ? (pal.yellow || accent) : (pal.green || fg) }
  function shortLabel(l) { return /session|5.hour/i.test(l) ? "5h" : /week/i.test(l) ? "week" : l }
  function play() { if (loader.item && typeof loader.item.play === "function") loader.item.play() }
  visible: !hidden
  implicitHeight: barSize
  implicitWidth: hidden ? 0 : (loader.item ? loader.item.implicitWidth : 0)
  Loader {
    id: loader
    height: root.barSize
    sourceComponent: root.variant === "vu" ? vuView : root.variant === "rings" ? ringsView : root.variant === "ondemand" ? chipView : gaugeView
  }

  // Gauge: the tightest limit, coloured by level.
  Component {
    id: gaugeView
    Row {
      spacing: Style.space(5)
      height: root.barSize
      Text { textFormat: Text.PlainText; renderType: Text.NativeRendering;
        anchors.verticalCenter: parent.verticalCenter
        text: "\u{f04c5}"
        font.family: Style.font.family; font.pixelSize: Style.font.icon + 2
        color: root.tightest ? root.tone(root.tightest.percent) : root.fg
      }
      Column {
        anchors.verticalCenter: parent.verticalCenter
        spacing: Style.space(2)
        Row {
          spacing: Style.space(4)
          Text { textFormat: Text.PlainText; renderType: Text.NativeRendering; text: root.tightest ? root.tightest.name : "AI"; font.family: Style.font.family; font.bold: true; font.pixelSize: Style.font.caption; color: Util.alpha(root.fg, 0.65) }
          Text { textFormat: Text.PlainText; renderType: Text.NativeRendering; text: root.tightest ? Math.round(root.tightest.percent * 100) + "%" : "–"; font.family: Style.font.family; font.pixelSize: Style.font.bodySmall; color: root.fg }
        }
        Rectangle {
          width: Style.space(62); height: Math.max(2, Style.space(4))
          color: Util.alpha(root.fg, 0.15)
          Rectangle { width: parent.width * (root.tightest ? Math.min(1, root.tightest.percent) : 0); height: parent.height; color: root.tightest ? root.tone(root.tightest.percent) : root.fg }
        }
      }
    }
  }

  // Tracker VU: one channel per tracked quota, 8 segments.
  Component {
    id: vuView
    Row {
      spacing: Style.space(6)
      height: root.barSize
      Repeater {
        model: root.quotaItems
        Row {
          required property var modelData
          spacing: Style.space(2)
          anchors.verticalCenter: parent.verticalCenter
          Text { textFormat: Text.PlainText; renderType: Text.NativeRendering; anchors.verticalCenter: parent.verticalCenter; text: root.letters[modelData.provider] || "?"; font.family: Style.font.family; font.bold: true; font.pixelSize: Style.font.caption; color: Util.alpha(root.fg, 0.65) }
          Column {
            anchors.verticalCenter: parent.verticalCenter
            spacing: 1
            Repeater {
              model: 8
              Rectangle {
                required property int index
                readonly property int seg: 7 - index
                width: Style.space(7); height: Math.max(1, Math.round(root.barSize * 0.055))
                color: parent.parent.modelData.percent * 8 > seg + 0.001 || (seg === 0 && parent.parent.modelData.percent > 0)
                  ? (seg >= 7 ? root.urgent : seg >= 5 ? (root.pal.yellow || root.accent) : (root.pal.green || root.fg))
                  : Util.alpha(root.fg, 0.12)
              }
            }
          }
        }
      }
      Text { textFormat: Text.PlainText; renderType: Text.NativeRendering;
        visible: !!root.balance
        anchors.verticalCenter: parent.verticalCenter
        text: root.balance ? root.balance.value.replace(/^USD\s*/, "$") : ""
        font.family: Style.font.family; font.pixelSize: Style.font.caption; color: Util.alpha(root.fg, 0.75)
      }
    }
  }

  // A quota ring with the agent's initial: the bar's rings and the popup's tabs.
  // percent < 0 (no numbers): only the track, the initial dimmed.
  // Metal family (material.metal.rings): a chrome ring whose bright arc is
  // the quota, the rest of it dark chrome; from 90 % the metal turns the
  // signal colour. It glints with the bar's pulse and brightens on hover.
  component Ring: Item {
    id: ring
    property real percent: -1
    property string letter: "?"
    property color ink: root.fg
    property int letterPx: Style.font.caption - 1
    property real boost: 0
    readonly property var metal: root.metal && root.metal.rings !== false ? root.metal : null
    function play() { metalRing.play() }
    Canvas {
      id: cv
      anchors.fill: parent
      visible: !ring.metal
      onPaint: {
        var c = getContext("2d"); c.reset()
        var r = width / 2 - 2
        c.lineWidth = Math.max(2, width * 0.13)
        c.strokeStyle = Util.alpha(ring.ink, ring.percent < 0 ? 0.22 : 0.15)
        c.beginPath(); c.arc(width / 2, height / 2, r, 0, Math.PI * 2); c.stroke()
        if (ring.percent < 0) return
        c.strokeStyle = root.tone(ring.percent)
        c.beginPath(); c.arc(width / 2, height / 2, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.03, Math.min(1, ring.percent))); c.stroke()
      }
    }
    onPercentChanged: cv.requestPaint()
    onInkChanged: cv.requestPaint()
    Connections { target: root; function onPalChanged() { cv.requestPaint() } }
    Root.MetalShape {
      id: metalRing
      visible: !!ring.metal
      spec: ring.metal
      kind: "ring"
      pad: 2
      x: -1; y: -1
      width: ring.width + 2; height: ring.height + 2
      tube: ring.metal ? Number(ring.metal.ring || 2.6) : 2.6
      arc: ring.percent < 0 ? 0 : Math.max(0.03, Math.min(1, ring.percent))
      dim: ring.percent < 0 ? 0.32 : 0.2
      boost: ring.boost
      tint: ring.percent >= 0.9 ? root.urgent : (ring.metal && ring.metal.tint ? ring.metal.tint : "#f2f3f7")
      // material.metal.ringStyle 2 (readable at bar size): a solid arc in the ink with a chrome
      // head on a flat track; 1: chrome arc on a flat track; 0: chrome all round
      ringStyle: ring.metal && ring.metal.ringStyle !== undefined ? Number(ring.metal.ringStyle) : 0
      track: Util.alpha(ring.ink, ring.metal && ring.metal.light ? (ring.percent < 0 ? 0.22 : 0.16) : (ring.percent < 0 ? 0.3 : 0.26))
      ink: ring.percent >= 0.9 ? root.urgent : (ring.metal && ring.metal.light ? "#1d1e21" : "#e6e7eb")
    }
    Text { textFormat: Text.PlainText; renderType: Text.NativeRendering; anchors.centerIn: parent; text: ring.letter; font.family: Style.font.family; font.bold: true; font.pixelSize: ring.letterPx; color: Util.alpha(ring.ink, ring.percent < 0 ? 0.45 : 1) }
  }

  // Rings: one arc per tracked quota, provider initial inside.
  Component {
    id: ringsView
    Row {
      spacing: Style.space(5)
      height: root.barSize
      function play() { for (var i = 0; i < ringRepeater.count; ++i) ringRepeater.itemAt(i).play() }
      Repeater {
        id: ringRepeater
        model: root.ringItems
        Ring {
          id: barRing
          required property var modelData
          anchors.verticalCenter: parent.verticalCenter
          width: root.metal && Number(root.metal.ringSize) > 0 ? Number(root.metal.ringSize) : Math.round(root.barSize * 0.66); height: width
          percent: modelData.missing ? -1 : modelData.percent
          letter: root.letters[modelData.provider] || "?"
          boost: root.hoverBoost
        }
      }
    }
  }

  // On demand: a chip only from 75 %.
  Component {
    id: chipView
    Rectangle {
      implicitWidth: chipRow.implicitWidth + Style.space(12)
      height: Math.round(root.barSize * 0.72)
      y: Math.round((root.barSize - height) / 2)
      radius: Math.min(Style.cornerRadius, 3)
      color: Util.alpha(root.tightest ? root.tone(root.tightest.percent) : root.accent, 0.16)
      Row {
        id: chipRow
        anchors.centerIn: parent
        spacing: Style.space(5)
        Text { textFormat: Text.PlainText; renderType: Text.NativeRendering; text: "\u{f04c5}"; font.family: Style.font.family; font.pixelSize: Style.font.icon; color: root.tightest ? root.tone(root.tightest.percent) : root.fg }
        Text { textFormat: Text.PlainText; renderType: Text.NativeRendering; text: root.tightest ? root.tightest.name + " " + root.shortLabel(root.tightest.label) + " " + Math.round(root.tightest.percent * 100) + "%" : ""; font.family: Style.font.family; font.pixelSize: Style.font.bodySmall; color: root.fg }
      }
    }
  }

}
