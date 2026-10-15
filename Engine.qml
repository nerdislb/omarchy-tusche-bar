import QtQuick
import Quickshell
import Quickshell.Hyprland
import Quickshell.Io
import Quickshell.Wayland
import qs.Commons
import qs.Ui
import "Presets.js" as Presets
import "GlassMath.js" as GlassMath
import "ControlCenter.js" as CCModel
import "bridge" as Bridge

// Tusche Bar engine (keep-loaded panel next to the native Omarchy bar).
// It owns the Control Center and writes presets into bar.layout; the bar
// itself stays the native one, so every widget keeps its own service.
//
// The user's layout is saved once (base.json) before the first preset;
// "Today" restores it. Options live in this plugin's shell.json entry.
Item {
  id: root

  property var shell: null
  property var manifest: null
  readonly property string pluginId: manifest && manifest.id ? manifest.id : "nerdibeard.tusche-bar"

  readonly property string pluginDir: {
    var u = String(Qt.resolvedUrl("."))
    u = u.indexOf("file://") === 0 ? decodeURIComponent(u.substring(7)) : u
    return u.replace(/\/$/, "")
  }
  readonly property string moduleDir: pluginDir + "/modules"
  readonly property string stateDir: Quickshell.env("HOME") + "/.local/state/tusche-bar"

  // ---------------------------------------------------------------- config
  property var config: ({})
  FileView {
    path: Quickshell.env("HOME") + "/.config/omarchy/shell.json"
    watchChanges: true
    onFileChanged: reload()
    onLoaded: { try { root.config = JSON.parse(text()); root.configLoaded = true } catch (e) {} }
  }
  property bool configLoaded: false
  readonly property var entry: {
    var list = config && Array.isArray(config.plugins) ? config.plugins : []
    for (var i = 0; i < list.length; i++) if (list[i] && list[i].id === pluginId) return list[i]
    return {}
  }
  readonly property var options: Presets.normalizeOptions(entry.options || {})
  readonly property var screenProfiles: Presets.normalizeScreens(entry.screenProfiles)
  readonly property string presetId: Presets.matchPreset(options)
  readonly property var currentLayout: config && config.bar ? config.bar.layout : null
  // Omarchy's own bar transparency (shell.json bar.transparent; a double click on
  // an empty bar spot toggles it too) – shown as a switch in our menus.
  readonly property bool barTransparent: !!(config && config.bar && config.bar.transparent === true)

  readonly property var edgeBar: shell ? shell.bar : null
  // Edges hang under the native bar only: on top, shown, not replaced.
  readonly property bool barReady: !!edgeBar
    && edgeBar.barSize > 0 && edgeBar.position === "top" && !edgeBar.barHidden
    && (!shell.barConfig || !shell.barConfig.id || shell.barConfig.id === "omarchy.bar")
  // Edge "theme": light and shadow from the current theme's bar-material.json
  // (Tusche & Papier); a theme without one shows no edge.
  readonly property string themeDir: Quickshell.env("HOME") + "/.local/state/omarchy/current/theme"
  property var material: null
  FileView {
    id: materialFile
    path: root.themeDir + "/bar-material.json"
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: { try { root.material = JSON.parse(text()) } catch (e) { root.material = null } }
    onLoadFailed: root.material = null
  }
  // `omarchy theme set` replaces the theme folder; the name file changes each
  // time: one reload path (changed → reload → loaded → material + stamp)
  property int themeStamp: 0
  FileView {
    path: Quickshell.env("HOME") + "/.local/state/omarchy/current/theme.name"
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: { root.themeStamp++; materialFile.reload() }
  }
  readonly property bool materialOn: options.edge === "theme" && !!material
  readonly property var presentationMaterial: GlassMath.material(material, options.glass, options.glassMotion)
  readonly property bool themeEdgeVisible: materialOn && !!material.edge && barReady
  Variants {
    model: root.options.dayline === "on" ? Quickshell.screens : []
    delegate: DayLine { bar: root.edgeBar }
  }
  // Option statusHints: moves of the audio output and Bluetooth connections
  // go to Omarchy's OSD (the island's HUD when it owns the OSD).
  Announcer {
    id: announcer
    enabled: root.configLoaded && root.options.statusHints === "on"
    config: root.config
    emit: function(argv) { Quickshell.execDetached(argv) }
  }
  // The island's takeover of Omarchy's notification service has no other
  // safety net: if the island is then gone or silent, nobody shows notifications.
  // The watchdog looks only while the island's marker says the takeover is its
  // own, and hands the service back after three silent answers (Watchdog.js).
  readonly property string stateRoot: Quickshell.env("HOME") + "/.local/state/omarchy"
  readonly property bool takeoverDisabled: !!(config && Array.isArray(config.disabledPlugins) && config.disabledPlugins.indexOf("omarchy.notifications") >= 0)
  NotificationsWatchdog {
    id: watchdog
    enabled: root.configLoaded && root.takeoverDisabled
    markerPath: root.stateRoot + "/tusche-island/notifications-takeover"
  }
  // for the Control Center's Health page
  readonly property var watchdogModel: watchdog.model
  readonly property bool watchdogEnabled: watchdog.enabled
  FocusSeal { host: root }
  property string focusResult: ""
  property bool focusReleasePending: false
  readonly property bool focusBusy: focusProcess.running
  // "toggle": park the bar, or bring it back when it is hidden (for a key binding)
  function focusAction(action) {
    if (["start", "show", "release", "toggle"].indexOf(action) < 0) return "unknown focus action"
    if (action === "toggle") action = edgeBar && edgeBar.barHidden ? "show" : "start"
    if (action === "start" && options.seal !== "on") return "enable Focus seal first"
    if (focusProcess.running) {
      if (action === "release") focusReleasePending = true
      return "busy"
    }
    focusProcess.command = ["python3", pluginDir + "/bin/focus-mode.py", action]
    focusProcess.running = true
    return "ok"
  }
  Process {
    id: focusProcess
    stdout: StdioCollector { onStreamFinished: root.focusResult = String(text).trim() }
    stderr: StdioCollector { onStreamFinished: if (String(text).trim()) root.focusResult = "error: " + String(text).trim() }
    onExited: if (root.focusReleasePending) { root.focusReleasePending = false; Qt.callLater(function() { root.focusAction("release") }) }
  }
  // Disabling releases only our unchanged hide flag, never a later user hide.
  readonly property bool releaseFocus: configLoaded && options.seal !== "on"
  onReleaseFocusChanged: if (releaseFocus) focusAction("release")
  Variants {
    model: root.themeEdgeVisible ? Quickshell.screens : []
    delegate: Component {
      ThemeEdge {
        spec: root.material ? root.material.edge : null
        themeDir: root.themeDir
        stamp: root.themeStamp
        barHeight: root.edgeBar ? root.edgeBar.barSize : Style.bar.sizeHorizontal
      }
    }
  }
  // option `frames`: a glint on the focused window's frame – as a card's (glint) or once round it
  // (orbit, metal themes); the theme's metal (chrome) or glass (its own quiet glint, while the glass
  // material is on), whatever the edge option says
  WindowGlint {
    id: windowGlint
    metal: root.material && root.material.metal ? root.material.metal : null
    glass: root.material && root.material.glass && root.options.glass !== "off" ? root.material.glass : null
    style: root.options.frames === "orbit" ? "orbit" : "sweep"
    enabled: (root.options.frames === "glint" || root.options.frames === "orbit") && (!!metal || !!glass)
  }

  // ---------------------------------------------------------------- base layout
  property var baseLayout: null
  property bool baseChecked: false
  Process {
    running: true
    command: ["mkdir", "-p", root.stateDir]
    onExited: baseFile.reload()
  }
  FileView {
    id: baseFile
    path: root.stateDir + "/base.json"
    printErrors: false
    onLoaded: { try { root.baseLayout = JSON.parse(text()).layout } catch (e) { root.baseLayout = null }; root.baseChecked = true }
    onLoadFailed: root.baseChecked = true
  }
  onBaseCheckedChanged: if (baseChecked && !baseLayout) captureBase()
  onCurrentLayoutChanged: if (baseChecked && !baseLayout) captureBase()

  function captureBase() {
    var current = currentLayout
    if (!current || (!current.left && !current.center && !current.right)) return "no bar layout yet"
    // base.json lost while our modules are live: rebuild the native layout
    // from them (folded widgets keep their settings) instead of dead-ending.
    var reconstructed = Presets.hasOwn(current)
    baseLayout = reconstructed ? Presets.reconstructBase(current) : Presets.stripOwn(current)
    baseFile.setText(JSON.stringify({ version: 1, saved: new Date().toISOString(), reconstructed: reconstructed, layout: baseLayout }, null, 2) + "\n")
    if (reconstructed) lastResult = "Baseline rebuilt from the current bar (base.json was missing)"
    return "ok"
  }

  // Named combinations are local data, never filenames or shell arguments.
  property var savedPresets: []
  property bool savedReady: false
  property string saveResult: ""
  FileView {
    id: savedFile
    atomicWrites: true
    path: root.stateDir + "/presets.json"
    printErrors: false
    onLoaded: {
      try {
        var data = JSON.parse(text())
        if (!Array.isArray(data)) throw new Error("not a list")
        root.savedPresets = data.filter(function(p) { return p && typeof p.name === "string" && p.options })
        root.savedReady = true
      } catch (e) { root.saveResult = "Cannot read saved combinations; file kept unchanged"; root.savedReady = false }
    }
    onLoadFailed: function(error) {
      // Only a missing file is safe to initialize.
      root.savedReady = error === FileViewError.FileNotFound
      if (!root.savedReady) root.saveResult = "Cannot read saved combinations"
    }
  }
  // opts: the options to save (the Control Center passes its staged ones);
  // default: the live options.
  function saveCombination(name, opts) {
    name = String(name).trim()
    if (!savedReady) return "Saved combinations are not available"
    if (!name || name.length > 48) return "Use a name of 1–48 characters"
    var next = savedPresets.filter(function(p) { return p.name !== name })
    next.push({ name: name, options: Presets.normalizeOptions(opts || options) })
    next.sort(function(a, b) { return a.name.localeCompare(b.name) })
    savedPresets = next
    savedFile.setText(JSON.stringify(next, null, 2) + "\n")
    return "Saved: " + name
  }
  function loadCombination(name) {
    for (var i = 0; i < savedPresets.length; i++) if (savedPresets[i].name === name) return apply(Presets.keepLook(savedPresets[i].options, options))
    return "Unknown combination"
  }
  function deleteCombination(name) {
    if (!savedReady) return
    savedPresets = savedPresets.filter(function(p) { return p.name !== name })
    savedFile.setText(JSON.stringify(savedPresets, null, 2) + "\n")
    saveResult = "Removed: " + name
  }

  // ---------------------------------------------------------------- apply
  property string lastResult: ""
  readonly property bool writing: writer.running
  property var lastWritten: null    // options of the last write (the Control Center waits for them)
  Process {
    id: writer
    property string payload: ""
    command: ["python3", root.pluginDir + "/bin/apply-layout.py"]
    stdinEnabled: true
    onStarted: { write(payload); stdinEnabled = false }
    stdout: StdioCollector { onStreamFinished: root.lastResult = String(text).trim() }
    stderr: StdioCollector { onStreamFinished: if (String(text).trim()) root.lastResult = "error: " + String(text).trim() }
    onExited: stdinEnabled = true
  }

  function apply(nextOptions) {
    if (!baseLayout) captureBase()
    if (!baseLayout) return "no base layout"
    if (writer.running) return "busy"
    var opts = Presets.normalizeOptions(nextOptions)
    if (currentLayout && !Presets.layoutDiffers(opts, options)) {
      // only look options (edge, Super+Space): save them, keep the bar as arranged
      lastWritten = opts
      writer.payload = JSON.stringify({ pluginId: pluginId, options: opts, layout: currentLayout })
      writer.running = true
      return "ok"
    }
    var merged = Presets.mergeEmbeddedSettings(baseLayout, currentLayout)
    if (JSON.stringify(merged) !== JSON.stringify(baseLayout)) {
      baseLayout = merged
      baseFile.setText(JSON.stringify({ version: 1, layout: merged }, null, 2) + "\n")
    }
    lastWritten = opts
    writer.payload = JSON.stringify({ pluginId: pluginId, options: opts, layout: Presets.build(baseLayout, opts, moduleDir) })
    writer.running = true
    return "ok"
  }
  function applyPreset(id) {
    var p = Presets.presetById(String(id))
    return p ? apply(Presets.keepLook(p.options, options)) : "unknown preset: " + id
  }
  function applyScreens(profiles) {
    if (writer.running) return "busy"
    writer.payload = JSON.stringify({ pluginId: pluginId, profilesOnly: true,
                                     screenProfiles: Presets.normalizeScreens(profiles) })
    writer.running = true
    return "ok"
  }
  function setVariant(element, variant) {
    if (!Presets.ELEMENTS[element] || !Presets.ELEMENTS[element].variants.some(function(v) { return v.id === variant })) return "unknown element or variant"
    var o = JSON.parse(JSON.stringify(options))
    o[String(element)] = String(variant)
    return apply(o)
  }

  // ---------------------------------------------------------------- modules' shared state
  Binding { target: Bridge.ModuleBus; property: "engine"; value: root }
  Binding { target: Bridge.ModuleBus; property: "material"; value: root.materialOn ? root.presentationMaterial : null }
  Binding { target: Bridge.ModuleBus; property: "themeDir"; value: root.themeDir }
  Binding { target: Bridge.ModuleBus; property: "themeStamp"; value: root.themeStamp }
  // Metal family: only a workspace switch counts as a change. Focus moves too
  // often to glint each time (the window border turns for it), and a popup
  // glints its own rim as it opens. A burst of events gives one glint, and
  // none follows within material.metal `pulseGapMs` (4000) of the last.
  Connections {
    target: Hyprland
    enabled: !!Bridge.ModuleBus.metal
    function onRawEvent(event) {
      if (event && event.name === "workspacev2") metalPulseTimer.restart()
    }
  }
  property double lastMetalPulse: 0
  Timer {
    id: metalPulseTimer
    interval: 90
    onTriggered: {
      var m = Bridge.ModuleBus.metal, now = Date.now()
      var gap = m && Number(m.pulseGapMs) >= 0 ? Number(m.pulseGapMs) : 4000
      if (now - root.lastMetalPulse < gap) return
      root.lastMetalPulse = now
      Bridge.ModuleBus.pulse()
    }
  }

  // ---------------------------------------------------------------- AI usage refresh
  // omarchy.agents (and the AI usage widget) keep ~/.local/state/omarchy/
  // agents/usage current only while they sit in the bar. When a variant folds
  // them away, the engine runs the same collectors with the Agents widget's
  // own settings (interval, disabled providers); otherwise limits froze at
  // their last value (e.g. a 5-hour limit at 100 % long after its reset).
  readonly property var agentsSettings: {
    var lists = baseLayout ? [baseLayout.left, baseLayout.center, baseLayout.right] : []
    for (var s = 0; s < lists.length; s++)
      for (var i = 0; i < (lists[s] || []).length; i++)
        if (Presets.entryId(lists[s][i]) === "omarchy.agents") return typeof lists[s][i] === "object" ? lists[s][i] : ({})
    return ({})
  }
  readonly property bool usageFolded: {
    var folded = Presets.foldedIds(options)
    var lists = baseLayout ? [baseLayout.left, baseLayout.center, baseLayout.right] : []
    for (var s = 0; s < lists.length; s++)
      for (var i = 0; i < (lists[s] || []).length; i++) {
        var id = Presets.entryId(lists[s][i])
        if (Presets.AI_IDS.indexOf(id) !== -1 && folded.indexOf(id) !== -1) return true
      }
    return false
  }
  readonly property int usageIntervalSec: Math.max(30, Number(agentsSettings.refreshIntervalSec || 900))
  readonly property bool usageRunning: usageUpdate.running
  property string pendingUsage: ""
  property double lastLimitsRun: 0
  Timer {
    interval: root.usageIntervalSec * 1000
    running: root.usageFolded
    repeat: true
    triggeredOnStart: true
    onTriggered: root.refreshUsage("normal")
  }
  function usageCommand(kind, ids) {
    var command = ["omarchy-agent-usage-update"]
    if (kind === "force") command.push("--force")
    if (kind === "limits") command.push("--limits-only")
    var providers = agentsSettings.providers || {}
    for (var id in providers) if (providers[id] && providers[id].enabled === false) command.push("--except", id)
    return command.concat(ids || [])
  }
  function refreshUsage(kind, ids) {
    if (!usageFolded) return          // the native widgets refresh themselves
    if (kind === "limits" && !ids) {  // expired limits / opened popups: at most once a minute
      if (Date.now() - lastLimitsRun < 60000) return
      lastLimitsRun = Date.now()
    }
    if (usageUpdate.running) { if (kind === "force" || pendingUsage === "") pendingUsage = kind; return }
    usageUpdate.command = usageCommand(kind, ids)
    usageUpdate.running = true
  }
  Process {
    id: usageUpdate
    onExited: {
      if (root.pendingUsage !== "") { var k = root.pendingUsage; root.pendingUsage = ""; root.refreshUsage(k); return }
      retryScan.running = true
    }
  }
  // A collector that could not reach its endpoint (e.g. right after login)
  // sets retryAdvised: retry just those limits after 30 s, as omarchy.agents does.
  Process {
    id: retryScan
    command: ["sh", "-c", "grep -l '\"retryAdvised\": *true' \"${XDG_STATE_HOME:-$HOME/.local/state}\"/omarchy/agents/usage/*.json 2>/dev/null | sed 's#.*/##; s#\\.json$##'"]
    stdout: StdioCollector { onStreamFinished: { var ids = String(text).split("\n").filter(function(s) { return s }); if (ids.length) { usageRetry.ids = ids; usageRetry.restart() } } }
  }
  Timer { id: usageRetry; property var ids: []; interval: 30000; onTriggered: root.refreshUsage("limits", ids) }
  Connections {
    target: Bridge.ModuleBus
    function onUsageRefreshRequested(kind) { root.refreshUsage(kind) }
  }

  // ---------------------------------------------------------------- panel contract
  // The panel is the Control Center. Closing it is Cancel: whatever Use
  // applied goes back (see ControlCenter.qml). payloadJson may name an
  // area: {"area": "quick|bar|screens|motion|island|cards|health"}.
  property bool isOpen: false
  readonly property bool opened: isOpen
  function open(payloadJson) {
    var area = ""
    try { var p = JSON.parse(payloadJson || "{}"); area = p && p.area ? String(p.area) : "" } catch (e) {}
    if (isOpen) { if (area) controlCenter.showArea(area); return }
    controlCenter.requestedArea = area
    isOpen = true
  }
  function close() { if (isOpen) controlCenter.cancel() }
  function toggle() { if (isOpen) close(); else open("") }

  ControlCenter {
    id: controlCenter
    host: root
    open: root.isOpen
    onCloseRequested: root.isOpen = false
  }

  // ---------------------------------------------------------------- drop-down logo menu
  // The drop-down logo menu (DropMenu.qml) lives in the workspaces module.
  property bool dropMenuOpen: false
  // the screen whose drop-down was open last (questions with no other home go there)
  property string lastDropScreen: ""
  function syncDropMenu() {
    var shown = (Bridge.ModuleBus.instances.workspaces || []).filter(function(i) { return i && i.dropOpen })
    dropMenuOpen = shown.length > 0
    var screen = shown.length ? root.screenOf(shown[0]) : ""
    if (screen) lastDropScreen = screen
  }
  function screenOf(item) {
    try {
      var w = item.QsWindow.window
      return w && w.screen ? String(w.screen.name) : ""
    } catch (e) {
      return ""
    }
  }

  // ---------------------------------------------------------------- drop-down questions (bin/menu-shim)
  // Actions run from the drop-down find bin/menu-shim first on their PATH.
  // Its omarchy-menu-select / omarchy-menu-input send their payload here
  // (IPC `ask` below) instead of summoning the centred menu; "ok" means a
  // drop-down took it and answers through the payload's files, anything
  // else sends the shim to Omarchy's own command.
  readonly property string shimDir: pluginDir + "/bin/menu-shim"
  // Where a question goes: the drop-down that launched the asking action
  // (its token), else an open one, else the screen that had it last, else
  // the focused screen's, else the first.
  function dropTarget(token) {
    var all = (Bridge.ModuleBus.instances.workspaces || []).filter(function(i) { return i && i.dropAvailable })
    var i
    if (token) for (i = 0; i < all.length; i++) if (all[i].dropTracks(token)) return all[i]
    for (i = 0; i < all.length; i++) if (all[i].dropOpen) return all[i]
    for (i = 0; i < all.length; i++) if (root.lastDropScreen && root.screenOf(all[i]) === root.lastDropScreen) return all[i]
    var focused = Bridge.ModuleBus.pick("workspaces")
    if (focused && focused.dropAvailable) return focused
    return all.length ? all[0] : null
  }
  function ask(payloadJson) {
    var p = null
    try { p = JSON.parse(String(payloadJson || "")) } catch (e) { return "invalid payload" }
    if (!p || typeof p !== "object" || (p.mode !== "select" && p.mode !== "input")) return "invalid payload"
    // the answer goes into these files: absolute paths only
    var done = typeof p.doneFile === "string" ? p.doneFile : ""
    var sel = typeof p.selectionFile === "string" ? p.selectionFile : ""
    if (done.charAt(0) !== "/" || (sel && sel.charAt(0) !== "/")) return "invalid payload"
    var target = root.dropTarget(String(p.token || ""))
    if (!target) return "no drop-down"
    return target.dropAsk(p) ? "ok" : "no drop-down"
  }
  // For `tusche-bar state`: the app library facade, and per screen the
  // questions pending and the asking actions still running.
  function askState() {
    var out = { shimDir: root.shimDir, appLibrary: !!(root.shell && root.shell.appLibrary), lastScreen: root.lastDropScreen, screens: {} }
    ;(Bridge.ModuleBus.instances.workspaces || []).forEach(function(i) {
      var s = i && typeof i.dropState === "function" ? i.dropState() : null
      if (s) out.screens[root.screenOf(i) || "?"] = s
    })
    return out
  }
  SysState { id: sysState; active: root.dropMenuOpen }
  readonly property alias sys: sysState

  function run(cmd) { Quickshell.execDetached(["sh", "-c", cmd]) }

  // Open a widget's own popup, wherever it lives now: folded into the
  // status module (embedded) or still in the bar.
  function openWidget(id) {
    var folded = options.right !== "today" && Presets.foldedIds(options).indexOf(id) !== -1
    run(folded ? "omarchy-shell tusche-status member " + id : "omarchy-shell shell summon " + id)
  }
  function focusAgent(a) {
    if (!a) return
    var pane = String(a.pane || "")
    if (pane.indexOf("oc:") === 0) Quickshell.execDetached(["xdg-open", "http://127.0.0.1:18789/"])
    else Quickshell.execDetached(["herdr", "agent", "focus", pane])
  }
  function closeModulePopups() {
    ;(Bridge.ModuleBus.instances.status || []).forEach(function(i) {
      i.closePopup()
      Object.keys(i.mounted).forEach(function(id) { var m = i.mounted[id]; if (m && typeof m.close === "function") m.close() })
    })
    ;(Bridge.ModuleBus.instances.quota || []).forEach(function(i) { i.close() })
    ;(Bridge.ModuleBus.instances.workspaces || []).forEach(function(i) { i.close() })
  }
  onIsOpenChanged: if (isOpen) closeModulePopups()
  Component.onCompleted: pluginScan.running = true

  // Which third-party plugins exist on this machine: menu entries for absent
  // ones stay hidden, so the menus work on any setup. Omarchy's own widgets
  // (omarchy.*) always count as present.
  property var installedPlugins: []
  Process {
    id: pluginScan
    command: ["sh", "-c", "ls -1 \"$HOME/.config/omarchy/plugins\" 2>/dev/null; true"]
    stdout: StdioCollector { onStreamFinished: root.installedPlugins = String(text).split("\n").filter(function(l) { return l.length > 0 }) }
  }
  function hasPlugin(id) { return String(id).indexOf("omarchy.") === 0 || installedPlugins.indexOf(String(id)) !== -1 }
  function present(items) { return items.filter(function(e) { return !e.requires || root.hasPlugin(e.requires) }) }
  onDropMenuOpenChanged: if (dropMenuOpen) { isOpen = false; pluginScan.running = true }
  // Super+Alt+M / logo: the drop-down menu under the logo of the focused
  // screen; without a logo shown, Omarchy's own menu. mode "search" opens it
  // as a launcher (Super+Space: search line, apps first), "apps" on the Apps
  // list (Super+Alt+Space).
  function toggleMenu(mode) {
    var w = Bridge.ModuleBus.pick("workspaces")
    if (w && w.showMenu) {
      if (mode === "search") w.openSearch()
      else if (mode === "apps") w.openApps()
      else w.toggleDrop()
    } else run(mode === "apps" ? "omarchy-menu toggle apps" : "omarchy-menu toggle root")
  }

  // Super+Space follows the option: bin/keybinds.py keeps (or removes) one
  // managed block in ~/.config/hypr/bindings.lua. Synced once the options are
  // read and whenever the option changes.
  property string keysState: ""
  property bool keysPending: false
  readonly property string keysOption: options.keys
  onKeysOptionChanged: syncKeys()
  onConfigLoadedChanged: syncKeys()
  function syncKeys() {
    if (!configLoaded) return
    if (keysProc.running) { keysPending = true; return }
    keysProc.action = keysOption === "bar" ? "bar" : "omarchy"
    keysProc.running = true
  }
  Process {
    id: keysProc
    property string action: "status"
    command: ["python3", root.pluginDir + "/bin/keybinds.py", action]
    stdout: StdioCollector { onStreamFinished: root.keysState = String(text).trim() }
    onExited: if (root.keysPending) { root.keysPending = false; root.syncKeys() }
  }

  // Menus (built on demand from live state). Items: { label, note, checked,
  // key, disabled, separator, action }.
  function menuModel() {
    var s = sysState
    var sep = { separator: true }
    var agents = s.agents.map(function(a) {
      return { label: (a.title || a.agent || "Agent"), note: (a.agent || "") + " · " + (a.status === "blocked" ? "waiting" : a.status === "working" ? "working" : "idle"),
               action: function() { root.focusAgent(a) } }
    })
    if (!agents.length) agents = [{ label: "No agents reported", disabled: true }]
    var groups = [
      { title: "Omarchy", items: [
        { label: "Omarchy menu …", action: function() { root.run("omarchy-menu toggle root") } },
        { label: "Terminal", key: "↵", action: function() { root.run("xdg-terminal-exec") } },
        sep,
        { label: "Do not disturb", checked: s.dnd, action: function() { root.run("omarchy-shell notifications toggleDnd") } },
        { label: "Stay awake", checked: s.stayAwake, action: function() { root.run("omarchy-toggle-idle") } },
        { label: "Transparent bar", checked: root.barTransparent, action: function() { root.run("omarchy-bar transparent toggle") } },
        sep,
        { label: "Lock", action: function() { root.run("loginctl lock-session") } }
      ] },
      { title: "Agents", items: agents.concat([sep,
        { label: "Quotas …", action: function() { root.run(root.options.ai !== "today" ? "omarchy-shell tusche-quota toggle" : "omarchy-shell shell summon nerdibeard.ai-usage") } }]) },
      { title: "System", items: [
        { label: "System monitor …", note: "CPU " + Math.round(s.cpu * 100) + " %", requires: "bitr0t.system-monitor", action: function() { root.openWidget("bitr0t.system-monitor") } },
        { label: "Display & brightness …", requires: "nerdibeard.monitor", action: function() { root.openWidget("nerdibeard.monitor") } },
        { label: "Google Drive …", requires: "nerdibeard.googledrive", action: function() { root.openWidget("nerdibeard.googledrive") } },
        { label: "Rain radar …", requires: "com.omastorm.radar", action: function() { root.openWidget("com.omastorm.radar") } },
        { label: "Manage plugins …", requires: "community.plugin-manager", action: function() { root.openWidget("community.plugin-manager") } }
      ] },
      { title: "Network", items: [
        { label: "Wi-Fi · " + (s.wifiUp ? s.wifiName : "disconnected"), action: function() { root.openWidget("omarchy.network") } },
        { label: "Proton VPN", checked: s.vpnUp, note: s.vpnUp ? "disconnect" : "connect", requires: "io.github.iamfitsum.omarchy-proton-vpn",
          action: function() { root.run(s.vpnUp ? "protonvpn disconnect" : "protonvpn connect") } },
        { label: "Tailscale", checked: s.tailscaleUp, note: s.tailscaleUp ? "disconnect" : "connect",
          action: function() { root.run(s.tailscaleUp ? "tailscale down" : "tailscale up") } },
        { label: "Bluetooth …", action: function() { root.openWidget("omarchy.bluetooth") } }
      ] },
      { title: "Phone", items: [
        { label: "Flux · " + (s.phone ? s.phone.name : "phone"), note: s.phone && s.phone.charge >= 0 ? s.phone.charge + " %" : "", requires: "flux", action: function() { root.run("omarchy-shell shell toggle flux") } },
        { label: "Buds …", requires: "io.github.nerdislb.buds-control", action: function() { root.openWidget("io.github.nerdislb.buds-control") } },
        sep,
        { label: "WhatsApp …", requires: "io.github.moizibnyousaf.omawhatsapp", action: function() { root.run("omarchy-shell io.github.moizibnyousaf.omawhatsapp toggleDropdown") } },
        { label: "Mail …", requires: "omamail", action: function() { root.run("omarchy-shell shell toggle omamail") } }
      ] },
      { title: "Tools", items: [
        { label: "Open island", requires: "nerdibeard.tusche-island", action: function() { root.run("omarchy-shell tusche-island expand") } },
        { label: "Control Center …", action: function() { root.open("") } }
      ] }
    ]
    // entries of absent plugins drop out; no doubled or dangling separators; empty groups go
    return groups.map(function(g) {
      var out = []
      root.present(g.items).forEach(function(e) {
        if (e.separator && (!out.length || out[out.length - 1].separator)) return
        out.push(e)
      })
      while (out.length && out[out.length - 1].separator) out.pop()
      return { title: g.title, items: out }
    }).filter(function(g) { return g.items.length > 0 })
  }

  // The same menus for the drop-down: our groups under the Omarchy menu
  // (whose own entries replace "Omarchy menu …"). Items as in menuModel().
  function dropGroups() {
    var m = menuModel()
    function items(title) { for (var i = 0; i < m.length; i++) if (m[i].title === title) return m[i].items; return [] }
    function pick(title, labels) { return items(title).filter(function(e) { return labels.indexOf(e.label) !== -1 }) }
    var sep = { separator: true }
    var groups = [
      { id: "agents", title: "Agents", icon: "\u{f06a9}", items: items("Agents") },
      { id: "network", title: "Network", icon: "\u{f05a9}", items: items("Network") },
      { id: "phone", title: "Phone", icon: "\u{f011c}", items: items("Phone") },
      { id: "widgets", title: "Widgets", icon: "\u{f056e}", items: items("System") },
      { id: "bar", title: "Tusche", icon: "\u{f02ca}",
        items: pick("Tools", ["Open island", "Control Center …"]).concat([sep],
               pick("Omarchy", ["Terminal", "Do not disturb", "Stay awake", "Transparent bar"])) }
    ]
    return groups.map(function(g) {
      var it = g.items.slice()
      while (it.length && it[it.length - 1].separator) it.pop()
      return { id: g.id, title: g.title, icon: g.icon, items: it }
    }).filter(function(g) { return g.items.length > 0 })
  }

  IpcHandler {
    target: "tusche-status"
    function group(id: string): void { var i = Bridge.ModuleBus.pick("status"); if (i) i.openGroup(id, i) }
    function member(id: string): void { var i = Bridge.ModuleBus.pick("status"); if (i) i.openMember(id) }
    function close(): void { var all = Bridge.ModuleBus.instances.status || []; all.forEach(function(i) { i.closePopup() }) }
    function state(): string { var i = Bridge.ModuleBus.pick("status"); return i ? i.stateJson() : "{}" }
  }
  IpcHandler {
    target: "tusche-quota"
    function toggle(): void { var i = Bridge.ModuleBus.pick("quota"); if (i) i.togglePopup() }
    // Open the popup on one agent's card (claude, codex, antigravity, deepseek …).
    function select(id: string): string { var i = Bridge.ModuleBus.pick("quota"); if (!i) return "no quota widget"; var r = i.select(id); if (r === "ok") i.open(); return r }
    function state(): string { var i = Bridge.ModuleBus.pick("quota"); return i ? JSON.stringify({ variant: i.variant, items: i.items, rings: i.ringItems, agents: i.agentIds, shown: i.shownId, open: i.popupOpen }) : "{}" }
  }

  IpcHandler {
    target: "tusche-bar"
    function options(): void { root.toggle() }
    // Open the Control Center at an area (or switch to it when open).
    function cc(area: string): string {
      var a = String(area || "quick")
      if (!CCModel.isArea(a)) return "areas: " + CCModel.AREAS.map(function(x) { return x.id }).join(" ")
      root.open(JSON.stringify({ area: a }))
      return "ok"
    }
    function save(name: string): string { return root.saveCombination(name) }
    function load(name: string): string { return root.loadCombination(name) }
    // A question from bin/menu-shim (omarchy-menu-select / -input payload):
    // "ok" when a drop-down took it.
    function ask(payload: string): string { return root.ask(payload) }
    function menu(): void { root.toggleMenu("") }
    // Super+Space: the menu as a launcher (search line, apps first)
    function search(): void { root.toggleMenu("search") }
    // Super+Alt+Space: the menu on the Apps list
    function apps(): void { root.toggleMenu("apps") }
    function preset(id: string): string { return root.applyPreset(id) }
    function set(element: string, variant: string): string { return root.setVariant(element, variant) }
    function focus(action: string): string { return root.focusAction(action || "start") }
    function screenProfile(name: string, profile: string): string {
      if (!Presets.screenNameValid(name) || ["inherit", "compact", "detailed"].indexOf(profile) < 0) return "invalid screen or profile"
      var next = Object.assign({}, root.screenProfiles)
      if (profile === "inherit") delete next[name]; else next[name] = profile
      return root.applyScreens(next)
    }
    // the selected glint once on the focused window's frame now (metal themes), for other events
    function glintWindow(): string { return windowGlint.trigger() ? "ok" : "needs a theme with a frame glint (Chrom, Platin, or Frost / Smoke with the glass material on) and motion" }
    // After choosing Today: fresh snapshot of your own layout. Without any
    // baseline (base.json lost) it rebuilds one from our modules instead.
    function recaptureBase(): string {
      if (Presets.hasOwn(root.currentLayout) && root.baseLayout) return "restore Today before capturing the baseline"
      return root.captureBase()
    }
    function state(): string {
      return JSON.stringify({ preset: root.presetId, options: root.options, hasBase: root.baseLayout !== null,
                              screenProfiles: root.screenProfiles, focus: { busy: root.focusBusy, result: root.focusResult },
                              announce: announcer.stateObject(), watchdog: watchdog.stateObject(),
                              open: root.isOpen, dropMenuOpen: root.dropMenuOpen, saved: root.savedPresets.map(function(p) { return p.name }), lastResult: root.lastResult, moduleDir: root.moduleDir,
                              keys: { option: root.keysOption, bindings: root.keysState },
                              edge: { option: root.options.edge, material: root.material ? (root.material.edge ? root.material.edge.kind : "no edge") : null, themeEdge: root.themeEdgeVisible, barReady: root.barReady },
                              frames: { option: root.options.frames, glint: windowGlint.enabled, renderer: windowGlint.glassFrame ? "glass" : (windowGlint.metal ? "metal" : null), style: windowGlint.style, running: windowGlint.running, durationMs: windowGlint.orbit ? windowGlint.durationMs : windowGlint.sweepMs, sweep: windowGlint.sweep, amount: windowGlint.amount, frame: [windowGlint.gx, windowGlint.gy, windowGlint.fw, windowGlint.fh], tube: windowGlint.tube },
                              glass: { available: !!(root.material && root.material.glass), enabled: root.options.glass !== "off", spring: root.options.glassMotion !== "off", family: root.material ? root.material.family : null },
                              usage: { folded: root.usageFolded, intervalSec: root.usageIntervalSec, running: usageUpdate.running, command: usageUpdate.command },
                              ask: root.askState(),
                              natives: (function() { var s = Bridge.ModuleBus.pick("status"); return s && s.nativeReport ? s.nativeReport() : null })(),
                              cc: controlCenter.stateObject() })
    }
  }
}
