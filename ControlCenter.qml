import QtQuick
import QtQuick.Controls
import Quickshell
import Quickshell.Io
import Quickshell.Wayland
import Quickshell.Hyprland
import qs.Commons
import qs.Commons as Commons
import qs.Ui as Ui
import "Presets.js" as Presets
import "ControlCenter.js" as CC
import "bridge" as Bridge

// Control Center: one window for the Tusche Bar, the Tusche Island and the
// card picker, plus Health. Structure after Shibumi's (Quick · Configure,
// areas on the left, editor on the right, Ctrl+K search over settings and
// their values, a Health chip), with explicit commits:
//   Use    applies the staged changes live, the window stays open;
//   Save   applies what is still staged and closes;
//   Cancel (button, ×, Esc once the search is closed, click outside, or
//          any other close) restores the state from opening if Use applied
//          something, then closes.
// Writes go through the engine's apply (bar), the island's IPC (island) and
// the card picker's menu-override.py (cards) — see ControlCenter.js.
PanelWindow {
  id: win

  property var host: null
  property bool open: false
  signal closeRequested()

  // ---------------------------------------------------------------- state
  property string area: "quick"
  property string configureArea: "bar"     // where "Configure" goes back to
  property string requestedArea: ""        // set before opening (IPC: cc <area>)
  property var snapshot: null              // live state at opening
  property var edits: ({})                 // staged, not applied: { "<domain>.<key>": value }
  property bool usedLive: false            // Use applied something since opening
  property var applied: ({})               // domains Use touched: bar · island · cards
  property bool committed: false           // closed with Save
  property string message: ""
  property bool messageError: false
  property string closeNote: ""            // a failed revert, shown at the next opening
  property string flashId: ""
  property int searchSel: 0

  readonly property var live: CC.liveState(host ? host.options : ({}), host ? host.config : ({}), cardsStatus)
  readonly property var pending: CC.pendingState(live, edits)
  readonly property var changeList: CC.changes(edits, live)
  readonly property bool islandAvailable: live.island !== null
  readonly property bool searchOpen: searchField.activeFocus && searchField.text.trim() !== ""
  // Shared renderers receive only a read-only view of already-running widgets.
  // An unavailable native part stays unavailable; no preview starts a service.
  readonly property var previewSnapshot: {
    var result = {}, kinds = { workspaces: "workspaces", quota: "quota", status: "status" }
    Object.keys(kinds).forEach(function(key) {
      var item = Bridge.ModuleBus.pick(kinds[key])
      if (item && item.previewData) result[key] = item.previewData()
    })
    return result
  }
  readonly property var screenChoices: Quickshell.screens.map(function(s) {
    return { name: s.name, width: s.width, height: s.height, x: s.x, y: s.y }
  })

  // ---------------------------------------------------------------- probes (read-only)
  readonly property string homeDir: Quickshell.env("HOME")
  readonly property string cardsScript: homeDir + "/.config/omarchy/plugins/nerdibeard.card-picker/bin/menu-override.py"
  readonly property string markerPath: homeDir + "/.local/state/omarchy/tusche-island/notifications-takeover"
  readonly property string usageDir: (Quickshell.env("XDG_STATE_HOME") || homeDir + "/.local/state") + "/omarchy/agents/usage"
  property string cardsStatus: ""          // enabled · disabled · missing · error · "" (not known yet)
  property var islandNotes: null           // island IPC state.notifications · false: no answer · null: unknown
  property double islandNotesAt: 0         // start time of the probe that produced islandNotes
  property double probeStartedAt: 0
  property var markerExists: null
  property var usageAge: null              // seconds since the newest usage record · -1: none

  readonly property var healthList: CC.healthChecks({
    hasBase: !!(host && host.baseLayout),
    usageFolded: !!(host && host.usageFolded),
    usageRunning: !!(host && host.usageRunning),
    usageIntervalSec: host ? host.usageIntervalSec : 900,
    usageAgeSec: usageAge,
    islandConfigured: islandAvailable,
    islandWants: !!(live.island && live.island.notifications === "true"),
    islandState: islandNotes,
    marker: markerExists,
    cards: cardsStatus,
    cardsConfigured: host ? CC.listed(host.config, CC.CARDS_ID) : false,
    lastResult: host ? host.lastResult : "",
    savedError: host && !host.savedReady ? host.saveResult : "",
    savedCount: host ? host.savedPresets.length : 0
  })
  readonly property var health: CC.healthSummary(healthList)

  readonly property var searchResults: searchOpen ? CC.search(CC.searchIndex(live, edits, [
      { id: "bar.presets", area: "bar", label: "Presets", current: presetName(pending.bar),
        values: Presets.PRESETS.map(function(p) { return p.label + " · " + p.note }) },
      { id: "bar.combos", area: "bar", label: "My combinations", current: "",
        values: host ? host.savedPresets.map(function(p) { return p.name }) : [] },
      { id: "screens.profiles", area: "screens", label: "Screen presentation", current: "",
        values: ["Compact", "Detailed", "Use the shared bar"].concat(screenChoices.map(function(s) { return s.name })) },
      { id: "motion.preview", area: "motion", label: "Material and motion preview", current: "",
        values: ["Popup", "Frame glint", "Reduced motion"] }
    ].concat(healthList.map(function(c) {
      return { id: "health." + c.id, area: "health", label: c.label, values: [c.detail],
               current: c.state === "issue" ? "issue" : c.state === "ok" ? "OK" : "…" }
    }))), searchField.text, 8) : []
  onSearchResultsChanged: if (searchSel >= searchResults.length) searchSel = 0

  readonly property string footerText: working ? workText
    : message !== "" ? message
    : changeList.length ? changeList.length + (changeList.length === 1 ? " change" : " changes") + " staged, not applied · Use tries it live, Save applies and closes"
    : usedLive ? "Live, not saved yet · Save keeps it, Cancel restores the state from opening"
    : "Ctrl+K search · ↑↓ areas · Esc cancels"
  readonly property color footerTone: !working && message !== "" && messageError ? Commons.Color.urgent
    : working || message !== "" || changeList.length || usedLive ? Commons.Color.accent
    : Util.alpha(Commons.Color.popups.text, 0.6)

  function presetName(options) {
    var p = Presets.presetById(Presets.matchPreset(options))
    return p ? p.label : "custom"
  }
  function areaMeta(id) {
    if (id === "quick") return changeList.length ? changeList.length + " staged" : ""
    if (id === "bar") return presetName(live.bar)
    if (id === "screens") return Object.keys(live.screens).length + " overrides"
    if (id === "island") return !live.island ? "not found" : live.island.notifications === "true" ? "in the bar" : "Omarchy"
    if (id === "cards") return cardsStatus === "enabled" ? "on" : cardsStatus === "disabled" ? "off" : cardsStatus === "missing" ? "not installed" : ""
    if (id === "health") return health.label
    return ""
  }
  function areaHasEdits(id) {
    return changeList.some(function(c) { return id === "quick" ? CC.QUICK.indexOf(c.id) !== -1 : c.area === id })
  }

  // ---------------------------------------------------------------- open / close
  onOpenChanged: { if (open) begin(); else end(); reveal() }

  function begin() {
    if (working) { beginAfterWork = true; return }
    cancelAfterWork = false
    area = CC.isArea(requestedArea) ? requestedArea : "quick"
    if (area !== "quick") configureArea = area
    requestedArea = ""
    edits = ({}); usedLive = false; applied = ({}); committed = false
    cardsStatus = ""                            // read again below; joins the snapshot when it arrives
    snapshot = CC.copy(live)
    message = closeNote; messageError = closeNote !== ""; closeNote = ""
    flashId = ""; searchSel = 0
    searchField.text = ""; comboName.text = ""
    editor.contentY = 0
    refreshHealth()
    keys.forceActiveFocus()
  }
  function end() {
    searchField.text = ""
    if (working) return                         // finishQueue decides
    if (!committed && usedLive) revertInBackground()
  }
  // The card picker's state is read fresh after opening: it belongs to the snapshot.
  onCardsStatusChanged: if (open && snapshot && !snapshot.cards && (cardsStatus === "enabled" || cardsStatus === "disabled")) {
    var s = CC.copy(snapshot); s.cards = { override: cardsStatus }; snapshot = s
  }

  function showArea(a) {
    if (!CC.isArea(a)) return false
    area = a
    if (a !== "quick") configureArea = a
    editor.contentY = 0
    if (a === "health") refreshHealth()
    else if (a === "cards" && !working) refreshCards()
    return true
  }
  function stepArea(d) {
    var ids = CC.AREAS.map(function(x) { return x.id })
    showArea(ids[(ids.indexOf(area) + d + ids.length) % ids.length])
  }

  // ---------------------------------------------------------------- staging
  function pick(id, v) {
    if (working || !host) return
    message = ""; messageError = false
    edits = CC.stage(edits, live, id, v)
  }
  function stageOptions(options) {
    if (working) return
    message = ""; messageError = false
    edits = CC.stageBar(edits, live, Presets.keepLook(options, pending.bar))
  }
  function stagePreset(id) { var p = Presets.presetById(id); if (p) stageOptions(p.options) }
  function saveCombination(name) {
    if (host) host.saveResult = host.saveCombination(name, CC.commitBar(pending.bar))
  }

  // ---------------------------------------------------------------- Save · Use · Cancel
  function use() {
    if (working) return
    var steps = CC.plan(edits, live)
    if (!steps.length) { edits = CC.prune(edits, live); message = "Nothing staged"; messageError = false; return }
    runQueue(steps, "use")
  }
  function save() {
    if (working) return
    var steps = CC.plan(edits, live)
    if (!steps.length) { committed = true; closeRequested(); return }
    runQueue(steps, "save")
  }
  function cancel() {
    if (working) { cancelAfterWork = true; return }
    searchField.text = ""
    var steps = usedLive ? CC.revertPlan(snapshot, live, applied) : []
    if (!steps.length) { usedLive = false; applied = ({}); closeRequested(); return }
    runQueue(steps, "cancel")
  }
  function revertInBackground() {
    var steps = CC.revertPlan(snapshot, live, applied)
    if (!steps.length) { usedLive = false; applied = ({}); return }
    runQueue(steps, "revert")
  }

  // ---------------------------------------------------------------- apply queue
  // One step at a time, each confirmed before the next: the island writes
  // shell.json from the shell's in-memory copy and the bar from the engine's,
  // so overlapping writes would undo each other.
  property bool working: false
  property string workText: ""
  property string queueMode: ""            // use · save · cancel · revert (cancel = visible, revert = after an outside close)
  property var queue: []
  property var step: null
  property string phase: ""
  property double phaseAt: 0
  property double stepAt: 0
  property var doneDomains: ({})
  property bool cancelAfterWork: false
  property bool beginAfterWork: false

  function runQueue(steps, mode) {
    queue = steps.slice(); queueMode = mode; doneDomains = ({}); working = true
    message = ""; messageError = false
    nextStep()
  }
  function stepLabel(s) {
    if (s.domain === "screens") return "Screen presentation · " + s.keys.join(", ")
    if (s.domain === "island") { var spec = CC.setting("island." + s.key); return "Tusche Island · " + spec.label + ": " + CC.valueLabel(spec, s.value) }
    if (s.domain === "cards") return "Card picker · " + CC.valueLabel(CC.setting("cards.override"), s.value)
    return "Tusche Bar · " + s.keys.length + (s.keys.length === 1 ? " option" : " options") + " (the bar rebuilds)"
  }
  function setPhase(p) { phase = p; phaseAt = Date.now() }
  function nextStep() {
    if (!queue.length) { finishQueue(""); return }
    step = queue[0]; queue = queue.slice(1); stepAt = Date.now()
    workText = (queueMode === "cancel" || queueMode === "revert" ? "Restoring · " : "Applying · ") + stepLabel(step)
    if (step.domain === "island") {
      setPhase("set")
      islandSet.command = ["omarchy-shell", "tusche-island", "set", step.key, String(step.value)]
      islandSet.running = true
    } else if (step.domain === "cards") {
      setPhase("set")
      cardsSet.command = ["python3", cardsScript, step.value === "enabled" ? "enable" : "disable"]
      cardsSet.running = true
    } else setPhase("wait")
    stepTimer.restart()
  }
  function stepDone(settle) {
    var d = Object.assign({}, doneDomains)
    if (step.domain === "screens") {
      var touched = Object.assign({}, d.screens || {})
      step.keys.forEach(function(name) { touched[name] = true })
      d.screens = touched
    } else d[step.domain] = true
    doneDomains = d
    if (settle) setPhase("settle")            // let the shell and the plugins reload shell.json
    else { stepTimer.stop(); nextStep() }
  }
  function failStep(msg) { stepTimer.stop(); queue = []; step = null; finishQueue(msg) }

  function tick() {
    var s = step
    if (!s) { stepTimer.stop(); return }
    var now = Date.now()
    if (phase === "settle") { if (now - phaseAt >= 600) { stepTimer.stop(); nextStep() } return }
    if (now - stepAt > 15000) { failStep(stepLabel(s) + " timed out"); return }
    if (s.domain === "island") {
      var v = String(s.value)
      if (phase === "config") {
        var values = CC.islandValues(CC.islandEntry(host.config))
        if (values && values[s.key] === v) setPhase("probe")
      } else if (phase === "probe") {
        if (islandNotesAt >= phaseAt && CC.islandReports(islandNotes, s.key, v)) {
          if (s.key === "notifications") setPhase("takeover"); else stepDone(true)
        } else probeIsland()
      } else if (phase === "takeover") {
        // The island hands Omarchy's notification service over or back
        // (omarchy-plugin-disable/enable: one more shell.json write).
        var n = islandNotesAt >= phaseAt ? islandNotes : null
        var settled = n && (v === "true" ? n.serving === true : !n.serving && !n.omarchyDisabled)
        if (settled || now - phaseAt > 6000) stepDone(true)   // a service disabled by hand is never handed back
        else probeIsland()
      }
    } else if (s.domain === "screens") {
      if (phase === "wait") {
        if (host.writing) return
        s.value = CC.screenOptions(s, host.screenProfiles)
        var result = host.applyScreens(s.value)
        if (result !== "ok") { failStep("Screens: " + result); return }
        setPhase("write")
      } else if (phase === "write") {
        if (host.writing) return
        if (String(host.lastResult).indexOf("error") === 0) { failStep("Screens: " + host.lastResult); return }
        if (CC.sameScreens(host.screenProfiles, s.value)) stepDone(true)
      }
    } else if (s.domain === "bar") {
      if (phase === "wait") {
        // Let an earlier write finish and reach shell.json first: the
        // options are computed on top of the live ones.
        if (host.writing) return
        if (host.lastWritten && !CC.sameOptions(host.options, host.lastWritten) && now - phaseAt < 3000) return
        s.value = CC.barOptions(s, live.bar)
        var r = host.apply(s.value)
        if (r !== "ok") { failStep("Tusche Bar: " + r); return }
        setPhase("write")
      } else if (phase === "write") {
        if (host.writing) return
        if (String(host.lastResult).indexOf("error") === 0) { failStep("Tusche Bar: " + host.lastResult); return }
        if (CC.sameOptions(host.options, s.value)) stepDone(true)
      }
    }
  }

  function finishQueue(error) {
    var mode = queueMode, done = doneDomains
    stepTimer.stop()
    working = false; workText = ""; step = null; queue = []; queueMode = ""; phase = ""
    edits = CC.prune(edits, live)
    if (mode === "use" || mode === "save") {
      var a = Object.assign({}, applied)
      for (var d in done) a[d] = d === "screens" ? Object.assign({}, a.screens || {}, done.screens) : true
      applied = a
      if (Object.keys(done).length) usedLive = true
    }
    if (mode === "cancel" || mode === "revert") {
      if (error) closeNote = "Could not fully restore the state from opening: " + error
      usedLive = false; applied = ({})
    }
    if (error) { message = error; messageError = true }
    else if (mode === "use") { message = "Applied live · Save keeps it, Cancel restores the state from opening"; messageError = false }
    refreshHealth()
    if (mode === "save" && !error) { committed = true; closeRequested(); return }
    if (mode === "cancel") { closeRequested(); return }
    if (!open) {
      // Closed from outside while Use was applying: that goes back too.
      if (mode === "use" && !committed && usedLive) revertInBackground()
      return
    }
    if (beginAfterWork) { beginAfterWork = false; begin(); return }
    if (cancelAfterWork) { cancelAfterWork = false; cancel() }
  }

  Timer { id: stepTimer; interval: 120; repeat: true; onTriggered: win.tick() }

  Process {
    id: islandSet
    stdout: StdioCollector { id: islandSetOut }
    stderr: StdioCollector { id: islandSetErr }
    onExited: function(code) {
      if (!win.step || win.step.domain !== "island") return
      var out = String(islandSetOut.text || "").trim()
      if (code !== 0 || out !== String(win.step.value)) {
        win.failStep("Tusche Island did not take " + win.step.key + ": " + (out || String(islandSetErr.text || "").trim() || "no answer"))
        return
      }
      win.setPhase("config")
    }
  }
  Process {
    id: cardsSet
    stdout: StdioCollector { id: cardsSetOut }
    stderr: StdioCollector { id: cardsSetErr }
    onExited: function(code) {
      if (!win.step || win.step.domain !== "cards") return
      var out = String(cardsSetOut.text || "").trim()
      if (code !== 0 || out !== win.step.value) {
        var err = String(cardsSetErr.text || "").trim().split("\n").pop()
        win.failStep("Card picker: " + (err || out || "menu-override.py failed"))
        return
      }
      win.cardsStatus = out
      win.stepDone(false)
    }
  }

  // ---------------------------------------------------------------- health probes
  function refreshHealth() {
    if (!host) return
    if (!markerProbe.running) markerProbe.running = true
    if (!usageProbe.running) usageProbe.running = true
    if (live.island) probeIsland()
    if (!working) refreshCards()
  }
  function refreshCards() { if (!cardsStatusProc.running) cardsStatusProc.running = true }
  function probeIsland() {
    if (islandProbe.running) return
    probeStartedAt = Date.now()
    islandProbe.running = true
  }
  Process {
    id: islandProbe
    command: ["omarchy-shell", "tusche-island", "state"]
    stdout: StdioCollector { id: islandProbeOut }
    onExited: function(code) {
      var notes = false
      if (code === 0) {
        try { var st = JSON.parse(String(islandProbeOut.text)); notes = st && st.notifications ? st.notifications : false } catch (e) { notes = false }
      }
      win.islandNotes = notes
      win.islandNotesAt = win.probeStartedAt
    }
  }
  Process {
    id: markerProbe
    command: ["test", "-e", win.markerPath]
    onExited: function(code) { win.markerExists = code === 0 }
  }
  Process {
    id: usageProbe
    command: ["find", win.usageDir, "-maxdepth", "1", "-name", "*.json", "-printf", "%T@\\n"]
    stdout: StdioCollector { id: usageProbeOut }
    onExited: function(code) {
      var newest = 0
      String(usageProbeOut.text || "").split("\n").forEach(function(l) { var t = parseFloat(l); if (t > newest) newest = t })
      win.usageAge = code === 0 && newest > 0 ? Math.max(0, Date.now() / 1000 - newest) : -1
    }
  }
  Process {
    id: cardsStatusProc
    command: ["python3", win.cardsScript, "status"]
    stdout: StdioCollector { id: cardsStatusOut }
    stderr: StdioCollector { id: cardsStatusErr }
    onExited: function(code) {
      var out = String(cardsStatusOut.text || "").trim()
      var err = String(cardsStatusErr.text || "")
      win.cardsStatus = code === 0 && (out === "enabled" || out === "disabled") ? out
        : /No such file|can't open file/.test(err) ? "missing" : "error"
    }
  }

  // ---------------------------------------------------------------- search
  function openSearch() { searchField.forceActiveFocus(); searchField.selectAll() }
  function closeSearch() { searchField.text = ""; searchSel = 0; keys.forceActiveFocus() }
  function pickResult(i) {
    var r = searchResults[i]
    closeSearch()
    if (r) jumpTo(r.id, r.area)
  }
  function jumpTo(id, a) {
    showArea(a)
    flashId = id
    flashTimer.restart()
    scrollTimer.target = id
    scrollTimer.restart()
  }
  function findRow(item, id) {
    if (!item) return null
    if (item.settingId === id && item.visible) return item
    var kids = item.children || []
    for (var i = 0; i < kids.length; i++) { var f = findRow(kids[i], id); if (f) return f }
    return null
  }
  function scrollToRow(id) {
    var item = findRow(editorColumn, id)
    if (!item) return
    var p = item.mapToItem(editorColumn, 0, 0)
    editor.contentY = Math.max(0, Math.min(p.y - Style.space(12), editor.contentHeight - editor.height))
  }
  Timer { id: flashTimer; interval: 1600; onTriggered: win.flashId = "" }
  Timer { id: scrollTimer; property string target: ""; interval: 40; onTriggered: win.scrollToRow(target) }

  // Esc is staged: a field first lets go (the search also clears), then Esc cancels.
  function keyPressed(e) {
    var ctrl = (e.modifiers & Qt.ControlModifier) !== 0
    if (ctrl && e.key === Qt.Key_K) { openSearch(); e.accepted = true }
    else if (e.key === Qt.Key_Escape) { cancel(); e.accepted = true }
    else if (e.key === Qt.Key_Down || e.key === Qt.Key_Up) { stepArea(e.key === Qt.Key_Down ? 1 : -1); e.accepted = true }
  }
  function searchKey(e) {
    var n = searchResults.length
    if (e.key === Qt.Key_Escape) { closeSearch(); e.accepted = true }
    else if (e.key === Qt.Key_Down) { if (n) searchSel = (searchSel + 1) % n; e.accepted = true }
    else if (e.key === Qt.Key_Up) { if (n) searchSel = (searchSel + n - 1) % n; e.accepted = true }
    else if (e.key === Qt.Key_Return || e.key === Qt.Key_Enter) { pickResult(searchSel); e.accepted = true }
    else if ((e.modifiers & Qt.ControlModifier) && e.key === Qt.Key_K) { searchField.selectAll(); e.accepted = true }
  }

  function stateObject() {
    return { open: open, area: area, working: working, step: workText, used: usedLive, applied: Object.keys(applied),
             staged: changeList.map(function(c) { return c.id + "=" + c.to }), message: message, health: health.label,
             issues: healthList.filter(function(c) { return c.state === "issue" }).map(function(c) { return c.id + ": " + c.detail }) }
  }

  // ---------------------------------------------------------------- window
  screen: {
    var s = Quickshell.screens
    var f = Bridge.ModuleBus.focusedScreenName()
    for (var i = 0; i < s.length; i++) if (s[i].name === f) return s[i]
    return s.length ? s[0] : null
  }
  visible: open || stage.reveal > 0.001
  color: "transparent"
  anchors { top: true; bottom: true; left: true; right: true }
  exclusionMode: ExclusionMode.Ignore
  WlrLayershell.namespace: "tusche-bar-control-center"
  WlrLayershell.layer: WlrLayer.Overlay
  WlrLayershell.keyboardFocus: open ? WlrKeyboardFocus.Exclusive : WlrKeyboardFocus.None

  // A click outside is Cancel.
  MouseArea {
    anchors.fill: parent
    enabled: win.open
    onClicked: win.cancel()
  }

  // ------------------------------------------------------------ reveal
  // reveal 0 → 1 shows the card: a short fade (none with Reduced Motion).
  NumberAnimation { id: revealAnim; target: stage; property: "reveal"; duration: Style.duration(140); easing.type: Easing.OutCubic }
  function reveal() {
    revealAnim.stop()
    revealAnim.to = open ? 1 : 0
    revealAnim.start()
  }

  Item {
    id: stage
    anchors.fill: parent
    property real reveal: 0
    opacity: reveal

    Ui.BorderSurface {
      id: card
      readonly property int pad: Style.spacing.popupPadding
      width: Math.min(win.width - Style.space(20), Style.space(960))
      height: Math.min(win.height - y - Style.space(12), Style.space(640))
      x: Math.round((win.width - width) / 2)
      y: Style.bar.sizeHorizontal + Style.gapsOut
      color: Commons.Color.popups.background
      borderSpec: Border.surfaceSpec("popups", "border", Commons.Color.popups.border, Math.max(1, Style.space(2)))
      radius: Style.cornerRadius

      MouseArea { anchors.fill: parent; acceptedButtons: Qt.AllButtons }
      Item {
        id: keys
        anchors.fill: parent
        focus: win.open
        Keys.onPressed: function(e) { win.keyPressed(e) }
      }

      // ---- title: name and × (Cancel)
      Item {
        id: titleBar
        x: card.borderLeft + card.pad
        y: card.borderTop + card.pad
        width: card.width - card.borderLeft - card.borderRight - card.pad * 2
        height: Math.max(closeButton.height, titleText.implicitHeight)
        Strong {
          id: titleText
          anchors.verticalCenter: parent.verticalCenter
          text: "Control Center"
          font.pixelSize: Style.font.title
          font.bold: true
        }
        Item {
          id: closeButton
          x: parent.width - width
          anchors.verticalCenter: parent.verticalCenter
          width: Style.space(28); height: width
          Rectangle {
            anchors.fill: parent
            radius: Math.min(Style.cornerRadius, 3)
            color: closeMouse.containsMouse ? Style.hoverFillFor(Commons.Color.popups.text, Commons.Color.accent, Commons.Color.urgent) : "transparent"
          }
          Strong { anchors.centerIn: parent; text: "×"; font.pixelSize: Style.font.title; color: Util.alpha(Commons.Color.popups.text, 0.75) }
          MouseArea { id: closeMouse; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: win.cancel() }
        }
      }

      Item {
        id: content
        x: card.borderLeft + card.pad
        y: titleBar.y + titleBar.height + Style.space(10)
        width: card.width - card.borderLeft - card.borderRight - card.pad * 2
        height: card.height - y - card.borderBottom - card.pad

        // ---- header: Quick · Configure, search, Health chip
        Item {
          id: header
          width: parent.width
          height: Math.max(segments.height, searchBox.height, healthRow.height)
          Row {
            id: segments
            anchors.verticalCenter: parent.verticalCenter
            CcButton { label: "Quick"; minWidth: Style.space(92); selected: win.area === "quick"; onPicked: win.showArea("quick") }
            CcButton { label: "Configure"; minWidth: Style.space(92); selected: win.area !== "quick"; onPicked: win.showArea(win.configureArea) }
          }
          Item {
            id: searchBox
            x: segments.width + Style.space(16)
            width: Math.max(Style.space(160), Math.min(Style.space(520), healthRow.x - x - Style.space(16)))
            height: Math.max(Style.space(30), searchField.implicitHeight)
            anchors.verticalCenter: parent.verticalCenter
            Face { anchors.fill: parent; inset: true; fill: Qt.darker(Commons.Color.popups.background, 1.25) }
            Rectangle {
              anchors.fill: parent; anchors.margins: -1
              color: "transparent"; border.width: 1; border.color: Commons.Color.accent
              visible: searchField.activeFocus
            }
            Item {
              id: lens
              x: Style.space(9); width: Style.space(14); height: width
              anchors.verticalCenter: parent.verticalCenter
              Rectangle { width: Math.round(parent.width * 0.72); height: width; radius: width / 2; color: "transparent"; border.width: Math.max(1, Style.space(1.5)); border.color: Util.alpha(Commons.Color.popups.text, 0.6) }
              Rectangle { x: parent.width * 0.62; y: parent.height * 0.62; width: parent.width * 0.42; height: Math.max(1, Style.space(2)); rotation: 45; transformOrigin: Item.Left; color: Util.alpha(Commons.Color.popups.text, 0.6) }
            }
            TextField {
              id: searchField
              x: lens.x + lens.width + Style.space(6)
              width: keycaps.x - x - Style.space(6)
              height: parent.height
              padding: 0
              verticalAlignment: TextInput.AlignVCenter
              placeholderText: "Search settings and values"
              placeholderTextColor: Util.alpha(Commons.Color.popups.text, 0.45)
              renderType: Text.NativeRendering
              selectByMouse: true
              font.family: Style.font.family; font.pixelSize: Style.font.body
              color: Commons.Color.popups.text
              background: Item {}
              onTextChanged: win.searchSel = 0
              Keys.onPressed: function(e) { win.searchKey(e) }
            }
            Row {
              id: keycaps
              x: parent.width - width - Style.space(6)
              anchors.verticalCenter: parent.verticalCenter
              spacing: 3
              Keycap { label: "Ctrl" }
              Keycap { label: "K" }
            }
          }
          Row {
            id: healthRow
            x: parent.width - width
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.space(8)
            Caption { anchors.verticalCenter: parent.verticalCenter; text: "Health" }
            Rectangle {
              id: healthChip
              readonly property color tone: win.health.issues ? Commons.Color.urgent : win.health.unknown ? Util.alpha(Commons.Color.popups.text, 0.6) : Commons.Color.accent
              width: chipText.implicitWidth + Style.space(14)
              height: chipText.implicitHeight + Style.space(6)
              color: Util.alpha(tone, 0.16)
              border.width: 1; border.color: tone
              Strong { id: chipText; anchors.centerIn: parent; text: win.health.label; color: healthChip.tone; font.bold: true }
              MouseArea { anchors.fill: parent; cursorShape: Qt.PointingHandCursor; onClicked: win.showArea("health") }
            }
          }
        }

        Rectangle { id: rule; y: header.height + Style.space(10); width: parent.width; height: 1; color: Util.alpha(Commons.Color.popups.text, 0.12) }

        // ---- body: areas left, editor right
        Item {
          id: body
          y: rule.y + 1 + Style.space(10)
          width: parent.width
          height: footer.y - y - Style.space(10)

          Column {
            id: areaList
            width: Style.space(200)
            spacing: Style.space(2)
            Repeater {
              model: CC.AREAS
              Rectangle {
                id: areaRow
                required property var modelData
                readonly property bool current: win.area === modelData.id
                width: areaList.width
                height: Math.max(Style.space(32), areaLabel.implicitHeight + Style.space(12))
                color: current ? Util.alpha(Commons.Color.accent, 0.18)
                  : areaMouse.containsMouse ? Style.hoverFillFor(Commons.Color.popups.text, Commons.Color.accent, Commons.Color.urgent) : "transparent"
                Rectangle { width: Style.space(3); height: parent.height; color: Commons.Color.accent; visible: areaRow.current }
                Rectangle {
                  x: Style.space(8); anchors.verticalCenter: parent.verticalCenter
                  width: Math.max(4, Style.space(5)); height: width
                  color: Commons.Color.accent
                  visible: win.areaHasEdits(areaRow.modelData.id)
                }
                // The area name wins; its note gets what is left.
                Body {
                  id: areaLabel
                  x: Style.space(18)
                  anchors.verticalCenter: parent.verticalCenter
                  width: Math.min(implicitWidth, parent.width - x - Style.space(8))
                  elide: Text.ElideRight
                  text: areaRow.modelData.label
                  font.bold: areaRow.current
                }
                Caption {
                  id: areaNote
                  anchors.right: parent.right; anchors.rightMargin: Style.space(8)
                  anchors.verticalCenter: parent.verticalCenter
                  visible: implicitWidth <= parent.width - areaLabel.x - areaLabel.width - Style.space(18)
                  text: win.areaMeta(areaRow.modelData.id)
                  color: areaRow.modelData.id === "health" && win.health.issues ? Commons.Color.urgent : Util.alpha(Commons.Color.popups.text, 0.6)
                }
                MouseArea { id: areaMouse; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: win.showArea(areaRow.modelData.id) }
              }
            }
          }
          Rectangle { x: areaList.width + Style.space(10); width: 1; height: parent.height; color: Util.alpha(Commons.Color.popups.text, 0.12) }

          Flickable {
            id: editor
            x: areaList.width + Style.space(21)
            width: parent.width - x
            height: parent.height
            contentHeight: editorColumn.implicitHeight + Style.space(8)
            clip: true
            boundsBehavior: Flickable.StopAtBounds
            ScrollBar.vertical: ScrollBar {}

            Column {
              id: editorColumn
              width: editor.width - Style.space(12)
              spacing: Style.space(2)

              Item {
                width: parent.width
                height: areaHead.implicitHeight + Style.space(6)
                Strong {
                  id: areaHead
                  text: CC.areaLabel(win.area)
                  color: Commons.Color.accent
                  font.pixelSize: Style.font.title
                  font.bold: true
                }
                Caption {
                  anchors.left: areaHead.right; anchors.leftMargin: Style.space(10)
                  anchors.baseline: areaHead.baseline
                  width: Math.max(0, parent.width - areaHead.implicitWidth - Style.space(10))
                  elide: Text.ElideRight
                  text: (win.area === "quick" ? "" : "Configure · ") + CC.areaNote(win.area)
                }
              }

              // ---- Quick
              Column {
                visible: win.area === "quick"
                width: parent.width
                spacing: Style.space(2)
                SectionHead { text: "LOOK" }
                Repeater { model: CC.QUICK.filter(function(id) { return id.indexOf("bar.") === 0 }); delegate: settingRow }
                SectionHead { visible: win.islandAvailable; text: "TUSCHE ISLAND" }
                Repeater { model: win.islandAvailable ? CC.QUICK.filter(function(id) { return id.indexOf("island.") === 0 }) : []; delegate: settingRow }
                SectionHead { text: "PRESETS" }
                PresetFlow {}
                SectionHead { text: "FOCUS MODE" }
                Repeater { model: ["bar.seal"]; delegate: settingRow }
                Flow {
                  width: parent.width; spacing: Style.space(6)
                  CcButton {
                    label: "Start focus mode"
                    enabled: !win.working && !!win.host && win.live.bar.seal === "on" && !win.host.focusBusy
                    onPicked: win.host.focusAction("start")
                  }
                  CcButton {
                    label: "Show the bar"
                    enabled: !win.working && !!win.host && !win.host.focusBusy
                    onPicked: win.host.focusAction("show")
                  }
                }
                Caption {
                  width: parent.width; wrapMode: Text.WordWrap
                  text: "Apply the focus seal with Use or Save first. Start temporarily hides the native bar; its services keep running. Right-click the seal to show the bar again."
                }
                Caption {
                  visible: !!win.host && String(win.host.focusResult).indexOf("error:") === 0
                  width: parent.width; wrapMode: Text.WordWrap
                  text: win.host ? win.host.focusResult : ""; color: Commons.Color.urgent
                }
              }

              // ---- Tusche Bar
              Column {
                visible: win.area === "bar"
                width: parent.width
                spacing: Style.space(2)
                Loader {
                  active: win.open && win.area === "bar"
                  visible: active
                  width: parent.width
                  sourceComponent: VisualBarEditor {
                    width: parent.width
                    options: win.pending.bar; liveOptions: win.live.bar
                    snapshot: win.previewSnapshot
                    material: win.host ? win.host.material : null
                    showMotion: false
                    enabled: !win.working
                    onPicked: function(key, value) { win.pick("bar." + key, value) }
                    onPresetPicked: function(id) { win.stagePreset(id) }
                  }
                }
                Item {
                  id: combosBox
                  readonly property string settingId: "bar.combos"
                  width: parent.width
                  height: combos.implicitHeight
                  FlashBg { forId: combosBox.settingId }
                  Column {
                  id: combos
                  width: parent.width
                  spacing: Style.space(6)
                  SectionHead { text: "MY COMBINATIONS" }
                  Item {
                    width: parent.width
                    height: Math.max(nameBox.height, saveCombo.height)
                    Item {
                      id: nameBox
                      width: parent.width - saveCombo.width - Style.space(8)
                      height: Math.max(Style.space(30), comboName.implicitHeight)
                      Face { anchors.fill: parent; inset: true; fill: Qt.darker(Commons.Color.popups.background, 1.25) }
                      TextField {
                        id: comboName
                        x: Style.space(8); width: parent.width - Style.space(16); height: parent.height
                        padding: 0
                        verticalAlignment: TextInput.AlignVCenter
                        placeholderText: "Name this combination (saves the options as shown, staged ones included)"
                        placeholderTextColor: Util.alpha(Commons.Color.popups.text, 0.45)
                        maximumLength: 48
                        renderType: Text.NativeRendering
                        selectByMouse: true
                        font.family: Style.font.family; font.pixelSize: Style.font.body
                        color: Commons.Color.popups.text
                        background: Item {}
                        onAccepted: win.saveCombination(text)
                        Keys.onPressed: function(e) {
                          if (e.key === Qt.Key_Escape) { keys.forceActiveFocus(); e.accepted = true }
                          else if ((e.modifiers & Qt.ControlModifier) && e.key === Qt.Key_K) { win.openSearch(); e.accepted = true }
                        }
                      }
                    }
                    CcButton { id: saveCombo; x: parent.width - width; label: "Save / replace"; onPicked: win.saveCombination(comboName.text) }
                  }
                  Flow {
                    width: parent.width
                    height: childrenRect.height
                    spacing: Style.space(6)
                    Repeater {
                      model: win.host ? win.host.savedPresets : []
                      Row {
                        id: combo
                        required property var modelData
                        spacing: Style.space(2)
                        Chip { label: combo.modelData.name; enabled: !win.working; onPicked: { comboName.text = combo.modelData.name; win.stageOptions(combo.modelData.options) } }
                        Chip { label: "×"; onPicked: win.host.deleteCombination(combo.modelData.name) }
                      }
                    }
                  }
                  Caption {
                    visible: text !== ""
                    width: parent.width; wrapMode: Text.WordWrap
                    text: win.host ? win.host.saveResult : ""
                    color: Commons.Color.popups.text
                  }
                  Caption {
                    width: parent.width; wrapMode: Text.WordWrap
                    text: "Picking a combination stages it like a preset; × deletes it at once."
                  }
                  }
                }
                SectionHead { text: "OPTIONS" }
                Repeater { model: CC.barIds(); delegate: settingRow }
              }

              // ---- Per-screen presentation (never changes display topology)
              Loader {
                active: win.open && win.area === "screens"
                visible: active
                width: parent.width
                sourceComponent: ScreenProfiles {
                  width: parent.width
                  screens: win.screenChoices; profiles: win.pending.screens
                  enabled: !win.working
                  onPicked: function(name, profile) { win.pick("screens." + name, profile) }
                }
              }

              // ---- Isolated production-material playback
              Column {
                visible: win.area === "motion"
                width: parent.width; spacing: Style.space(8)
                Loader {
                  active: win.open && win.area === "motion"
                  visible: active
                  width: parent.width
                  sourceComponent: MotionPreview {
                    width: parent.width
                    options: win.pending.bar
                    material: win.host ? win.host.material : null
                  }
                }
                Repeater { model: ["bar.frames", "bar.glass", "bar.glassMotion"]; delegate: settingRow }
              }

              // ---- Tusche Island
              Column {
                visible: win.area === "island"
                width: parent.width
                spacing: Style.space(2)
                Caption {
                  visible: !win.islandAvailable
                  width: parent.width; wrapMode: Text.WordWrap
                  text: "The Tusche Island (nerdibeard.tusche-island) is not in shell.json, so there is nothing to set here."
                }
                SectionHead { visible: win.islandAvailable; text: "NOTIFICATIONS" }
                Repeater { model: win.islandAvailable ? CC.ISLAND_SETTINGS.map(function(s) { return "island." + s.key }) : []; delegate: settingRow }
                Caption {
                  visible: win.islandAvailable
                  topPadding: Style.space(6)
                  width: parent.width; wrapMode: Text.WordWrap
                  text: "The island saves these itself (omarchy-shell tusche-island set …). Notifications on: the island takes over from Omarchy's notification service and shows them in the bar; off hands them back. With the bar edge \"From the theme\" and a theme that has a bar material (Tusche & Papier) the notes take the theme's card; the note style is for other themes."
                }
              }

              // ---- Card picker
              Column {
                visible: win.area === "cards"
                width: parent.width
                spacing: Style.space(2)
                SectionHead { text: "MENUS" }
                Repeater { model: ["cards.override"]; delegate: settingRow }
                Caption {
                  visible: text !== ""
                  width: parent.width; wrapMode: Text.WordWrap
                  color: win.cardsStatus === "error" ? Commons.Color.urgent : Util.alpha(Commons.Color.popups.text, 0.6)
                  text: win.cardsStatus === "" ? "Checking the menu override …"
                    : win.cardsStatus === "missing" ? "The card picker is not installed (no menu-override.py)."
                    : win.cardsStatus === "error" ? "menu-override.py status failed." : ""
                }
                Caption {
                  topPadding: Style.space(6)
                  width: parent.width; wrapMode: Text.WordWrap
                  text: "On: Omarchy's Style → Theme and Style → Background (and their keys) open the fanned card picker, through a managed block in ~/.config/omarchy/extensions/omarchy-menu.jsonc. Off removes the block. Without the picker loaded, the entries fall back to Omarchy's own pickers."
                }
              }

              // ---- Health
              Column {
                visible: win.area === "health"
                width: parent.width
                spacing: Style.space(2)
                Item {
                  width: parent.width
                  height: Math.max(healthSummaryText.implicitHeight, recheck.height) + Style.space(6)
                  Body {
                    id: healthSummaryText
                    anchors.verticalCenter: parent.verticalCenter
                    text: win.health.issues ? win.health.label + " · details below" : win.health.unknown ? "Checking …" : "All checks pass"
                    color: win.health.issues ? Commons.Color.urgent : Commons.Color.popups.text
                    font.bold: true
                  }
                  CcButton { id: recheck; anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter; label: "Check again"; onPicked: win.refreshHealth() }
                }
                Repeater {
                  model: win.healthList
                  Item {
                    id: check
                    required property var modelData
                    readonly property string settingId: "health." + modelData.id
                    width: editorColumn.width
                    height: checkText.implicitHeight + Style.space(10)
                    FlashBg { forId: check.settingId }
                    Strong {
                      id: checkMark
                      x: Style.space(6); y: Style.space(5)
                      width: Style.space(20)
                      text: check.modelData.state === "ok" ? "✓" : check.modelData.state === "issue" ? "!" : "·"
                      font.bold: true
                      color: check.modelData.state === "issue" ? Commons.Color.urgent : check.modelData.state === "ok" ? Commons.Color.accent : Util.alpha(Commons.Color.popups.text, 0.5)
                    }
                    Column {
                      id: checkText
                      x: checkMark.x + checkMark.width + Style.space(6); y: Style.space(5)
                      width: parent.width - x - Style.space(6)
                      Body { width: parent.width; wrapMode: Text.WordWrap; text: check.modelData.label; font.bold: check.modelData.state === "issue" }
                      Caption { width: parent.width; wrapMode: Text.WordWrap; text: check.modelData.detail }
                    }
                  }
                }
                Caption {
                  topPadding: Style.space(6)
                  width: parent.width; wrapMode: Text.WordWrap
                  text: "Every check reads live state: the engine, shell.json, the island's IPC state, the takeover marker, usage record times and the card picker's script."
                }
              }
            }
          }
        }

        // ---- footer: status line, then Save · Use · Cancel across the window
        Item {
          id: footer
          width: parent.width
          height: statusLine.implicitHeight + buttons.height + Style.space(14)
          y: parent.height - height
          Rectangle { width: parent.width; height: 1; color: Util.alpha(Commons.Color.popups.text, 0.12) }
          Body {
            id: statusLine
            y: Style.space(7)
            width: parent.width
            elide: Text.ElideRight
            text: win.footerText
            color: win.footerTone
          }
          Item {
            id: buttons
            y: statusLine.y + statusLine.implicitHeight + Style.space(7)
            width: parent.width
            height: saveButton.height
            CcButton { id: saveButton; minWidth: Style.space(124); label: "Save"; enabled: !win.working; onPicked: win.save() }
            CcButton { x: Math.round((parent.width - width) / 2); minWidth: Style.space(124); label: "Use"; primary: true; enabled: !win.working && win.changeList.length > 0; onPicked: win.use() }
            CcButton { x: parent.width - width; minWidth: Style.space(124); label: "Cancel"; enabled: !win.working; onPicked: win.cancel() }
          }
        }

        // ---- search results (Ctrl+K)
        Ui.BorderSurface {
          id: results
          visible: win.searchOpen
          z: 10
          x: searchBox.x
          y: header.y + searchBox.y + searchBox.height + Style.space(4)
          width: Math.max(searchBox.width, Style.space(420))
          height: resultsColumn.implicitHeight + results.borderTop + results.borderBottom + Style.space(8)
          color: Commons.Color.popups.background
          borderSpec: Border.surfaceSpec("popups", "border", Commons.Color.popups.border, Math.max(1, Style.space(2)))
          radius: Style.cornerRadius
          MouseArea { anchors.fill: parent; acceptedButtons: Qt.AllButtons }
          Column {
            id: resultsColumn
            x: results.borderLeft + Style.space(4)
            y: results.borderTop + Style.space(4)
            width: results.width - results.borderLeft - results.borderRight - Style.space(8)
            Repeater {
              model: win.searchResults
              Rectangle {
                id: hit
                required property var modelData
                required property int index
                width: resultsColumn.width
                height: Math.max(Style.space(30), hitLabel.implicitHeight + Style.space(10))
                color: win.searchSel === index ? Util.alpha(Commons.Color.accent, 0.22)
                  : hitMouse.containsMouse ? Style.hoverFillFor(Commons.Color.popups.text, Commons.Color.accent, Commons.Color.urgent) : "transparent"
                Body {
                  id: hitLabel
                  x: Style.space(10)
                  anchors.verticalCenter: parent.verticalCenter
                  width: parent.width - x - hitValue.width - Style.space(24)
                  elide: Text.ElideRight
                  text: hit.modelData.areaLabel + " › " + hit.modelData.label
                }
                Caption {
                  id: hitValue
                  anchors.right: parent.right; anchors.rightMargin: Style.space(10)
                  anchors.verticalCenter: parent.verticalCenter
                  width: Math.min(implicitWidth, hit.width * 0.45)
                  elide: Text.ElideRight
                  text: hit.modelData.value
                  color: hit.modelData.matchedValue ? Commons.Color.accent : Util.alpha(Commons.Color.popups.text, 0.6)
                }
                MouseArea { id: hitMouse; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: win.pickResult(hit.index) }
              }
            }
            Caption {
              visible: win.searchResults.length === 0
              leftPadding: Style.space(10); topPadding: Style.space(6); bottomPadding: Style.space(6)
              text: "No setting matches"
            }
            Rectangle { width: parent.width; height: 1; color: Util.alpha(Commons.Color.popups.text, 0.1) }
            Caption {
              leftPadding: Style.space(10); topPadding: Style.space(5); bottomPadding: Style.space(2)
              text: "Enter opens · ↑↓ choose · Esc closes the search"
            }
          }
        }
      }
    }
  }

  // ---------------------------------------------------------------- delegates and parts
  // One row per setting id (bar.*, island.*, cards.*).
  Component {
    id: settingRow
    SettingRow {
      required property var modelData
      readonly property var spec: CC.setting(modelData)
      width: editorColumn.width
      settingId: modelData
      label: spec ? spec.label : modelData
      hint: spec ? spec.hint : ""
      values: spec ? spec.values : []
      available: !!(spec && win.live[spec.domain])
      current: String(CC.value(win.pending, modelData))
      liveValue: String(CC.value(win.live, modelData))
      onPicked: function(v) { win.pick(modelData, v) }
    }
  }

  component Body: Text {
    renderType: Text.NativeRendering
    textFormat: Text.PlainText
    font.family: Style.font.family
    font.pixelSize: Style.font.body
    color: Commons.Color.popups.text
  }
  component Caption: Body {
    font.pixelSize: Style.font.caption
    color: Util.alpha(Commons.Color.popups.text, 0.6)
  }
  // Titles, section heads, buttons and marks.
  component Strong: Text {
    renderType: Text.NativeRendering
    textFormat: Text.PlainText
    font.family: Style.font.family
    font.pixelSize: Style.font.body
    color: Commons.Color.popups.text
  }
  component SectionHead: Strong {
    font.pixelSize: Style.font.caption
    font.bold: true
    color: Commons.Color.accent
    topPadding: Style.space(10)
    bottomPadding: Style.space(3)
  }

  // A flat face for fields, buttons and chips in Omarchy's popup style: the
  // fill and a faint frame, stronger while selected or pressed (`inset`).
  component Face: Rectangle {
    property bool inset: false
    property color fill: "transparent"
    color: fill
    radius: Math.min(Style.cornerRadius, 3)
    border.width: 1
    border.color: Util.alpha(Commons.Color.popups.text, inset ? 0.3 : 0.14)
  }

  component FlashBg: Rectangle {
    property string forId: ""
    anchors.fill: parent
    color: win.flashId !== "" && win.flashId === forId ? Util.alpha(Commons.Color.accent, 0.24) : "transparent"
    Behavior on color { ColorAnimation { duration: Style.duration(260) } }
  }

  component CcButton: Item {
    id: btn
    property string label: ""
    property bool selected: false
    property bool primary: false
    property int minWidth: 0
    signal picked()
    implicitWidth: Math.max(minWidth, btnText.implicitWidth + Style.space(28))
    implicitHeight: Math.max(Style.space(28), btnText.implicitHeight + Style.space(10))
    width: implicitWidth
    height: implicitHeight
    opacity: enabled ? 1 : 0.45
    Face {
      anchors.fill: parent
      inset: btn.selected || btnMouse.pressed
      fill: btn.selected ? Commons.Color.accent
        : btnMouse.pressed ? Util.alpha(Commons.Color.accent, 0.4)
        : btnMouse.containsMouse ? Util.alpha(Commons.Color.accent, 0.16)
        : Util.alpha(Commons.Color.popups.text, btn.primary ? 0.1 : 0.05)
    }
    Strong {
      id: btnText
      anchors.centerIn: parent
      text: btn.label
      font.bold: btn.selected || btn.primary
      color: btn.selected ? Commons.Color.popups.background : Commons.Color.popups.text
    }
    MouseArea { id: btnMouse; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: btn.picked() }
  }

  component Keycap: Item {
    id: cap
    property string label: ""
    implicitWidth: Math.max(Style.space(26), capText.implicitWidth + Style.space(10))
    implicitHeight: capText.implicitHeight + Style.space(4)
    width: implicitWidth
    height: implicitHeight
    Face { anchors.fill: parent; fill: Util.alpha(Commons.Color.popups.text, 0.08) }
    Strong {
      id: capText
      anchors.centerIn: parent
      text: cap.label
      font.pixelSize: Style.font.caption
      color: Util.alpha(Commons.Color.popups.text, 0.75)
    }
  }

  // A value choice. liveMark: the value that is live right now while another
  // one is staged.
  component Chip: Item {
    id: chip
    property string label: ""
    property string note: ""
    property bool selected: false
    property bool liveMark: false
    signal picked()
    implicitWidth: chipColumn.implicitWidth + Style.space(18)
    implicitHeight: Math.max(Style.space(26), chipColumn.implicitHeight + Style.space(8))
    width: implicitWidth
    height: implicitHeight
    opacity: enabled ? 1 : 0.55
    Face {
      anchors.fill: parent
      inset: chip.selected || chipMouse.pressed
      fill: chip.selected ? Commons.Color.accent
        : chipMouse.pressed ? Style.pressedFillFor(Commons.Color.popups.text, Commons.Color.accent, Commons.Color.urgent)
        : chipMouse.containsMouse ? Style.hoverFillFor(Commons.Color.popups.text, Commons.Color.accent, Commons.Color.urgent)
        : Util.alpha(Commons.Color.popups.text, 0.06)
    }
    Column {
      id: chipColumn
      anchors.centerIn: parent
      Body {
        anchors.horizontalCenter: parent.horizontalCenter
        text: chip.label
        font.bold: chip.selected
        color: chip.selected ? Commons.Color.popups.background : Commons.Color.popups.text
      }
      Caption {
        anchors.horizontalCenter: parent.horizontalCenter
        visible: chip.note !== ""
        text: chip.note
        color: chip.selected ? Util.alpha(Commons.Color.popups.background, 0.8) : Util.alpha(Commons.Color.popups.text, 0.55)
      }
    }
    Rectangle {
      visible: chip.liveMark
      x: parent.width - width - 3; y: 3
      width: Math.max(4, Style.space(5)); height: width
      color: Commons.Color.accent
    }
    MouseArea { id: chipMouse; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: chip.picked() }
  }

  component SettingRow: Item {
    id: row
    property string settingId: ""
    property string label: ""
    property string hint: ""
    property var values: []
    property string current: ""
    property string liveValue: ""
    property bool available: true
    signal picked(string value)
    readonly property bool changed: available && current !== liveValue
    readonly property int labelWidth: Math.min(Style.space(200), Math.round(width * 0.32))
    height: Math.max(labelColumn.implicitHeight, chips.height) + Style.space(10)
    opacity: available ? 1 : 0.5
    FlashBg { forId: row.settingId }
    Column {
      id: labelColumn
      x: Style.space(6); y: Style.space(5)
      width: row.labelWidth
      spacing: Style.space(1)
      Body { width: parent.width; wrapMode: Text.WordWrap; text: row.label }
      Caption { visible: row.changed; width: parent.width; wrapMode: Text.WordWrap; color: Commons.Color.accent; text: "not applied" }
      Caption { visible: row.hint !== ""; width: parent.width; wrapMode: Text.WordWrap; text: row.hint }
    }
    Flow {
      id: chips
      x: labelColumn.x + labelColumn.width + Style.space(12); y: Style.space(5)
      width: row.width - x - Style.space(6)
      height: childrenRect.height
      spacing: Style.space(4)
      Repeater {
        model: row.values
        Chip {
          required property var modelData
          label: modelData.label
          selected: row.current === modelData.id
          liveMark: row.changed && row.liveValue === modelData.id
          enabled: row.available && !win.working
          onPicked: row.picked(modelData.id)
        }
      }
    }
  }

  component PresetFlow: Item {
    id: presetBox
    readonly property string settingId: "bar.presets"
    width: editorColumn.width
    height: presetChips.height + Style.space(6)
    FlashBg { forId: presetBox.settingId }
    Flow {
      id: presetChips
      y: Style.space(3)
      width: parent.width
      height: childrenRect.height
      spacing: Style.space(6)
      Repeater {
        model: Presets.PRESETS
        Chip {
          required property var modelData
          label: modelData.label
          note: modelData.note
          selected: Presets.matchPreset(win.pending.bar) === modelData.id
          liveMark: !selected && Presets.matchPreset(win.live.bar) === modelData.id
          enabled: !win.working
          onPicked: win.stagePreset(modelData.id)
        }
      }
    }
  }
}
