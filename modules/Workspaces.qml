import QtQuick
import "../bridge" as Bridge
import ".." as Root
import "../WorkspaceGeometry.js" as WorkspaceGeometry
import Quickshell.Hyprland
import Quickshell.Io
import qs.Commons
import qs.Commons as Commons
import qs.Ui

// Workspaces (and optionally the Omarchy menu logo) in one compact module.
// Loaded by the Tusche Bar as a custom QML module:
//   { "id": "tusche.workspaces", "source": ".../modules/Workspaces.qml",
//     "variant": "pips" | "stack" | "logo" | "minimap"
//                | "none" (menu logo only, next to the native workspaces),
//     "menu": true, "logo": "omarchy" | "arch" | "nerdibeard" }
// Left click on a workspace focuses it. On the logo: left click folds out the
// drop-down menu (DropMenu.qml), right click opens Omarchy's own centred menu,
// middle click the Control Center. The mouse wheel steps through workspaces
// in every variant.
// The drop-down also answers the questions of the actions it ran
// (dropAsk, for the engine's IPC `ask`).
Item {
  id: root

  property var bar: null
  property string moduleName: "tusche.workspaces"
  property var settings: ({})

  function setting(key, fallback) {
    var v = settings ? settings[key] : undefined
    return v === undefined || v === null ? fallback : v
  }

  readonly property string baseVariant: String(setting("variant", "pips"))
  // A native workspace host remains native; profiles only change our renderer.
  readonly property string variant: baseVariant === "none" ? "none"
    : String(Bridge.ModuleBus.optionFor(root, "workspaces", baseVariant))
  readonly property bool showMenu: setting("menu", true) !== false
  readonly property string logo: String(setting("logo", "omarchy"))
  readonly property int barSize: bar && bar.barSize ? bar.barSize : Style.bar.sizeHorizontal
  readonly property color fg: bar && bar.barForeground ? bar.barForeground : Commons.Color.bar.text
  readonly property color accent: Commons.Color.accent
  // Theme material `tones.strong` (Tusche & Papier): the bar's text is the
  // quieter tone there; logo and the active workspace's number stay strong
  readonly property color strong: Bridge.ModuleBus.material && Bridge.ModuleBus.material.tones && Bridge.ModuleBus.material.tones.strong
    ? Qt.color(Bridge.ModuleBus.material.tones.strong) : fg
  readonly property color urgentColor: Commons.Color.urgent
  readonly property color dim: Util.alpha(fg, 0.45)

  // ---------------------------------------------------------------- data
  readonly property var nativeWorkspaces: Hyprland.workspaces.values
  readonly property var workspaces: !nativeGeometryReady ? (snapshot ? snapshot.workspaces : []) : nativeWorkspaces
  readonly property int active: !nativeGeometryReady ? (snapshot ? snapshot.active.id : 1)
    : Hyprland.focusedWorkspace ? Hyprland.focusedWorkspace.id : 1

  function byId(id) {
    for (var i = 0; i < workspaces.length; i++) if (workspaces[i].id === id) return workspaces[i]
    return null
  }
  function windows(id) { var w = byId(id); return w && w.toplevels ? w.toplevels.values.length : w ? Number(w.windows || 0) : 0 }
  function occupied(id) { return windows(id) > 0 }
  function urgent(id) {
    var w = byId(id)
    if (!w) return false
    if (w.urgent === true) return true
    // Some Lua builds retain names/urgency but not native workspace IDs.
    return nativeWorkspaces.some(function(n) { return n.name === w.name && n.urgent === true })
  }

  // Existing compact variants retain the native 1–5/+10 convention. The map
  // includes every occupied regular workspace, including high and named IDs.
  readonly property var compactIds: {
    var list = [1, 2, 3, 4, 5]
    for (var i = 0; i < workspaces.length; i++) {
      var id = workspaces[i].id
      if (id > 0 && id <= 10 && list.indexOf(id) === -1) list.push(id)
    }
    return list.sort(function(a, b) { return a - b })
  }
  readonly property var minimapIds: WorkspaceGeometry.workspaceIds(workspaces, active)
  readonly property var ids: variant === "minimap" ? minimapIds : compactIds
  readonly property var occupiedIds: ids.filter(function(id) { return occupied(id) || id === active })
  readonly property var windowCounts: {
    var counts = {}
    for (var i = 0; i < workspaces.length; ++i) counts[workspaces[i].id] = windows(workspaces[i].id)
    return counts
  }
  readonly property var urgentIds: workspaces.filter(function(w) { return root.urgent(w.id) }).map(function(w) { return w.id })
  readonly property var workspaceLabels: {
    var labels = {}
    for (var i = 0; i < workspaces.length; ++i) if (workspaces[i].id < 0) labels[workspaces[i].id] = workspaces[i].name
    return labels
  }

  // Reuse Quickshell's existing, shared IPC model, not another process/service.
  // The selected owner only refreshes on relevant events and pointer entry.
  readonly property var rawClients: Hyprland.toplevels.values.map(function(w) { return w.lastIpcObject })
  readonly property var rawMonitors: Hyprland.monitors.values.map(function(m) { return m.lastIpcObject })
  readonly property bool nativeGeometryReady: rawMonitors.length > 0 && nativeWorkspaces.every(function(w) {
    return w.lastIpcObject && WorkspaceGeometry.finite(w.lastIpcObject.id)
  })
  // Quickshell 0.3.2's Lua IPC path can provide clients but empty monitor/
  // workspace metadata. Retain a sanitized batch snapshot only on that path.
  property var localSnapshot: null
  readonly property var snapshot: snapshotOwner ? snapshotOwner.localSnapshot : null
  readonly property var snapshotOwner: {
    var candidates = Bridge.ModuleBus.instances.workspaces || []
    return candidates.length ? candidates[0] : null
  }
  readonly property var geometryClients: !nativeGeometryReady && snapshot ? snapshot.clients : rawClients
  readonly property var geometryMonitors: !nativeGeometryReady && snapshot ? snapshot.monitors : rawMonitors
  readonly property string focusedAddress: Hyprland.activeToplevel ? Hyprland.activeToplevel.address : ""
  function collectGeometry() {
    var result = {}
    for (var i = 0; i < workspaces.length; ++i) {
      var workspace = workspaces[i]
      result[workspace.id] = WorkspaceGeometry.layoutOf(workspace.lastIpcObject || workspace, geometryClients, geometryMonitors, focusedAddress)
    }
    return result
  }
  readonly property var geometry: variant === "minimap" ? collectGeometry() : ({})
  // An inert snapshot for visual settings: reading never refreshes IPC or
  // instantiates another native widget/service. The caller owns preview input.
  function previewData() {
    return { ids: compactIds.slice(), occupiedIds: minimapIds.filter(function(id) { return occupied(id) || id === active }),
      active: active, windowCounts: windowCounts, urgentIds: urgentIds.slice(),
      geometry: collectGeometry(), workspaceLabels: workspaceLabels }
  }
  readonly property bool geometryOwner: {
    var candidates = Bridge.ModuleBus.instances.workspaces || []
    if (!nativeGeometryReady) return snapshotOwner === root
    for (var i = 0; i < candidates.length; ++i) {
      if (candidates[i] && candidates[i].variant === "minimap") return candidates[i] === root
    }
    return false
  }
  property bool monitorsPending: false
  property bool snapshotAgain: false
  property bool geometryTrailing: false
  // Leading edge: the first event of a burst refreshes at once, because on the
  // snapshot path the active workspace is read from the snapshot and a wait
  // would show as a late marker. Further events inside the cooldown collapse
  // into one trailing refresh, so a burst stays bounded.
  function scheduleGeometry(monitors) {
    if (!geometryOwner) return
    monitorsPending = monitorsPending || monitors === true
    if (geometryCooldown.running) { geometryTrailing = true; return }
    refreshGeometry()
    geometryCooldown.start()
  }
  function refreshGeometry() {
    if (!geometryOwner) return
    if (!nativeGeometryReady) {
      if (snapshotProcess.running) snapshotAgain = true
      else snapshotProcess.running = true
      return
    }
    if (monitorsPending) {
      Hyprland.refreshMonitors()
      Hyprland.refreshWorkspaces()
    }
    monitorsPending = false
    Hyprland.refreshToplevels()
  }
  onGeometryOwnerChanged: {
    if (geometryOwner) scheduleGeometry(true)
    else { geometryCooldown.stop(); geometryTrailing = false; monitorsPending = false; snapshotAgain = false; snapshotProcess.running = false }
  }
  Timer {
    id: geometryCooldown
    interval: 140
    repeat: false
    onTriggered: if (root.geometryTrailing) {
      root.geometryTrailing = false
      root.refreshGeometry()
      geometryCooldown.start()
    }
  }
  Process {
    id: snapshotProcess
    command: ["hyprctl", "-j", "--batch", "monitors; workspaces; clients; activeworkspace"]
    stdout: StdioCollector {
      onStreamFinished: {
        var next = WorkspaceGeometry.parseSnapshot(text)
        if (next && root.geometryOwner) root.localSnapshot = next
      }
    }
    onExited: {
      if (root.snapshotAgain) {
        root.snapshotAgain = false
        root.scheduleGeometry(true)
      }
    }
  }
  Timer {
    interval: 1500
    running: snapshotProcess.running
    repeat: false
    onTriggered: snapshotProcess.running = false
  }
  Connections {
    target: Hyprland
    enabled: root.geometryOwner
    function onRawEvent(event) {
      var name = event ? event.name : ""
      if (WorkspaceGeometry.eventAffectsGeometry(name)) root.scheduleGeometry(WorkspaceGeometry.eventAffectsMonitors(name))
    }
  }
  HoverHandler {
    enabled: root.variant === "minimap"
    onHoveredChanged: if (hovered) {
      var candidates = Bridge.ModuleBus.instances.workspaces || []
      for (var i = 0; i < candidates.length; ++i) if (candidates[i] && candidates[i].geometryOwner) { candidates[i].scheduleGeometry(true); break }
    }
  }

  function focusWorkspace(id) {
    if (bar) bar.run("hyprctl dispatch " + Util.shellQuote("hl.dsp.focus({ workspace = " + JSON.stringify(WorkspaceGeometry.workspaceSelector(byId(id), id)) + " })"))
  }
  function step(delta) {
    if (!ids.length) return
    var i = ids.indexOf(active)
    var next = ids[Math.max(0, Math.min(ids.length - 1, (i < 0 ? 0 : i) + delta))]
    if (next !== active) focusWorkspace(next)
  }
  function openMenu(button) {
    if (!bar) return
    if (button === Qt.MiddleButton) bar.run("omarchy-shell tusche-bar options")
    else if (button !== Qt.RightButton) toggleDrop()
    else bar.run("omarchy-shell shell toggle omarchy.menu '{\"menu\":\"root\"}'")
  }

  // ---------------------------------------------------------------- drop-down menu
  // Popup contract for the panel and the bar's single-popout coordinator.
  // Only with the logo shown; otherwise open() is a no-op, so panel
  // navigation never holds an invisible "opened" owner.
  readonly property bool dropAvailable: showMenu && !!bar
  property bool dropOpen: false
  readonly property bool opened: dropOpen
  property bool popoutSwitchClosing: false
  function open() { if (dropAvailable) dropOpen = true }
  function close() { dropOpen = false }
  function closeForPopoutSwitch() { popoutSwitchClosing = true; dropOpen = false; Qt.callLater(function() { root.popoutSwitchClosing = false }) }
  function toggleDrop() { if (dropOpen) close(); else open() }
  // Super+Space: the drop-down as a launcher (search line, apps first); a
  // second press closes it.
  function openSearch() {
    if (dropOpen) { close(); return }
    var m = dropLoader.item
    if (!dropAvailable || !m) return
    m.searchMode = true
    open()
  }
  // Super+Alt+Space: straight onto the Apps list (closes when already there).
  function openApps() {
    var m = dropLoader.item
    if (!dropAvailable || !m) return
    // without the shell's app library: Omarchy's own Apps menu, toggled
    if (!m.appLibrary) { close(); bar.run("omarchy-menu toggle apps"); return }
    if (dropOpen && m.level && m.level.provider === "apps") { close(); return }
    if (!dropOpen) open()
    Qt.callLater(function() { if (root.dropOpen) m.openApps() })
  }
  // (during a plugin reload the engine may already be gone while this module is torn down)
  function syncDrop() { var e = Bridge.ModuleBus.engine; if (e && typeof e.syncDropMenu === "function") e.syncDropMenu() }
  onDropOpenChanged: syncDrop()
  // Close (and so release the bar's popout) before the panel goes away.
  onDropAvailableChanged: if (!dropAvailable) close()

  // The logo as a bar click target: with a popup open, the panel covers the
  // bar and forwards clicks only to registered targets.
  property var registeredBar: null
  function syncClickRegistration() {
    if (registeredBar && registeredBar.unregisterClickTarget) registeredBar.unregisterClickTarget(menuSlot)
    registeredBar = root.bar
    if (registeredBar && registeredBar.registerClickTarget) registeredBar.registerClickTarget(menuSlot)
  }
  onBarChanged: syncClickRegistration()
  Component.onCompleted: { Bridge.ModuleBus.register("workspaces", root); syncClickRegistration() }
  Component.onDestruction: {
    dropOpen = false
    if (registeredBar && registeredBar.unregisterClickTarget) registeredBar.unregisterClickTarget(menuSlot)
    Bridge.ModuleBus.unregister("workspaces", root); syncDrop()
  }

  Loader {
    id: dropLoader
    active: root.dropAvailable || root.dropOpen
    sourceComponent: Component {
      Root.DropMenu {
        anchorItem: menuSlot
        owner: root
        bar: root.bar
        open: root.dropOpen
      }
    }
  }

  // Questions from the menu shims (bin/menu-shim, through the engine's IPC
  // `ask`): this screen's drop-down answers them and opens for them.
  function dropTracks(token) { var m = dropLoader.item; return !!m && m.tracks(token) }
  function dropAsk(request) {
    var m = dropLoader.item
    if (!dropAvailable || !m || !m.takeRequest(request)) return false
    if (m.hasPending()) open()
    return true
  }
  function dropState() {
    var m = dropLoader.item
    return m ? { requests: m.requests.length, launches: m.launches.length } : null
  }

  readonly property real menuWidth: showMenu ? barSize + Style.space(4) : 0
  implicitHeight: barSize
  implicitWidth: menuWidth + face.implicitWidth + Style.space(6)

  // ---------------------------------------------------------------- menu logo
  Item {
    id: menuSlot
    visible: root.showMenu
    function triggerPress(button) { root.openMenu(button) }
    width: root.menuWidth
    height: root.barSize

    // Theme material (edge "theme"): while the drop menu is out the logo is
    // its source – an inverted block from just under the bar's top down to
    // its lower edge, where the menu card hangs from it; on closing it stays
    // until the card is back in the bar.
    readonly property var source: Bridge.ModuleBus.material ? Bridge.ModuleBus.material.source || null : null
    readonly property bool inverted: !!source && (root.dropOpen || (!!dropLoader.item && dropLoader.item.cardPresence > 0.01))
    readonly property real tabY: Math.round(root.barSize * 0.17)
    Rectangle {
      visible: menuSlot.inverted && (root.logo !== "nerdibeard" || root.variant === "logo")
      y: menuSlot.tabY
      width: parent.width
      height: parent.height - y
      color: menuSlot.source ? menuSlot.source.fill : "transparent"
    }

    // The seal's tab: the ink runs out of the seal into the tab once (0.24 s,
    // OutCubic) – the seal's footprint grown by r with corner radius r,
    // clipped to the tab; the nb stays readable throughout. Closing: the tab
    // stays until the card is back, then the rest state returns at once.
    // Reduced motion: the tab cross-fades around the seal (0.12 s), the seal
    // takes the tab's colours in step (`target`).
    Item {
      id: sealTab
      readonly property bool reduced: Style.reduceMotion
      readonly property bool on: root.logo === "nerdibeard" && root.variant !== "logo" && menuSlot.inverted
      readonly property bool target: reduced ? on && root.dropOpen : on
      visible: opacity > 0
      opacity: target ? 1 : 0
      Behavior on opacity { enabled: sealTab.reduced; NumberAnimation { duration: 120 } }
      y: menuSlot.tabY
      width: parent.width
      height: parent.height - y
      clip: true

      // the seal's footprint in tab coordinates, and the farthest tab corner from it
      readonly property real fx: sealSpot.x
      readonly property real fy: sealSpot.y - y
      function reach(cx, cy) {
        var dx = Math.max(fx - cx, 0, cx - fx - 16), dy = Math.max(fy - cy, 0, cy - fy - 16)
        return Math.sqrt(dx * dx + dy * dy)
      }
      readonly property real rMax: Math.max(reach(0, 0), reach(width, 0), reach(0, height), reach(width, height)) + 0.5
      property real bleed: 0
      onOnChanged: {
        if (on && !reduced) { bleed = 0; bleedRun.restart() }
        else if (!on) { bleedRun.stop(); bleed = 0 }
      }
      NumberAnimation { id: bleedRun; target: sealTab; property: "bleed"; from: 0; to: 1; duration: 240; easing.type: Easing.OutCubic }

      Rectangle {
        readonly property real r: sealTab.reduced ? sealTab.rMax : sealTab.bleed * sealTab.rMax
        x: sealTab.fx - r
        y: sealTab.fy - r
        width: 16 + 2 * r
        height: 16 + 2 * r
        radius: r
        color: menuSlot.source ? menuSlot.source.fill : "transparent"
      }
    }

    Text { renderType: Text.NativeRendering;
      anchors.centerIn: parent
      anchors.verticalCenterOffset: menuSlot.inverted ? Math.round(root.barSize * 0.08) : 0
      visible: root.variant !== "logo" && ["arch", "nerdibeard"].indexOf(root.logo) === -1
      text: ""
      font.family: "omarchy"
      font.pixelSize: Style.font.icon + 2
      color: menuSlot.inverted ? menuSlot.source.text : root.strong
    }


    // Arch (the official mark, unaltered) and the Nerdibeard seal (logo
    // design round 04.10.). Loaded only when chosen, so each arrives with
    // its own motion when the bar starts or the option switches to it.
    // Arch is centred like the Omarchy glyph (x 18–35 at 30 px), ½ px up;
    // the seal's 16 × 16 sit 1 px low, its top line on the workspace frame's.
    Item {
      id: sealSpot
      x: Math.round((parent.width - 16) / 2)
      y: Math.round((root.barSize - 16) / 2) + 1
      width: 16; height: 16
    }
    // metal family (material.metal.logo): a chrome frame around the logo that
    // glints with the bar's pulse
    Root.MetalShape {
      id: logoMetal
      readonly property var m: Bridge.ModuleBus.metal && Bridge.ModuleBus.metal.logo ? Bridge.ModuleBus.metal : null
      visible: !!m && root.variant !== "logo"
      spec: m
      pad: 2
      tube: 1.4
      radius: 3
      x: sealSpot.x - 3 - pad
      y: sealSpot.y - 3 - pad
      width: 22 + 2 * pad
      height: 22 + 2 * pad
      Connections { target: Bridge.ModuleBus; function onMetalPulse() { logoMetal.play() } }
    }
    Loader {
      active: root.variant !== "logo" && root.logo === "arch"
      sourceComponent: Component {
        ArchLogo {
          size: 18 * 1.18
          x: Math.round(menuSlot.width / 2) - width / 2
          y: root.barSize / 2 - 0.5 - height / 2
          color: menuSlot.inverted ? menuSlot.source.text : root.strong
        }
      }
    }
    Loader {
      active: root.variant !== "logo" && root.logo === "nerdibeard"
      x: sealSpot.x; y: sealSpot.y
      sourceComponent: Component {
        SealLogo {
          ink: root.strong
          pressInk: menuSlot.source ? menuSlot.source.fill : root.strong
          pressed: menuMouse.pressed && !root.dropOpen
          tab: sealTab.target
          tabInk: menuSlot.source ? menuSlot.source.fill : root.strong
          cutInk: menuSlot.source ? menuSlot.source.text : "transparent"
        }
      }
    }

    // "logo": the frame carries the active workspace number.
    Item {
      anchors.centerIn: parent
      visible: root.variant === "logo"
      width: Math.round(root.barSize * 0.68); height: width
      Rectangle { anchors.fill: parent; color: "transparent"; border.width: Math.max(1, Style.space(1.5)); border.color: root.strong; radius: Math.min(Style.cornerRadius, 3) }
      Text { renderType: Text.NativeRendering;
        anchors.centerIn: parent
        text: root.active === 10 ? "0" : String(root.active)
        font.family: Style.font.family; font.bold: true
        font.pixelSize: Style.font.body + 1
        color: root.accent
      }
    }

    MouseArea {
      id: menuMouse
      anchors.fill: parent
      acceptedButtons: Qt.LeftButton | Qt.RightButton | Qt.MiddleButton
      cursorShape: Qt.PointingHandCursor
      onClicked: function(m) { root.openMenu(m.button) }
    }
  }

  // ---------------------------------------------------------------- workspaces
  WorkspacesFace {
    id: face
    x: root.menuWidth
    variant: root.variant
    ids: root.ids
    occupiedIds: root.occupiedIds
    active: root.active
    windowCounts: root.windowCounts
    urgentIds: root.urgentIds
    geometry: root.geometry
    workspaceLabels: root.workspaceLabels
    barSize: root.barSize
    fg: root.fg
    accent: root.accent
    strong: root.strong
    urgentColor: root.urgentColor
    barColor: Bridge.ModuleBus.barColor
    barLight: Bridge.ModuleBus.barLight
    interactive: true
    onWorkspacePicked: function(id) { root.focusWorkspace(id) }
    onStepped: function(delta) { root.step(delta) }
  }

  // Wheel over the menu logo retains the module-wide workspace navigation.
  WheelHandler {
    parent: menuSlot
    acceptedDevices: PointerDevice.Mouse | PointerDevice.TouchPad
    onWheel: function(e) { root.step(e.angleDelta.y > 0 ? -1 : 1) }
  }
}
