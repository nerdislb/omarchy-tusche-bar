import QtQuick
import qs.Commons
import ".." as Root

// Shared presentation only. Live bar and visual settings supply the same
// data/palette; previews never create a service or perform desktop actions.
Item {
  id: root
  property string variant: "pips"
  property var ids: [1, 2, 3, 4, 5]
  property var occupiedIds: []
  property int active: 1
  property var windowCounts: ({})
  property var urgentIds: []
  property var geometry: ({})
  property var workspaceLabels: ({})
  property real barSize: 30
  property color fg: "white"
  property color accent: fg
  property color strong: fg
  property color urgentColor: accent
  property color barColor: "black"
  property bool barLight: false
  property bool interactive: false
  property bool holdExpand: false
  // the pixel style: numbered boxes on whole pixels instead of pips or dots
  property bool pixel: false
  readonly property bool hovered: faceHover.hovered || (loader.item && loader.item.childHovered === true)
  readonly property color dim: Util.alpha(fg, 0.45)
  signal workspacePicked(int id)
  signal stepped(int delta)

  function occupied(id) { return Number(windowCounts[id] || 0) > 0 }
  function urgent(id) { return urgentIds.indexOf(id) >= 0 }
  function label(id) { return workspaceLabels[id] || (id === 10 ? "0" : String(id)) }
  readonly property int activeIndex: Math.max(0, ids.indexOf(active))
  // The active marker's two edges, in cells, on springs (EdgeSpring): it
  // draws out toward the next workspace and gathers as it lands, as iOS's page
  // dots do; a burst of switches keeps its pace instead of starting over.
  Root.EdgeSpring {
    id: marker
    numeric: true
    targetStart: root.activeIndex
    targetEnd: root.activeIndex + 1
    leadResponse: 0.22
    trailResponse: 0.32
    damping: 0.86
    epsilon: 0.004
    restSpeed: 0.05
  }
  readonly property real activeF: marker.start
  readonly property real activeSpan: marker.end - marker.start
  implicitHeight: barSize
  implicitWidth: loader.item ? loader.item.implicitWidth : 0

  HoverHandler {
    id: faceHover
    enabled: root.interactive && root.variant !== "none"
  }

  Loader {
    id: loader
    height: root.barSize
    sourceComponent: {
      if (root.pixel && root.variant !== "minimap" && root.variant !== "none") return boxesView
      switch (root.variant) {
      case "stack": return stackView
      case "logo": return dotsView
      case "minimap": return minimapView
      case "none": return null
      default: return pipsView
      }
    }
  }
  WheelHandler {
    enabled: root.interactive
    acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
    onWheel: function(e) { root.stepped(e.angleDelta.y > 0 ? -1 : 1) }
  }

  // Pips: 8 px squares; hovering grows them into numbered chips.
  Component {
    id: pipsView
    Item {
      id: pips
      readonly property bool childHovered: hover.hovered
      readonly property real h: (hover.hovered || root.hovered || root.holdExpand) ? 1 : 0
      property real grow: h
      Behavior on grow { NumberAnimation { duration: Style.duration(160); easing.type: Easing.OutCubic } }
      readonly property real cell: Style.space(8) + (Style.space(20) - Style.space(8)) * grow
      readonly property real gap: Style.space(5) - Style.space(2) * grow
      implicitWidth: root.ids.length * cell + (root.ids.length - 1) * gap
      height: root.barSize
      HoverHandler { id: hover; enabled: root.interactive }

      Repeater {
        model: root.ids
        Item {
          required property int modelData
          required property int index
          readonly property bool occ: root.occupied(modelData)
          readonly property bool urg: root.urgent(modelData)
          x: index * (pips.cell + pips.gap)
          width: pips.cell
          height: root.barSize
          Rectangle {
            anchors.verticalCenter: parent.verticalCenter
            width: parent.width
            height: Style.space(8) + Style.space(8) * pips.grow
            color: parent.urg ? root.urgentColor : parent.occ ? Util.alpha(root.fg, 0.5) : "transparent"
            border.width: parent.occ || parent.urg ? 0 : 1
            border.color: root.dim
            radius: Math.min(Style.cornerRadius, 2)
          }
          Text { renderType: Text.NativeRendering;
            anchors.centerIn: parent
            opacity: pips.grow
            text: modelData === 10 ? "0" : String(modelData)
            font.family: Style.font.family; font.bold: true; font.pixelSize: Style.font.bodySmall
            color: parent.occ ? root.barColor : root.fg
          }
          MouseArea { enabled: root.interactive; anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: root.workspacePicked(parent.modelData) }
        }
      }

      // the active marker, drawn out while it travels; the filled pip alone
      // says which one is active (no second rule underneath)
      readonly property real markerWidth: root.activeSpan * (pips.cell + pips.gap) - pips.gap + 2
      Rectangle {
        x: root.activeF * (pips.cell + pips.gap) - 1
        anchors.verticalCenter: parent.verticalCenter
        width: pips.markerWidth
        height: Style.space(8) + Style.space(8) * pips.grow + 2
        color: root.accent
        radius: Math.min(Style.cornerRadius, 2)
        Text { renderType: Text.NativeRendering;
          anchors.centerIn: parent
          opacity: pips.grow
          text: root.active === 10 ? "0" : String(root.active)
          font.family: Style.font.family; font.bold: true; font.pixelSize: Style.font.bodySmall
          color: root.barColor
        }
      }
    }
  }

  // Boxes (pixel style): a numbered square per workspace, the active one
  // filled with the text colour, occupied ones lightly filled, all on whole
  // pixels with a 1-px hairline and no rounding.
  Component {
    id: boxesView
    Item {
      id: boxes
      readonly property bool childHovered: hover.hovered
      readonly property int cell: Math.max(14, Math.round(root.barSize * 0.62))
      readonly property int gap: 3
      implicitWidth: root.ids.length * cell + (root.ids.length - 1) * gap
      height: root.barSize
      HoverHandler { id: hover; enabled: root.interactive }
      Repeater {
        model: root.ids
        Item {
          required property int modelData
          required property int index
          readonly property bool on: modelData === root.active
          readonly property bool occ: root.occupied(modelData)
          readonly property bool urg: root.urgent(modelData)
          x: index * (boxes.cell + boxes.gap)
          y: Math.round((root.barSize - boxes.cell) / 2)
          width: boxes.cell
          height: boxes.cell
          Rectangle {
            anchors.fill: parent
            antialiasing: false
            color: parent.on ? root.strong : parent.urg ? root.urgentColor : parent.occ ? Util.alpha(root.fg, 0.14) : "transparent"
            border.width: parent.on || parent.urg ? 0 : 1
            border.color: Util.alpha(root.fg, parent.occ ? 0.0 : 0.28)
          }
          Text {
            anchors.centerIn: parent
            renderType: Text.NativeRendering
            antialiasing: false
            text: root.label(parent.modelData)
            font.family: Style.font.family
            font.pixelSize: Style.font.body
            color: parent.on || parent.urg ? root.barColor : Util.alpha(root.fg, parent.occ ? 0.9 : 0.45)
          }
          MouseArea { enabled: root.interactive; anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: root.workspacePicked(parent.modelData) }
        }
      }
    }
  }

  // Stack: the active workspace in front, occupied ones stacked behind.
  Component {
    id: stackView
    Item {
      readonly property var others: root.occupiedIds.filter(function(id) { return id !== root.active }).slice(0, 3)
      readonly property real box: Math.round(root.barSize * 0.6)
      implicitWidth: box + others.length * Style.space(4) + Style.space(2)
      height: root.barSize
      Repeater {
        model: parent.others.length
        Rectangle {
          required property int index
          readonly property int n: parent.others.length - index
          x: n * Style.space(4)
          y: (root.barSize - parent.box) / 2 - n * Style.space(2) + Style.space(2)
          width: parent.box; height: parent.box
          color: root.barColor
          border.width: 1
          border.color: root.urgent(parent.others[n - 1]) ? root.urgentColor : root.dim
          z: -n
        }
      }
      Rectangle {
        y: (root.barSize - parent.box) / 2 + Style.space(2)
        width: parent.box; height: parent.box
        color: root.barColor
        border.width: Math.max(1, Style.space(1.5)); border.color: root.accent
        Text { renderType: Text.NativeRendering; anchors.centerIn: parent; text: root.active === 10 ? "0" : String(root.active); font.family: Style.font.family; font.bold: true; font.pixelSize: Style.font.body; color: root.strong }
      }
      MouseArea {
        enabled: root.interactive
        anchors.fill: parent
        acceptedButtons: Qt.LeftButton | Qt.RightButton
        cursorShape: Qt.PointingHandCursor
        // Click brings the next occupied (urgent first) to the front.
        onClicked: function(m) {
          var o = parent.others
          var u = o.filter(function(id) { return root.urgent(id) })
          if (u.length) root.workspacePicked(u[0])
          else if (o.length) root.workspacePicked(m.button === Qt.RightButton ? o[o.length - 1] : o[0])
        }
      }
    }
  }

  // Logo variant: five dots next to the numbered logo.
  Component {
    id: dotsView
    Item {
      readonly property real dot: Style.space(5)
      implicitWidth: root.ids.length * (dot + Style.space(2))
      height: root.barSize
      Repeater {
        model: root.ids
        Rectangle {
          required property int modelData
          required property int index
          x: index * (parent.dot + Style.space(2))
          anchors.verticalCenter: parent.verticalCenter
          width: parent.dot; height: parent.dot
          color: modelData === root.active ? root.accent : root.urgent(modelData) ? root.urgentColor : root.occupied(modelData) ? root.fg : root.dim
          opacity: root.occupied(modelData) || modelData === root.active ? 1 : 0.6
          MouseArea { enabled: root.interactive; anchors.fill: parent; anchors.margins: -2; cursorShape: Qt.PointingHandCursor; onClicked: root.workspacePicked(parent.modelData) }
        }
      }
    }
  }

  // Minimap: real monitor-relative tiles, including floating windows. The
  // dimensions/material are the original Tusche map, not a new visual skin.
  Component {
    id: minimapView
    Row {
      spacing: Style.space(4)
      height: root.barSize
      Repeater {
        model: root.occupiedIds
        Rectangle {
          id: mapCell
          required property int modelData
          readonly property bool act: modelData === root.active
          readonly property var layout: root.geometry[modelData] || null
          anchors.verticalCenter: parent.verticalCenter
          width: Math.round(root.barSize * 0.9); height: Math.round(root.barSize * 0.6)
          color: root.barLight ? Qt.darker(root.barColor, act ? 1.04 : 1.16)
                 : act ? Qt.lighter(root.barColor, 1.6) : Qt.darker(root.barColor, 1.3)
          border.width: act ? Math.max(1, Style.space(1.5)) : 1
          border.color: root.urgent(modelData) ? root.urgentColor : act ? root.accent : root.dim
          WorkspaceMiniature {
            anchors.fill: parent
            layout: mapCell.layout
            ink: root.fg
            accent: root.accent
            background: mapCell.color
            active: mapCell.act
          }
          Text {
            renderType: Text.NativeRendering
            anchors.centerIn: parent
            visible: !mapCell.layout || !mapCell.layout.rectangles || mapCell.layout.rectangles.length === 0
            text: root.label(mapCell.modelData)
            textFormat: Text.PlainText
            width: parent.width - 4
            horizontalAlignment: Text.AlignHCenter
            elide: Text.ElideRight
            font.family: Style.font.family
            font.pixelSize: Style.font.bodySmall
            color: mapCell.act ? root.strong : root.dim
          }
          MouseArea {
            enabled: root.interactive
            anchors.fill: parent
            cursorShape: Qt.PointingHandCursor
            onClicked: root.workspacePicked(parent.modelData)
          }
        }
      }
    }
  }
}
