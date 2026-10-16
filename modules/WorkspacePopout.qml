import QtQuick
import "../bridge" as Bridge
import ".." as Root
import "../WorkspaceGeometry.js" as WorkspaceGeometry
import Quickshell
import Quickshell.Hyprland
import Quickshell.Wayland
import qs.Commons
import qs.Commons as Commons
import qs.Ui

// Hover popout card for the workspace indicator (`tusche.workspaces`).
// Shows live window thumbnails (`ScreencopyView`) for each occupied/active
// workspace inside the theme's BarMaterialCard without stealing keyboard
// focus or blocking pointer input outside the card.
PanelWindow {
  id: popout

  required property Item anchorItem
  property var owner: null
  property var bar: null
  property bool open: false

  property var workspaceIds: []
  property int activeWorkspace: 1
  property var windowCounts: ({})
  property var urgentIds: []
  property var geometry: ({})
  property var workspaceLabels: ({})
  property var monitors: []

  signal workspacePicked(int workspaceId)
  signal windowPicked(int workspaceId, string address)
  signal stepped(int delta)

  property int margin: Style.gapsOut
  property int padding: Style.space(10)
  property int gap: Style.gapsOut
  property var borderSpec: Border.surfaceSpec("popups", "border", Commons.Color.popups.border, Math.max(1, Style.space(2)))
  property bool centerOnBar: false
  property bool popoutSwitching: false
  property bool popoutSwitchClosing: false

  readonly property var anchorWindow: anchorItem && anchorItem.QsWindow ? anchorItem.QsWindow.window : null
  readonly property string barPos: bar && bar.position ? bar.position : "top"
  readonly property color ink: Commons.Color.popups.text
  readonly property color accent: Commons.Color.accent
  readonly property color urgentColor: Commons.Color.urgent
  property bool anyTileHovered: false
  readonly property bool hovered: surfaceHover.hovered || cardHover.hovered || cardInnerHover.hovered || anyTileHovered

  function recalcTileHover() {
    var h = false
    var n = tileRepeater ? tileRepeater.count : 0
    for (var i = 0; i < n; ++i) {
      var it = tileRepeater.itemAt(i)
      if (it && it.tileHovered) {
        h = true
        break
      }
    }
    anyTileHovered = h
  }

  screen: anchorWindow ? anchorWindow.screen : null
  visible: open || card.opacity > 0.001 || materialCard.presence > 0.001
  color: "transparent"
  exclusionMode: ExclusionMode.Ignore

  WlrLayershell.namespace: "omarchy-keyboard-panel"
  WlrLayershell.layer: WlrLayer.Overlay
  WlrLayershell.keyboardFocus: WlrKeyboardFocus.None

  anchors {
    top: true
    bottom: true
    left: true
    right: true
  }

  // Ancestor HoverHandler on the window's content root: stays hovered while the
  // pointer is over any child subtree (bridge, card, material rim, or tiles),
  // whereas a sibling HoverHandler would lose hover when entering `card`.
  HoverHandler {
    id: surfaceHover
  }

  TransformWatcher {
    id: anchorWatcher
    a: anchorWindow ? anchorWindow.contentItem : null
    b: anchorItem
  }

  readonly property point anchorScreenPos: {
    anchorWatcher.transform
    if (!anchorItem || !anchorWindow || !anchorWindow.contentItem) return Qt.point(margin, 0)
    return anchorItem.mapToItem(anchorWindow.contentItem, 0, 0)
  }
  readonly property real anchorW: anchorItem ? anchorItem.width : 0
  readonly property real anchorH: anchorItem ? anchorItem.height : 0
  readonly property real screenW: screen ? screen.width : 1920
  readonly property real screenH: screen ? screen.height : 1080
  readonly property real barW: anchorWindow ? anchorWindow.width : screenW
  readonly property real barH: anchorWindow ? anchorWindow.height : (bar && bar.barSize ? bar.barSize : Style.bar.sizeHorizontal)

  readonly property real horizontalInset: padding * 2 + Border.left(borderSpec) + Border.right(borderSpec)
  readonly property real verticalInset: padding * 2 + Border.top(borderSpec) + Border.bottom(borderSpec)
  readonly property real availableWidth: Math.max(Style.space(180), screenW - ((barPos === "left" || barPos === "right") ? barW + gap + margin : margin * 2))
  readonly property real availableHeight: Math.max(Style.space(130), screenH - ((barPos === "top" || barPos === "bottom") ? barH + gap + margin : margin * 2))
  readonly property int maxColumns: Math.max(1, Math.min(4, Math.floor((availableWidth - horizontalInset + Style.space(8)) / Style.space(170))))
  readonly property int columns: Math.min(maxColumns, Math.max(1, workspaceIds.length))
  readonly property int maxRows: Math.max(1, Math.floor((availableHeight - verticalInset + Style.space(8)) / Style.space(120)))
  readonly property var visibleWorkspaceIds: workspaceIds.slice(0, Math.max(1, columns * maxRows))
  readonly property int contentWidth: Math.round(Math.min(availableWidth, Math.max(Style.space(160), grid.implicitWidth + horizontalInset)))
  readonly property int contentHeight: Math.round(Math.min(availableHeight, Math.max(Style.space(90), grid.implicitHeight + verticalInset)))

  // Align the left edge with the workspace module so in-bar pip hover
  // expansion never shifts the popout horizontally, and moving straight down
  // from any workspace indicator lands inside the card.
  readonly property point cardOrigin: {
    var x = anchorScreenPos.x
    var y = barH + gap
    if (barPos === "bottom") {
      x = anchorScreenPos.x
      y = screenH - barH - contentHeight - gap
    } else if (barPos === "left") {
      x = barW + gap
      y = anchorScreenPos.y
    } else if (barPos === "right") {
      x = screenW - barW - contentWidth - gap
      y = anchorScreenPos.y
    }
    x = Math.max(margin, Math.min(x, Math.max(margin, screenW - contentWidth - margin)))
    y = Math.max(margin, Math.min(y, Math.max(margin, screenH - contentHeight - margin)))
    return Qt.point(Math.round(x), Math.round(y))
  }

  // Only the card (plus the bridge gap to the bar edge) accepts pointer
  // events while open; everything else (including the bar itself) stays
  // completely click-through and hover-through.
  Item {
    id: emptyMask
    width: 0
    height: 0
  }

  Item {
    id: cardHitBox
    readonly property int hitPad: Style.space(6)
    readonly property real minX: (popout.barPos === "top" || popout.barPos === "bottom")
      ? Math.min(card.x, popout.anchorScreenPos.x) - hitPad
      : card.x - hitPad
    readonly property real maxX: (popout.barPos === "top" || popout.barPos === "bottom")
      ? Math.max(card.x + card.width, popout.anchorScreenPos.x + popout.anchorW) + hitPad
      : card.x + card.width + hitPad
    x: popout.barPos === "left" ? Math.min(card.x, popout.barW) : Math.max(0, minX)
    y: popout.barPos === "top" ? Math.min(card.y, popout.barH) : Math.max(0, card.y - hitPad)
    width: popout.barPos === "left"
      ? Math.max(card.width, card.x + card.width + hitPad - x)
      : (popout.barPos === "right"
          ? Math.max(card.width, popout.screenW - popout.barW - x)
          : Math.max(card.width, maxX - x))
    height: popout.barPos === "top"
      ? Math.max(card.height, card.y + card.height + hitPad - y)
      : (popout.barPos === "bottom"
          ? Math.max(card.height, popout.screenH - popout.barH - y)
          : card.height + hitPad * 2)

    HoverHandler {
      id: cardHover
    }
    WheelHandler {
      acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
      onWheel: function(e) { popout.stepped(e.angleDelta.y > 0 ? -1 : 1) }
    }
  }

  mask: Region {
    item: popout.open ? cardHitBox : emptyMask
  }

  // Avoid screencopy while DPMS is off or a session lock is active on any
  // output, and fail closed when no monitor metadata is available yet.
  readonly property bool captureBlocked: {
    var nativeList = Hyprland.monitors ? Hyprland.monitors.values : []
    var candidates = []
    for (var i = 0; i < nativeList.length; ++i) {
      var ipc = nativeList[i] && nativeList[i].lastIpcObject ? nativeList[i].lastIpcObject : null
      if (ipc && WorkspaceGeometry.finite(ipc.id)) candidates.push(ipc)
    }
    if (!candidates.length && Array.isArray(popout.monitors)) {
      for (var j = 0; j < popout.monitors.length; ++j) {
        if (popout.monitors[j] && WorkspaceGeometry.finite(popout.monitors[j].id)) candidates.push(popout.monitors[j])
      }
    }
    if (!candidates.length) return true
    for (var k = 0; k < candidates.length; ++k) {
      var st = candidates[k]
      if (st.dpmsStatus === false) return true
      if (Array.isArray(st.solitaryBlockedBy) && st.solitaryBlockedBy.indexOf("LOCK") !== -1) return true
    }
    return false
  }

  // Index live HyprlandToplevel objects by canonical address so window
  // rectangles from WorkspaceGeometry can bind `ScreencopyView` and read
  // app names without storing titles in the geometry snapshot.
  readonly property var toplevelMap: {
    var list = Hyprland.toplevels ? Hyprland.toplevels.values : []
    var map = {}
    for (var i = 0; i < list.length; ++i) {
      var tl = list[i]
      if (!tl) continue
      var addr = WorkspaceGeometry.address(tl.address || (tl.lastIpcObject ? tl.lastIpcObject.address : ""))
      if (addr) map[addr] = tl
    }
    return map
  }

  function toplevelFor(address) {
    var addr = WorkspaceGeometry.address(address)
    return addr && toplevelMap[addr] ? toplevelMap[addr] : null
  }

  function cleanAppName(raw) {
    var s = String(raw || "").replace(/[\x00-\x1f\x7f]/g, " ").trim()
    if (!s) return ""
    var parts = s.split(".")
    var last = parts[parts.length - 1] || s
    last = last.replace(/[-_]+/g, " ").trim()
    if (!last) return ""
    return last.charAt(0).toUpperCase() + last.slice(1)
  }

  function windowLabelFor(address) {
    var tl = toplevelFor(address)
    if (!tl) return ""
    var ipc = tl.lastIpcObject || null
    var appId = tl.wayland && tl.wayland.appId ? tl.wayland.appId : (ipc && ipc.class ? ipc.class : "")
    var app = cleanAppName(appId)
    if (app) return app
    var title = String(tl.title || (tl.wayland && tl.wayland.title ? tl.wayland.title : "")).replace(/[\x00-\x1f\x7f]/g, " ").trim()
    return title.length > 24 ? title.slice(0, 24) + "…" : title
  }

  function workspaceHeadline(wsId, layout, winCount) {
    var rects = layout && Array.isArray(layout.rectangles) ? layout.rectangles : []
    if (!rects.length) return winCount > 0 ? (winCount + (winCount === 1 ? " window" : " windows")) : "Empty"
    var primary = rects[0]
    for (var i = 0; i < rects.length; ++i) {
      if (rects[i].focused) { primary = rects[i]; break }
    }
    var label = windowLabelFor(primary.address)
    if (!label) return winCount + (winCount === 1 ? " window" : " windows")
    return label
  }

  function workspaceTitle(wsId) {
    if (workspaceLabels && workspaceLabels[wsId]) return String(workspaceLabels[wsId])
    return wsId === 10 ? "0" : String(wsId)
  }

  BorderSurface {
    id: card
    x: popout.cardOrigin.x
    y: popout.cardOrigin.y
    width: popout.contentWidth
    height: popout.contentHeight
    color: Commons.Color.popups.background
    borderSpec: popout.borderSpec
    padding: popout.padding
    radius: Style.cornerRadius
    opacity: popout.open ? 1.0 : 0.0

    Behavior on opacity {
      NumberAnimation { duration: Style.duration(140); easing.type: Easing.OutCubic }
    }

    Item {
      id: contentHolder
      anchors.fill: parent
      anchors.topMargin: card.contentTopInset
      anchors.rightMargin: card.contentRightInset
      anchors.bottomMargin: card.contentBottomInset
      anchors.leftMargin: card.contentLeftInset

      Root.BarMaterialCard {
        id: materialCard
        panel: popout
        material: Bridge.ModuleBus.material
      }

      Grid {
        id: grid
        columns: popout.columns
        spacing: Style.space(8)

        Repeater {
          id: tileRepeater
          model: popout.visibleWorkspaceIds

          delegate: Rectangle {
            id: tile
            required property var modelData
            required property int index

            readonly property int wsId: Number(modelData)
            readonly property bool isActive: wsId === popout.activeWorkspace
            readonly property bool isUrgent: popout.urgentIds.indexOf(wsId) !== -1
            readonly property int winCount: Number(popout.windowCounts[wsId] || 0)
            readonly property var layout: popout.geometry && popout.geometry[wsId]
              ? popout.geometry[wsId]
              : ({ aspect: 16 / 9, rectangles: [], offscreen: { left: 0, right: 0, top: 0, bottom: 0, total: 0 }, fullscreen: false })
            readonly property var rectangles: layout && Array.isArray(layout.rectangles) ? layout.rectangles : []
            readonly property int offscreenCount: layout && layout.offscreen ? Number(layout.offscreen.total || 0) : 0
            readonly property real aspect: Math.max(1.25, Math.min(2.35, Number(layout.aspect) || (16 / 9)))
            readonly property int viewH: Style.space(84)
            readonly property int viewW: Math.round(viewH * aspect)
            readonly property int headerH: Style.space(20)
            readonly property int pad: Style.space(6)
            readonly property bool tileHovered: tileMouse.containsMouse
            onTileHoveredChanged: popout.recalcTileHover()
            Component.onDestruction: Qt.callLater(popout.recalcTileHover)

            width: viewW + pad * 2
            height: headerH + viewH + pad * 2 + Style.space(4)
            radius: Math.min(Style.cornerRadius, 4)
            color: isActive
              ? Util.alpha(popout.ink, tileHovered ? 0.13 : 0.09)
              : (tileHovered ? Util.alpha(popout.ink, 0.07) : Util.alpha(popout.ink, 0.03))
            border.width: isActive ? Math.max(1, Style.space(1.5)) : 1
            border.color: isUrgent
              ? popout.urgentColor
              : (isActive ? popout.accent : Util.alpha(popout.ink, tileHovered ? 0.34 : 0.14))

            // Header: workspace number badge, primary window name, count/+offscreen
            Item {
              id: header
              x: tile.pad
              y: tile.pad - Style.space(1)
              width: tile.viewW
              height: tile.headerH

              Rectangle {
                id: badge
                anchors.left: parent.left
                anchors.verticalCenter: parent.verticalCenter
                width: Math.max(Style.space(18), badgeText.implicitWidth + Style.space(8))
                height: Style.space(16)
                radius: Math.min(Style.cornerRadius, 3)
                color: tile.isUrgent
                  ? popout.urgentColor
                  : (tile.isActive ? popout.accent : Util.alpha(popout.ink, 0.14))

                Text {
                  id: badgeText
                  renderType: Text.NativeRendering
                  textFormat: Text.PlainText
                  anchors.centerIn: parent
                  text: popout.workspaceTitle(tile.wsId)
                  font.family: Style.font.family
                  font.bold: true
                  font.pixelSize: Math.max(9, Style.font.caption - 1)
                  color: tile.isActive || tile.isUrgent ? Commons.Color.popups.background : popout.ink
                }
              }

              Text {
                id: headline
                renderType: Text.NativeRendering
                textFormat: Text.PlainText
                anchors.left: badge.right
                anchors.leftMargin: Style.space(6)
                anchors.right: countBadge.visible ? countBadge.left : parent.right
                anchors.rightMargin: countBadge.visible ? Style.space(4) : 0
                anchors.verticalCenter: parent.verticalCenter
                elide: Text.ElideRight
                text: popout.workspaceHeadline(tile.wsId, tile.layout, tile.winCount)
                font.family: Style.font.family
                font.bold: tile.isActive
                font.pixelSize: Style.font.caption
                color: Util.alpha(popout.ink, tile.winCount > 0 ? (tile.isActive ? 0.95 : 0.78) : 0.42)
              }

              Text {
                id: countBadge
                renderType: Text.NativeRendering
                textFormat: Text.PlainText
                visible: tile.winCount > 1 || tile.offscreenCount > 0
                anchors.right: parent.right
                anchors.verticalCenter: parent.verticalCenter
                text: tile.offscreenCount > 0 ? ("+" + tile.offscreenCount) : String(tile.winCount)
                font.family: Style.font.family
                font.bold: tile.offscreenCount > 0
                font.pixelSize: Math.max(9, Style.font.caption - 1)
                color: tile.offscreenCount > 0 ? popout.accent : Util.alpha(popout.ink, 0.55)
              }
            }

            // Mini-desktop viewport with live window ScreencopyView thumbnails
            Rectangle {
              id: viewport
              x: tile.pad
              y: tile.pad + tile.headerH + Style.space(3)
              width: tile.viewW
              height: tile.viewH
              radius: Math.min(Style.cornerRadius, 3)
              color: Util.alpha(Commons.Color.bar.background, 0.55)
              border.width: 1
              border.color: Util.alpha(popout.ink, tile.isActive ? 0.22 : 0.12)
              clip: true

              readonly property real inset: 2
              readonly property real innerW: Math.max(1, width - inset * 2)
              readonly property real innerH: Math.max(1, height - inset * 2)

              // Empty workspace placeholder
              Text {
                renderType: Text.NativeRendering
                textFormat: Text.PlainText
                visible: tile.rectangles.length === 0
                anchors.centerIn: parent
                text: tile.winCount > 0 ? (tile.winCount + "×") : "—"
                font.family: Style.font.family
                font.pixelSize: Style.font.caption
                color: Util.alpha(popout.ink, 0.28)
              }

              Repeater {
                model: tile.rectangles

                delegate: Item {
                  id: rectItem
                  required property var modelData
                  required property int index

                  readonly property var tl: popout.toplevelFor(modelData.address)
                  readonly property var waylandHandle: tl && tl.wayland ? tl.wayland : null
                  readonly property string appLabel: popout.windowLabelFor(modelData.address)
                  property bool captureAlive: true
                  onWaylandHandleChanged: captureAlive = true
                  Connections {
                    target: popout
                    function onOpenChanged() { if (popout.open) rectItem.captureAlive = true }
                  }

                  x: Math.round(viewport.inset + Number(modelData.x || 0) * viewport.innerW)
                  y: Math.round(viewport.inset + Number(modelData.y || 0) * viewport.innerH)
                  width: Math.max(8, Math.round(Number(modelData.width || 0) * viewport.innerW))
                  height: Math.max(8, Math.round(Number(modelData.height || 0) * viewport.innerH))
                  z: index + (modelData.floating ? 20 : 0) + (modelData.focused ? 40 : 0)

                  // Base fallback surface when ScreencopyView is not yet ready
                  Rectangle {
                    anchors.fill: parent
                    radius: 2
                    color: Util.alpha(popout.ink, modelData.focused ? 0.2 : 0.12)
                  }

                  // Live Wayland window thumbnail; remains mounted with its
                  // last frame frozen during the closing animation, then
                  // unmounts when the popout hides.
                  Loader {
                    id: captureLoader
                    anchors.fill: parent
                    anchors.margins: 1
                    readonly property bool ready: active && !!item && item.hasContent === true
                    active: !!rectItem.waylandHandle && popout.visible && !popout.captureBlocked && rectItem.captureAlive
                    sourceComponent: Component {
                      ScreencopyView {
                        anchors.fill: parent
                        captureSource: rectItem.waylandHandle
                        live: popout.open && !popout.captureBlocked
                        paintCursor: false
                        constraintSize: Qt.size(Math.max(24, Math.round(rectItem.width * 2)),
                                                Math.max(24, Math.round(rectItem.height * 2)))
                        onStopped: rectItem.captureAlive = false
                      }
                    }
                  }

                  // Fallback label inside the window rectangle until ScreencopyView has produced a frame
                  Text {
                    renderType: Text.NativeRendering
                    textFormat: Text.PlainText
                    visible: !captureLoader.ready && rectItem.width >= Style.space(36) && rectItem.height >= Style.space(18)
                    anchors.centerIn: parent
                    width: Math.max(0, parent.width - Style.space(6))
                    horizontalAlignment: Text.AlignHCenter
                    elide: Text.ElideRight
                    text: rectItem.appLabel
                    font.family: Style.font.family
                    font.pixelSize: Math.max(8, Style.font.caption - 2)
                    color: Util.alpha(popout.ink, 0.72)
                  }

                  // Crisp window frame over the thumbnail
                  Rectangle {
                    anchors.fill: parent
                    radius: 2
                    color: "transparent"
                    border.width: modelData.focused && tile.isActive ? 1.5 : 1
                    border.color: modelData.focused && tile.isActive
                      ? popout.accent
                      : Util.alpha(popout.ink, modelData.focused ? 0.48 : 0.28)
                  }
                }
              }
            }

            MouseArea {
              id: tileMouse
              anchors.fill: parent
              hoverEnabled: true
              acceptedButtons: Qt.LeftButton
              cursorShape: Qt.PointingHandCursor
              onClicked: function(mouse) {
                var vx = mouse.x - viewport.x
                var vy = mouse.y - viewport.y
                if (vx >= 0 && vy >= 0 && vx <= viewport.width && vy <= viewport.height && tile.rectangles.length > 0) {
                  var bestAddr = ""
                  var bestZ = -1
                  for (var i = 0; i < tile.rectangles.length; ++i) {
                    var r = tile.rectangles[i]
                    var rx = viewport.inset + Number(r.x || 0) * viewport.innerW
                    var ry = viewport.inset + Number(r.y || 0) * viewport.innerH
                    var rw = Math.max(8, Number(r.width || 0) * viewport.innerW)
                    var rh = Math.max(8, Number(r.height || 0) * viewport.innerH)
                    var rz = i + (r.floating ? 20 : 0) + (r.focused ? 40 : 0)
                    if (vx >= rx && vx <= rx + rw && vy >= ry && vy <= ry + rh && rz >= bestZ) {
                      bestZ = rz
                      bestAddr = String(r.address || "")
                    }
                  }
                  if (bestAddr) {
                    popout.windowPicked(tile.wsId, bestAddr)
                    return
                  }
                }
                popout.workspacePicked(tile.wsId)
              }
            }
          }
        }
      }
    }

    HoverHandler {
      id: cardInnerHover
    }
  }
}
