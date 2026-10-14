import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Commons as Commons
import qs.Ui
import "bridge" as Bridge

// Drop-down logo menu of the Tusche Bar: one tall menu that folds out of
// the logo — with the theme material it rolls (or blooms) out of the bar
// like the other popups. On top the Omarchy menu itself (omarchy-menu.jsonc
// plus the user's extensions, read like the native menu), below our own
// groups.
// Submenus open inside it (‹ goes back); typing searches the whole tree and
// the installed apps. Keys: ↑↓ select · PgUp/PgDn page · Enter/→ open ·
// ←/Backspace back · Esc clears or closes · Delete or a right-click on an
// app uninstalls it (after a question).
//
// Nested like the native menu, so a pick never ends in the centred one:
// - the lists the shell fills in open as levels here: Apps (the shell's
//   application library), fonts, power profiles; typing filters a list;
// - questions an action asks through omarchy-menu-select / -input are
//   answered here: every action runs with bin/menu-shim first on its PATH,
//   and those shims hand the question to this drop-down (Engine IPC `ask`).
//   An action known to ask keeps the drop-down open on a waiting level
//   until its question arrives (or it ends without one).
// A question is answered exactly like the native menu does (the answer in
// the payload's selection file, then the done file); Esc, ×, a click
// outside, ‹ or any other close cancel it (the done file alone).
KeyboardPanel {
  id: menu

  // [{ kind: "omarchy" | "own" | "more" | "provider" | "waiting" | "request", id, title, … }];
  // empty = the top level.
  property var stack: []
  property string query: ""
  // Opened as a launcher (Super+Space): the search line shows from the start
  // and apps lead the results. Set by the owner before opening, cleared on close.
  property bool searchMode: false
  property int current: -1
  property real slideX: 0
  property int slideDir: 1

  readonly property var level: stack.length ? stack[stack.length - 1] : null
  // A level of its own rows (a list or a question): typing filters it
  // instead of searching the whole tree.
  readonly property bool listLevel: !!level && (level.kind === "provider" || level.kind === "request" || level.kind === "waiting")
  readonly property var levelRequest: level && level.kind === "request" ? level.req : null
  readonly property bool inputLevel: !!levelRequest && levelRequest.mode === "input"
  readonly property bool searching: query !== "" && !inputLevel
  // the empty search line of a launcher opening, on the first level only
  readonly property bool launcherLine: searchMode && query === "" && !level
  readonly property color ink: Commons.Color.popups.text
  readonly property string labelFamily: Style.font.family
  readonly property int labelPx: Style.font.body
  readonly property int rowH: Math.max(Style.space(30), labelPx + Style.space(14))
  readonly property int separatorH: Style.space(13)
  readonly property int rowRadius: Math.min(Style.cornerRadius, 6)
  // Theme material (edge "theme"): the hovered row inverts (Tusche/Papier) or
  // gets a brush stroke (Lavur: card.brush, a PNG in the theme folder)
  readonly property var src: Bridge.ModuleBus.material ? Bridge.ModuleBus.material.source || null : null
  // metal family (material.metal.hover "tube"): a chrome tube around the hovered row instead
  readonly property var metalHover: Bridge.ModuleBus.metal && Bridge.ModuleBus.metal.hover === "tube" ? Bridge.ModuleBus.metal : null
  readonly property bool inverting: !!src && !metalHover
  // the tube's corner radius: metal.hoverRadius px, or a pill without it
  function hoverRadius(h) { return metalHover && metalHover.hoverRadius !== undefined ? Math.min(h / 2, Number(metalHover.hoverRadius)) : h / 2 }
  // (material is briefly null during a theme switch, before `inverting` follows)
  readonly property string brushFile: inverting && Bridge.ModuleBus.material && Bridge.ModuleBus.material.card && Bridge.ModuleBus.material.card.brush
    ? Bridge.ModuleBus.material.card.brush : ""
  // the stamp in the URL: both Lavur themes name their brush the same – a new theme reloads it
  readonly property string brushUrl: brushFile ? "file://" + Bridge.ModuleBus.themeDir + "/" + brushFile + "#" + Bridge.ModuleBus.themeStamp : ""

  // The shell's application library: the facade a "menu" plugin receives
  // (see manifest.json); null on shells without it (Apps then opens the
  // native menu as before).
  readonly property var appLibrary: {
    var e = Bridge.ModuleBus.engine
    return e && e.shell && e.shell.appLibrary ? e.shell.appLibrary : null
  }
  // bin/menu-shim of the installed plugin, first on PATH for every action
  // run from here.
  readonly property string shimDir: Bridge.ModuleBus.engine ? String(Bridge.ModuleBus.engine.shimDir || "") : ""

  padding: Style.space(8)
  focusTarget: keys
  contentWidth: levelRequest && levelRequest.width > 0
    ? menu.fittedContentWidth(Style.space(levelRequest.width))
    : Math.round(Math.max(Style.space(300), Math.min(Style.space(460), widest * labelPx * 0.62 + Style.space(120))))
  readonly property real headerH: Style.space(32) + 1 + Style.space(6)
  // the top level's title follows the logo it folds out of
  readonly property string rootTitle: {
    var logo = owner && owner.variant !== "logo" ? String(owner.logo || "") : ""
    return logo === "arch" ? "Arch Linux" : logo === "nerdibeard" ? "Nerdibeard" : "Omarchy"
  }
  readonly property real listHeight: rows.reduce(function(h, r) { return h + (r.separator ? menu.separatorH : menu.rowH) }, 0)
  // Long lists (Apps, a question's options) stop at three quarters of the
  // screen, or at the height a question asks for (`maxHeight`), and scroll.
  readonly property real listCap: {
    if (!listLevel) return 0
    var cap = Math.round((menu.availableCardHeight - menu.verticalContentInset - headerH) * 0.75)
    if (levelRequest && levelRequest.maxHeight > 0) cap = Math.min(cap, Style.space(levelRequest.maxHeight))
    return Math.max(rowH, cap)
  }
  // (the uninstall question needs room even over a one-row search)
  contentHeight: menu.fittedContentHeight(Math.max(deleteConfirmOpen ? Style.space(170) : 0,
    headerH + (listCap > 0 ? Math.min(listHeight, listCap) : listHeight)))
  Behavior on contentWidth { NumberAnimation { duration: Style.duration(160); easing.type: Easing.OutCubic } }
  Behavior on contentHeight { NumberAnimation { duration: Style.duration(160); easing.type: Easing.OutCubic } }

  OmarchyMenuSource { id: source; live: menu.visible; appLibrary: menu.appLibrary }
  MaterialCard { id: materialCard; panel: menu; material: Bridge.ModuleBus.material }
  // how far the card is out (rolled, grown or faded): the logo stays its tab until it is back in the bar
  readonly property real cardPresence: materialCard.presence

  // ---------------------------------------------------------------- rows
  readonly property var groups: {
    var e = Bridge.ModuleBus.engine
    return e && menu.visible ? e.dropGroups() : []
  }
  function groupRows(g) {
    return (g ? g.items : []).map(function(it) {
      return it.separator ? { separator: true }
        : { kind: "own", label: it.label, note: it.note || "", checked: !!it.checked, disabled: !!it.disabled, run: it.action, path: g.title }
    })
  }
  readonly property var rows: {
    var lv = level
    if (lv && lv.kind === "waiting") return [{ kind: "wait", label: "Opening …", disabled: true }]
    if (lv && lv.kind === "request")
      return lv.req.mode === "input" ? [{ kind: "input", label: query + "▏", note: "Enter" }] : listRows(lv.req.rows)
    if (lv && lv.kind === "provider") {
      var filled = lv.provider === "apps" ? source.appRows : source.providerRowsFor(lv.id)
      return filled ? listRows(filled) : [{ kind: "wait", label: "Loading …", disabled: true }]
    }
    if (query) {
      var q = query.toLowerCase().trim()
      var own = []
      groups.forEach(function(g) {
        groupRows(g).forEach(function(r) { if (!r.separator && !r.disabled && r.label.toLowerCase().indexOf(q) !== -1) own.push(r) })
      })
      var hits = source.search(query, 30).concat(own)
      var apps = source.appHits(query, 8)
      if (searchMode) return apps.concat(apps.length && hits.length ? [{ separator: true }] : [], hits)
      return hits.concat(hits.length && apps.length ? [{ separator: true }] : [], apps)
    }
    if (!lv) {
      // the first level is Omarchy's own menu (up to System); the rest is under More
      var mine = source.children("root").filter(function(r) { return source.isBuiltin(r.id) })
      return mine.concat(moreRows().length ? [{ separator: true }, { kind: "more", id: "more", label: "More", title: "More", icon: "\u{f01d8}" }] : [])
    }
    if (lv.kind === "more") return moreRows()
    if (lv.kind === "omarchy") return source.children(lv.id)
    for (var i = 0; i < groups.length; i++) if (groups[i].id === lv.id) return groupRows(groups[i])
    return []
  }
  // More: what extensions add to the root (Window Overview …), then the bar's groups.
  function moreRows() {
    var extra = source.children("root").filter(function(r) { return !source.isBuiltin(r.id) })
    var top = groups.map(function(g) { return { kind: "group", id: g.id, label: g.title, title: g.title, icon: g.icon } })
    return extra.concat(extra.length && top.length ? [{ separator: true }] : [], top)
  }
  // Straight onto the Apps list (Super+Alt+Space), as the native Apps menu.
  function openApps() {
    var root = source.children("root")
    for (var i = 0; i < root.length; i++) if (root[i].provider === "apps") { activate(root[i]); return }
    finish(function() { Util.execDetached("omarchy-menu summon apps") })
  }

  // A list level's rows narrowed by label/subtext and provider search terms
  // (language codes and English names, as in the native language picker).
  function listRows(all) {
    var q = menu.query.trim().toLowerCase()
    if (!all.length) return [{ kind: "wait", label: "Nothing here", disabled: true }]
    if (!q) return all
    var out = all.filter(function(r) {
      return String(r.label || "").toLowerCase().indexOf(q) !== -1
        || String(r.sub || r.note || "").toLowerCase().indexOf(q) !== -1
        || (r.searchTerms || []).join(" ").toLowerCase().indexOf(q) !== -1
    })
    return out.length ? out : [{ kind: "wait", label: "No matches", disabled: true }]
  }
  readonly property int widest: rows.reduce(function(w, r) {
    var label = r.kind === "input" ? String(level ? level.title : "") : String(r.label || "")
    return Math.max(w, label.length + (r.note ? String(r.note).length * 0.8 + 2 : 0) + (query && r.path ? String(r.path).length * 0.8 + 2 : 0))
  }, 18)

  function selectable(i) { var r = rows[i]; return !!r && !r.separator && !r.disabled && r.kind !== "input" }
  function move(step) {
    var n = rows.length, i = current < 0 ? (step > 0 ? -1 : 0) : current
    for (var k = 0; k < n; k++) { i = (i + step + n) % n; if (selectable(i)) { current = i; return } }
  }
  // PgUp/PgDn: about a screenful, stopping at the ends.
  function page(dir) {
    var n = rows.length
    if (!n) return
    var i = current < 0 ? (dir > 0 ? 0 : n - 1) : Math.max(0, Math.min(n - 1, current + dir * 8))
    for (var k = 0; k < n; k++) {
      var j = i - k * dir
      if (j < 0 || j >= n) break
      if (selectable(j)) { current = j; return }
    }
    move(dir)
  }
  function firstSelectable() { for (var i = 0; i < rows.length; i++) if (selectable(i)) return i; return -1 }
  function reveal() {
    if (current >= 0 && current < list.count) list.positionViewAtIndex(current, ListView.Contain)
    else list.positionViewAtBeginning()
  }

  function slide(dir) {
    slideDir = dir
    list.positionViewAtBeginning()
    slideIn.restart()
  }
  function push(next) {
    stack = stack.concat([next]); query = ""
    current = keys.keyboard ? firstSelectable() : -1
    slide(1)
  }
  function pop() {
    stack = stack.slice(0, -1); query = ""
    current = keys.keyboard ? firstSelectable() : -1
    slide(-1)
  }
  function back() {
    if (query) { query = ""; return }
    if (!stack.length) return
    var top = level
    // ‹ on a question cancels it
    if (top.kind === "request") { leaveRequest(true, false); return }
    // an action left while it was still starting: its question, when it
    // comes, is cancelled rather than shown
    if (top.kind === "waiting") { waitTimer.stop(); abandon(top.token) }
    pop()
  }
  function finish(fn) {
    menu.close()
    Qt.callLater(fn)
  }
  function activate(r) {
    if (!r || r.separator || r.disabled) return
    if (r.kind === "menu") push({ kind: "omarchy", id: r.target, title: r.title })
    else if (r.kind === "group") push({ kind: "own", id: r.id, title: r.title })
    else if (r.kind === "more") push({ kind: "more", id: "more", title: r.title })
    else if (r.kind === "provider") openProvider(r)
    else if (r.kind === "action") { if (!(r.asks && launchAsking(r))) finish(function() { menu.runAction(r.action) }) }
    else if (r.kind === "app") { var lib = appLibrary; finish(function() { if (lib) lib.launch(r.appId, r.label) }) }
    else if (r.kind === "choice") answer(r.answer)
    else if (r.kind === "input") answer(query)
    else if (r.kind === "own" && typeof r.run === "function") finish(r.run)
  }

  // ---------------------------------------------------------------- uninstall
  // Right-click or Delete on an app (also in search results) asks first, then
  // hands the desktop id to the shell, which runs omarchy-remove-launcher-entry:
  // web apps and terminal apps lose their launcher, packages and Flatpaks open
  // a terminal for the usual confirmation (as in the native menu).
  property var deleteTarget: null
  readonly property bool deleteConfirmOpen: !!deleteTarget
  // true when the row is an app and the question opened
  function requestDelete(r) {
    if (!r || r.kind !== "app" || !appLibrary || !r.appId) return false
    // Cancel is preselected (the native menu preselects Uninstall): a stray
    // Enter right after Delete must not remove anything
    deleteConfirm.selectedIndex = 0
    deleteTarget = { appId: r.appId, label: r.label }
    return true
  }
  function cancelDelete() { deleteTarget = null }
  function confirmDelete() {
    var target = deleteTarget, lib = appLibrary
    deleteTarget = null
    if (!target || !lib) return
    finish(function() { lib.remove(target.appId, target.label) })
  }

  // ---------------------------------------------------------------- lists the shell fills in
  // Apps, fonts, power profiles, languages: a level here; an unknown provider
  // (or Apps without the library) still opens the native menu there.
  function openProvider(r) {
    if (!source.hasProvider(r.provider)) {
      finish(function() { Util.execDetached("omarchy-menu summon " + Util.shellQuote(r.id)) })
      return
    }
    push({ kind: "provider", id: r.target, provider: r.provider, title: r.title })
    source.loadProvider(r.target, r.provider)
  }

  // ---------------------------------------------------------------- running actions
  // Every action runs with the shims first on its PATH (and, when it asks,
  // its launch token), so its questions come back here.
  function prefixed(action, token) {
    var head = ""
    if (shimDir) head += "export PATH=" + Util.shellQuote(shimDir) + ':"$PATH"; '
    if (token) head += "export TUSCHE_BAR_ASK_TOKEN=" + Util.shellQuote(token) + "; "
    return head + action
  }
  function runAction(action) {
    Util.execDetached(prefixed(action, ""))
  }

  // An action that asks runs as a tracked launch: `setsid -f -w` makes the
  // process Quickshell watches only a waiter – the action itself lives in a
  // session of its own, so it survives this drop-down, the bar being rebuilt
  // or the shell restarting, exactly as the detached actions do – and its
  // exit tells a waiting level that no question is coming. Its output goes
  // to /dev/null: no pipe ties it to the waiter.
  property var launches: []    // tokens of tracked launches still running
  property var abandoned: []   // … whose waiting level was left: their questions are cancelled
  function tracks(token) { return !!token && launches.indexOf(token) !== -1 }
  function abandon(token) {
    if (tracks(token) && abandoned.indexOf(token) === -1) abandoned = abandoned.concat([token])
  }
  // sh becomes `setsid -f -w`: it forks the action (a login shell, as
  // Util.execDetached runs actions) into a new session and waits for it.
  function launchCommand(action, token) {
    return ["sh", "-c",
      'if command -v setsid >/dev/null 2>&1; then exec setsid -f -w bash -lc "$1" </dev/null >/dev/null 2>&1; fi; '
      + 'exec bash -lc "$1" </dev/null >/dev/null 2>&1',
      "sh", prefixed(action, token)]
  }
  function launchAsking(r) {
    if (!shimDir) return false
    var token = "tb" + Date.now().toString(36) + Math.floor(Math.random() * 1679616).toString(36)
    var proc = launchComponent.createObject(plumbing, { token: token })
    if (!proc) return false
    proc.command = launchCommand(r.action, token)
    launches = launches.concat([token])
    push({ kind: "waiting", id: "waiting." + token, token: token, title: r.title || r.label })
    proc.running = true
    waitTimer.restart()
    return true
  }
  function launchExited(token) {
    launches = launches.filter(function(t) { return t !== token })
    abandoned = abandoned.filter(function(t) { return t !== token })
    var top = level
    // ended without asking: nothing more to show
    if (menu.open && top && top.kind === "waiting" && top.token === token) {
      waitTimer.stop()
      stack = stack.slice(0, -1)
      menu.close()
    }
  }

  // ---------------------------------------------------------------- questions (bin/menu-shim)
  // Pending questions, oldest first; the first is on screen while the
  // drop-down is open. The level carries its request, so the rows stay put
  // while the card closes.
  property var requests: []
  property int requestSerial: 0
  function hasPending() { return requests.length > 0 }

  // An option is "<label>", "<glyph>\t<label>" or "<glyph>\t<label>\t<subtext>"
  // (as the native menu reads it): the glyph is never returned, the subtext
  // shows as the row's note and comes back with the label.
  function choiceRow(option, i) {
    var parts = String(option || "").split("\t")
    var icon = parts.length > 1 ? parts.shift() : ""
    var label = parts.shift() || ""
    var detail = parts.join("\t")
    return { kind: "choice", id: "choice." + i, icon: icon, label: label, note: detail, answer: detail ? label + "\t" + detail : label }
  }
  function makeRequest(p) {
    var mode = p.mode === "input" ? "input" : "select"
    var options = Array.isArray(p.options) ? p.options : []
    var choices = []
    if (mode === "select") for (var i = 0; i < options.length; i++) choices.push(choiceRow(options[i], i))
    menu.requestSerial += 1
    return {
      id: menu.requestSerial, token: String(p.token || ""), mode: mode,
      prompt: String(p.prompt || (mode === "input" ? "Input" : "Select")),
      selectionFile: String(p.selectionFile || ""), doneFile: String(p.doneFile || ""),
      width: Math.max(0, Number(p.width) || 0), maxHeight: Math.max(0, Number(p.maxHeight) || 0),
      rows: choices
    }
  }
  // From the engine (Workspaces.dropAsk): true = taken. The owner opens the
  // drop-down when something is pending.
  function takeRequest(p) {
    if (!p || !p.doneFile) return false
    var rq = makeRequest(p)
    if (rq.token && abandoned.indexOf(rq.token) !== -1) { writeCancel(rq); return true }
    requests = requests.concat([rq])
    showRequests(true)
    return true
  }
  // The first pending question on top: in place of a waiting level (the same
  // level turning into the question) or a finished question, else on top.
  function showRequests(animate) {
    if (!menu.open || !requests.length) return
    var rq = requests[0], top = level
    if (top && top.kind === "request" && top.req.id === rq.id) return
    var transient = !!top && (top.kind === "waiting" || top.kind === "request")
    var inPlace = !!top && top.kind === "waiting" && !!rq.token && top.token === rq.token
    waitTimer.stop()
    stack = (transient ? stack.slice(0, -1) : stack).concat([{ kind: "request", id: "request." + rq.id, title: rq.prompt, req: rq }])
    query = ""
    current = keys.keyboard ? firstSelectable() : -1
    if (animate && !inPlace) slide(1)
    else list.positionViewAtBeginning()
  }
  function shownRequest() {
    var rq = levelRequest
    if (!rq) return null
    for (var i = 0; i < requests.length; i++) if (requests[i].id === rq.id) return rq
    return null
  }
  function answer(value) {
    var rq = shownRequest()
    if (!rq) return
    requests = requests.filter(function(x) { return x.id !== rq.id })
    writeAnswer(rq, value)
    if (requests.length) showRequests(true)
    else menu.close()
  }
  // The question on screen goes: cancelled (write) or its asker gone. The
  // next pending one takes its place; else back a level (or closed, when the
  // question had opened the drop-down by itself and `closeIfFirst`).
  function leaveRequest(write, closeIfFirst) {
    var rq = shownRequest()
    if (rq) {
      requests = requests.filter(function(x) { return x.id !== rq.id })
      if (write) writeCancel(rq)
    }
    if (requests.length) showRequests(true)
    else if (closeIfFirst && stack.length <= 1) menu.close()
    else pop()
  }
  function requesterGone(id) {
    var rq = shownRequest()
    if (rq && rq.id === id) leaveRequest(false, true)
    else requests = requests.filter(function(x) { return x.id !== id })
  }
  // Never leave an asker waiting: on every close and on destruction.
  function cancelAll() {
    var pending = requests
    if (!pending.length) return
    requests = []
    for (var i = 0; i < pending.length; i++) writeCancel(pending[i])
  }
  function dropClosed() {
    waitTimer.stop()
    var top = level
    if (top && top.kind === "waiting") abandon(top.token)
    cancelAll()
  }
  Component.onDestruction: cancelAll()

  // As the native finishRequest: the answer into the selection file, then
  // the done file; a cancel is the done file alone. Nothing is written once
  // the asker has gone (its selection file is removed when it exits).
  function writeAnswer(rq, value) {
    if (!rq.doneFile) return
    Quickshell.execDetached(["sh", "-c",
      '[ -z "$1" ] || [ -e "$1" ] || exit 0; printf \'%s\\n\' "$3" > "$1"; : > "$2"',
      "sh", rq.selectionFile, rq.doneFile, String(value)])
  }
  function writeCancel(rq) {
    if (!rq.doneFile) return
    Quickshell.execDetached(["sh", "-c",
      '[ -z "$1" ] || [ -e "$1" ] || exit 0; : > "$2"',
      "sh", rq.selectionFile, rq.doneFile])
  }

  onQueryChanged: {
    current = query ? firstSelectable() : (keys.keyboard ? firstSelectable() : -1)
    Qt.callLater(menu.reveal)
  }
  // Keep the row the keys move to in view – from here, not from the row: in
  // a long list it may not be built yet (wrapping, PgDn). A hovered row is
  // under the pointer already (and scrolling for it would chain down a list).
  onCurrentChanged: if (current >= 0 && keys.keyboard) Qt.callLater(menu.reveal)
  // ---------------------------------------------------------------- view
  component Label: Text {
    textFormat: Text.PlainText
    renderType: Text.NativeRendering
    font.family: menu.labelFamily
    font.pixelSize: menu.labelPx
    color: menu.ink
  }

  Item {
    id: keys
    anchors.fill: parent
    focus: true
    // Keyboard selection wins over hover until the pointer really moves
    // (delegates appearing under a still cursor send hover events too).
    property bool keyboard: false
    property bool pointerKnown: false
    property real pointerX: 0
    property real pointerY: 0
    function pointerMoved(area, mouse) {
      var p = area.mapToItem(keys, mouse.x, mouse.y)
      var moved = pointerKnown && (Math.abs(p.x - pointerX) > 0.5 || Math.abs(p.y - pointerY) > 0.5)
      pointerKnown = true; pointerX = p.x; pointerY = p.y
      if (moved) keyboard = false
      return moved
    }

    // (Inside an Item: the panel's default content only takes Items.)
    Connections {
      target: menu
      function onOpenChanged() {
        if (!menu.open) { menu.searchMode = false; menu.dropClosed(); return }
        menu.stack = []; menu.query = ""; menu.current = -1; menu.deleteTarget = null
        keys.keyboard = false; keys.pointerKnown = false
        menu.slideX = 0
        source.evaluate()
        source.refreshApps()
        // opened for a question: straight onto it
        menu.showRequests(false)
      }
    }

    NumberAnimation {
      id: slideIn
      target: menu; property: "slideX"
      from: menu.slideDir * Style.space(28); to: 0
      duration: Style.duration(200); easing.type: Easing.OutCubic
    }

    Item {
      id: plumbing
      // one per tracked launch (launchAsking)
      Component {
        id: launchComponent
        Process {
          property string token: ""
          onExited: { menu.launchExited(token); destroy() }
        }
      }
      // An action detected as asking that neither asks nor ends: the waiting
      // level gives up (not abandoned – a late question still opens it).
      Timer {
        id: waitTimer
        interval: 3000
        onTriggered: {
          var top = menu.level
          if (!menu.open || !top || top.kind !== "waiting") return
          menu.stack = menu.stack.slice(0, -1)
          menu.close()
        }
      }
      // A question on screen whose asker has gone (killed, or it fell back to
      // the native menu after an IPC timeout) goes too.
      Timer {
        interval: 1000
        repeat: true
        running: menu.open && !!menu.levelRequest && menu.levelRequest.selectionFile !== ""
        onTriggered: {
          var rq = menu.shownRequest()
          if (!rq || aliveProc.running) return
          aliveProc.rid = rq.id
          aliveProc.command = ["test", "-e", rq.selectionFile]
          aliveProc.running = true
        }
      }
      Process {
        id: aliveProc
        property int rid: 0
        onExited: function(exitCode, exitStatus) { if (exitStatus === 0 && exitCode !== 0) menu.requesterGone(aliveProc.rid) }
      }
    }

    Keys.onPressed: function(e) {
      var plain = !(e.modifiers & (Qt.ControlModifier | Qt.AltModifier | Qt.MetaModifier))
      var input = menu.inputLevel
      // the uninstall question is modal: it takes every key
      if (menu.deleteConfirmOpen) { deleteConfirm.handleKey(e); e.accepted = true; return }
      if (e.key === Qt.Key_Delete) { keys.keyboard = true; if (!menu.requestDelete(menu.rows[menu.current])) return }
      else if (e.key === Qt.Key_Escape) { if (menu.query) menu.query = ""; else menu.close() }
      else if (e.key === Qt.Key_Down || e.key === Qt.Key_Tab) { keys.keyboard = true; menu.move(1) }
      else if (e.key === Qt.Key_Up || e.key === Qt.Key_Backtab) { keys.keyboard = true; menu.move(-1) }
      else if (e.key === Qt.Key_PageDown) { keys.keyboard = true; menu.page(1) }
      else if (e.key === Qt.Key_PageUp) { keys.keyboard = true; menu.page(-1) }
      else if (e.key === Qt.Key_Return || e.key === Qt.Key_Enter || (e.key === Qt.Key_Right && !menu.query && !input)) {
        keys.keyboard = true
        if (input) menu.answer(menu.query)
        else menu.activate(menu.rows[menu.current >= 0 ? menu.current : menu.firstSelectable()])
      }
      else if (e.key === Qt.Key_Left && !menu.query) { keys.keyboard = true; menu.back() }
      // (typed text is never lost to a Backspace too many)
      else if (e.key === Qt.Key_Backspace) { if (menu.query) menu.query = menu.query.slice(0, -1); else if (!input) { keys.keyboard = true; menu.back() } }
      else if (plain && e.text && e.text.length === 1 && e.text > " ") menu.query += e.text
      else if (plain && e.key === Qt.Key_Space && (menu.query || input)) menu.query += " "
      else return
      e.accepted = true
    }

    Column {
      id: body
      width: parent.width

      // header: OMARCHY · ‹ Submenu · search
      Item {
        id: header
        width: parent.width
        height: Style.space(32)
        Label {
          id: backGlyph
          visible: menu.stack.length > 0 || menu.query !== ""
          x: Style.space(8)
          anchors.verticalCenter: parent.verticalCenter
          text: "‹"
          font.pixelSize: Style.font.body + 4
          color: Util.alpha(menu.ink, 0.7)
          MouseArea { anchors.fill: parent; anchors.margins: -Style.space(6); cursorShape: Qt.PointingHandCursor; onClicked: menu.back() }
        }
        Label {
          id: title
          x: backGlyph.visible ? backGlyph.x + backGlyph.implicitWidth + Style.space(10) : Style.space(10)
          width: closeGlyph.x - x - Style.space(8)
          anchors.verticalCenter: parent.verticalCenter
          elide: Text.ElideRight
          text: menu.searching ? "⌕  " + menu.query + "▏"
            : menu.launcherLine ? "⌕  ▏Search apps and menu"
            : (menu.level ? menu.level.title : menu.rootTitle).toUpperCase()
          font.letterSpacing: menu.searching || menu.launcherLine ? 0 : Style.space(2.5)
          font.pixelSize: menu.searching || menu.launcherLine ? menu.labelPx : Math.max(10, Style.font.body - 2)
          color: Util.alpha(menu.ink, menu.searching ? 1 : menu.launcherLine ? 0.5 : 0.72)
        }
        Label {
          id: closeGlyph
          x: parent.width - implicitWidth - Style.space(10)
          anchors.verticalCenter: parent.verticalCenter
          text: "×"
          font.pixelSize: Style.font.body + 2
          color: Util.alpha(menu.ink, 0.6)
          MouseArea { anchors.fill: parent; anchors.margins: -Style.space(6); cursorShape: Qt.PointingHandCursor; onClicked: menu.close() }
        }
      }
      Rectangle { x: Style.space(6); width: parent.width - 2 * x; height: 1; color: Util.alpha(menu.ink, 0.12) }
      Item { width: 1; height: Style.space(6) }

      // A ListView: Apps and long questions (hundreds of time zones) only
      // build the rows on screen.
      ListView {
        id: list
        width: parent.width
        height: Math.max(0, keys.height - menu.headerH)
        model: menu.rows.length
        clip: true
        boundsBehavior: Flickable.StopAtBounds
        opacity: 1 - Math.abs(menu.slideX) / Style.space(40)

        delegate: Item {
          id: row
          required property int index
          readonly property var r: menu.rows[index] || ({})
          readonly property bool hot: menu.current === index && !r.separator && !r.disabled
          readonly property bool opens: r.kind === "menu" || r.kind === "group" || r.kind === "more" || r.kind === "provider" || r.asks === true
          readonly property bool isApp: r.kind === "app"
          x: menu.slideX
          width: list.width
          height: r.separator ? menu.separatorH : menu.rowH

          Rectangle {
            visible: row.r.separator === true
            x: Style.space(8); width: parent.width - 2 * x; height: 1
            anchors.verticalCenter: parent.verticalCenter
            color: Util.alpha(menu.ink, 0.12)
          }
          // the hovered row's fill; with the metal tube it takes the tube's
          // pill shape exactly, so fill and chrome are one form
          Rectangle {
            readonly property bool tube: !!menu.metalHover
            x: tube ? Style.space(4) : 0
            y: tube ? Style.space(2) : 0
            width: parent.width - 2 * x
            height: parent.height - 2 * y
            visible: row.hot && !menu.inverting
            radius: tube ? menu.hoverRadius(height) : menu.rowRadius
            color: Util.alpha(menu.ink, tube ? 0.07 : 0.09)
          }
          // metal: a chrome tube around the row (pill-shaped, a little inside it)
          MetalShape {
            visible: row.hot && !!menu.metalHover
            spec: menu.metalHover
            pad: 3
            x: Style.space(4) - pad
            y: Style.space(2) - pad
            width: parent.width - 2 * Style.space(4) + 2 * pad
            height: parent.height - 2 * Style.space(2) + 2 * pad
            radius: menu.hoverRadius(height - 2 * pad)
          }
          // material: hard inversion (also while the brush is missing) …
          Rectangle {
            anchors.fill: parent
            visible: row.hot && menu.inverting && (!menu.brushFile || brushImage.status !== Image.Ready)
            color: menu.src ? menu.src.fill : "transparent"
          }
          // … or the Lavur brush stroke (a little past the row's ends); the
          // URL carries the theme stamp, so the cache is fine
          Image {
            id: brushImage
            visible: row.hot && !!menu.brushFile && status === Image.Ready
            x: -Style.space(4)
            y: Math.round((parent.height - height) / 2)
            width: parent.width + Style.space(10)
            height: Math.round(parent.height * 1.08)
            source: menu.brushFile ? menu.brushUrl : ""
            fillMode: Image.Stretch
            smooth: true
          }

          Text {
            id: icon
            visible: !row.r.separator && !(row.isApp && appIcon.status === Image.Ready)
            x: Style.space(10); width: Style.space(22)
            anchors.verticalCenter: parent.verticalCenter
            horizontalAlignment: Text.AlignHCenter
            textFormat: Text.PlainText; renderType: Text.NativeRendering
            text: row.r.icon || ""
            font.family: row.r.iconFont || Style.font.menuFamily
            font.pixelSize: Style.font.body + 2
            color: row.hot && menu.inverting ? menu.src.text : Util.alpha(menu.ink, row.hot ? 0.95 : 0.62)
            opacity: row.r.disabled ? 0.45 : 1
          }
          // an app's own icon (the library's lookup), centred in the icon
          // column; the glyph above stands in until it is there
          Image {
            id: appIcon
            readonly property int size: Math.round(Math.min(menu.rowH * 0.7, Style.font.body + 6))
            visible: row.isApp && status === Image.Ready
            x: icon.x + Math.round((icon.width - size) / 2)
            anchors.verticalCenter: parent.verticalCenter
            width: size; height: size
            sourceSize.width: size * Screen.devicePixelRatio
            sourceSize.height: size * Screen.devicePixelRatio
            fillMode: Image.PreserveAspectFit
            asynchronous: true
            smooth: true
            source: row.isApp && menu.appLibrary ? menu.appLibrary.iconSource(row.r.appIcon) : ""
          }
          Label {
            id: label
            color: row.hot && menu.inverting ? menu.src.text : menu.ink
            visible: !row.r.separator
            x: icon.x + icon.width + Style.space(10)
            width: Math.max(0, trail.x - x - Style.space(8))
            anchors.verticalCenter: parent.verticalCenter
            elide: Text.ElideRight
            text: row.r.label || ""
            opacity: row.r.disabled ? 0.45 : 1
          }
          Row {
            id: trail
            visible: !row.r.separator
            x: parent.width - width - Style.space(10)
            anchors.verticalCenter: parent.verticalCenter
            spacing: Style.space(8)
            Label {
              visible: text !== ""
              anchors.verticalCenter: parent.verticalCenter
              // a long subtext never squeezes the label away
              width: Math.min(implicitWidth, row.width * 0.45)
              elide: Text.ElideRight
              text: row.r.note || (row.hot && row.isApp ? "Del · uninstall" : menu.query ? (row.r.path || "") : "")
              font.pixelSize: Style.font.caption
              color: row.hot && menu.inverting ? Util.alpha(menu.src.text, 0.75) : Util.alpha(menu.ink, 0.5)
            }
            Label {
              visible: row.r.checked === true
              anchors.verticalCenter: parent.verticalCenter
              text: "✓"
              color: row.hot && menu.inverting ? menu.src.text : Util.alpha(menu.ink, 0.8)
            }
            Label {
              visible: row.opens
              anchors.verticalCenter: parent.verticalCenter
              text: "›"
              font.pixelSize: Style.font.body + 2
              color: row.hot && menu.inverting ? menu.src.text : Util.alpha(menu.ink, row.hot ? 0.8 : 0.4)
            }
          }

          MouseArea {
            anchors.fill: parent
            enabled: !row.r.separator && !row.r.disabled && row.r.kind !== "input"
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onPositionChanged: function(mouse) { if (keys.pointerMoved(this, mouse)) menu.current = row.index }
            onEntered: if (!keys.keyboard) menu.current = row.index
            acceptedButtons: Qt.LeftButton | Qt.RightButton
            onClicked: function(mouse) {
              if (mouse.button === Qt.RightButton) { menu.current = row.index; menu.requestDelete(row.r) }
              else menu.activate(row.r)
            }
          }
        }
      }
    }

    // Uninstall question (right-click or Delete on an app), the native
    // menu's dialog: Enter confirms, Esc / ← / → / Tab as there.
    ConfirmDialog {
      id: deleteConfirm
      anchors.fill: parent
      z: 10
      opened: menu.deleteConfirmOpen
      message: "Do you want to uninstall " + (menu.deleteTarget ? menu.deleteTarget.label : "") + "?"
      confirmText: "Uninstall"
      background: Commons.Color.popups.background
      foreground: menu.ink
      scrim: Util.alpha(Commons.Color.popups.background, 0.78)
      selectedBackground: Util.alpha(menu.ink, 0.1)
      selectedText: menu.ink
      fontFamily: menu.labelFamily
      cornerRadius: menu.rowRadius
      onCanceled: menu.cancelDelete()
      onConfirmed: menu.confirmDelete()
    }
  }
}
