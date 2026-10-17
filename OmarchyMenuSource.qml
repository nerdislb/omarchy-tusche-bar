import QtQuick
import Quickshell
import Quickshell.Io
import qs.Commons
import "vendor/MenuModel.js" as MenuModel

// The Omarchy menu's own definition for the drop-down logo menu: the
// shipped omarchy-menu.jsonc with the user's extensions merged on top, and
// the `when:` / `checked:` / `disabled:` guards answered in one batch — the
// same reading as the native menu (vendor/MenuModel.js is its library).
// Rows open on the last answers; evaluate() refreshes them.
// Also the lists the shell fills in (the native menu's providers: Apps from
// the shell's application library; fonts, power profiles and languages from
// bash), and which actions ask a question through omarchy-menu-select / -input.
Item {
  id: src

  readonly property string omarchyPath: Quickshell.env("OMARCHY_PATH") || (Quickshell.env("HOME") + "/.local/share/omarchy")
  property var defaultItems: []
  property var userItems: []
  // ids defined by Omarchy's own menu file (the drop-down keeps them on its
  // first level; entries only the user's extensions add go under "More")
  property var builtinIds: ({})
  property int builtinCount: 0
  property var items: ({})
  property var itemOrder: []
  property var whenResults: ({})
  // set once the guards have answered for the first time (DropMenu waits only after that)
  property bool evaluated: false
  property var checkedResults: ({})
  property var disabledResults: ({})
  property bool pending: false
  // While the menu is up, a changed definition is re-checked at once.
  property bool live: false

  function rebuild() {
    var merged = MenuModel.mergeMenuSources(defaultItems, userItems)
    var own = {}
    for (var i = 0; i < defaultItems.length; i++) if (defaultItems[i] && defaultItems[i].id) own[defaultItems[i].id] = true
    builtinIds = own
    builtinCount = Object.keys(own).length
    items = merged.items
    itemOrder = merged.itemOrder
    // as the native menu: provider lists load again for the new definition
    providerRevision += 1
    providerRows = ({})
    providerQueue = []
    if (live) evaluate()
  }

  FileView {
    id: defaultFile
    path: src.omarchyPath + "/default/omarchy/omarchy-menu.jsonc"
    watchChanges: true
    printErrors: false
    onLoaded: { src.defaultItems = MenuModel.parseMenuJsonc(text()); src.rebuild() }
    onLoadFailed: { src.defaultItems = []; src.rebuild() }
    onFileChanged: reload()
  }
  FileView {
    id: userFile
    path: Quickshell.env("HOME") + "/.config/omarchy/extensions/omarchy-menu.jsonc"
    watchChanges: true
    printErrors: false
    onLoaded: { src.userItems = MenuModel.parseMenuJsonc(text()); src.rebuild() }
    onLoadFailed: { src.userItems = []; src.rebuild() }
    onFileChanged: reload()
  }

  function entry(id) { return MenuModel.item(items, id) }
  // without Omarchy's file (not read yet) everything counts as its own
  function isBuiltin(id) { return builtinCount === 0 || builtinIds[id] === true }
  function shown(e) { return MenuModel.isVisible(items, itemOrder, whenResults, e, 0) }

  // A row for the view. kind: "menu" (opens inside the drop-down),
  // "provider" (a list the shell fills in: Apps, fonts …; `provider` names
  // it, `target` is the menu it fills), "action" (`asks`: its command asks
  // through omarchy-menu-select / -input).
  function row(e) {
    var target = e.kind === "link" ? e.target : e.id
    var t = e.kind === "link" ? entry(e.target) : e
    var provider = t && t.provider ? String(t.provider) : ""
    return {
      id: e.id, target: target, label: e.label, title: e.title || e.label,
      icon: e.icon || "", iconFont: e.iconFont || "",
      kind: provider ? "provider" : (e.kind === "menu" || e.kind === "link") ? "menu" : "action",
      provider: provider,
      action: e.action || "",
      asks: !provider && asks(e.action),
      checked: !!(e.checked && checkedResults[e.id]) || MenuModel.isDisabled(disabledResults, e),
      disabled: MenuModel.isDisabled(disabledResults, e),
      path: MenuModel.parentPathFor(items, e.id)
    }
  }

  function children(menuId) {
    var out = []
    for (var i = 0; i < itemOrder.length; i++) {
      var e = items[itemOrder[i]]
      if (!e || e.parent !== menuId || e.kind === "app") continue
      if (!shown(e)) continue
      out.push(row(e))
    }
    return out
  }

  // Search over the whole tree, ranked the native way.
  function search(query, limit) {
    var q = String(query || "").trim()
    if (!q) return []
    var hits = []
    for (var i = 0; i < itemOrder.length; i++) {
      var e = items[itemOrder[i]]
      if (!e || e.kind === "app" || e.id === "root") continue
      var listed = shown(e) && ancestorsVisible(e)
      if (!MenuModel.matchesQuery(e, q, listed)) continue
      hits.push({ score: MenuModel.searchScore(items, e, q), row: row(e) })
    }
    hits.sort(function(a, b) { return a.score - b.score })
    return hits.slice(0, limit || 40).map(function(h) { return h.row })
  }
  function ancestorsVisible(e) {
    var p = entry(e.parent), guard = 0
    while (p && p.id !== "root" && guard++ < 32) {
      if (!shown(p)) return false
      p = entry(p.parent)
    }
    return true
  }

  function evaluate() {
    evaluateAsks()
    if (guardProc.running) { pending = true; return }
    pending = false
    var script = MenuModel.guardScript(items)
    if (!script) { whenResults = ({}); checkedResults = ({}); disabledResults = ({}); return }
    guardProc.collected = ""
    guardProc.command = ["bash", "-lc", script]
    guardProc.running = true
  }

  Process {
    id: guardProc
    property string collected: ""
    stdout: SplitParser { onRead: function(data) { guardProc.collected += data + "\n" } }
    onExited: function(exitCode, exitStatus) {
      if (exitCode === 0 && exitStatus === 0) {
        var w = ({}), c = ({}), d = ({})
        var lines = guardProc.collected.split("\n")
        for (var i = 0; i < lines.length; i++) {
          var line = lines[i].trim()
          var colon = line.lastIndexOf(":")
          if (colon < 0) continue
          var value = line.substring(colon + 1) === "1"
          var rest = line.substring(0, colon)
          var tagAt = rest.lastIndexOf(":")
          if (tagAt < 0) continue
          var id = rest.substring(0, tagAt), tag = rest.substring(tagAt + 1)
          if (tag === "w") w[id] = value
          else if (tag === "c") c[id] = value
          else if (tag === "d") d[id] = value
        }
        src.whenResults = w; src.checkedResults = c; src.disabledResults = d
        src.evaluated = true
      }
      if (src.pending) Qt.callLater(src.evaluate)
    }
  }

  // ---------------------------------------------------------------- actions that ask
  // An action asks when its first word is a script that calls
  // omarchy-menu-select or omarchy-menu-input (Keybindings, Timezone, the
  // plugin rows …). Answered once per evaluation, like the guards; the
  // drop-down keeps itself open for those (DropMenu.qml).
  property var askWords: ({})
  property bool askPending: false

  function firstWord(action) {
    var m = /^\s*([A-Za-z0-9_.+\/-]+)(\s|$)/.exec(String(action || ""))
    return m ? m[1] : ""
  }
  function asks(action) {
    var w = firstWord(action)
    // Screen captures freeze or record the screen (and the webcam recording
    // asks only with two cameras): the drop-down must be gone before they
    // start. A question they do ask still comes back to it.
    if (/^omarchy-capture-/.test(w)) return false
    return !!w && askWords[w] === true
  }
  // The words come as arguments; prints the ones that resolve to such a
  // script (a `#!` file containing the command names). Binaries are skipped
  // unread, the scripts go through one grep.
  function askScript() {
    return [
      "declare -A words_of=()",
      "for w in \"$@\"; do",
      "  p=$(command -v -- \"$w\" 2>/dev/null) || continue",
      "  [[ $p == /* && -f $p && -r $p && -x $p ]] || continue",
      "  head=''; IFS= read -r -n 2 head < \"$p\" 2>/dev/null || true",
      "  [[ $head == '#!' ]] || continue",
      "  words_of[$p]+=\"$w \"",
      "done",
      "(( ${#words_of[@]} )) || exit 0",
      "grep -lE -- 'omarchy-menu-(select|input)' \"${!words_of[@]}\" 2>/dev/null | while IFS= read -r f; do",
      "  for w in ${words_of[$f]}; do printf '%s\\n' \"$w\"; done",
      "done",
      "exit 0"
    ].join("\n")
  }
  function evaluateAsks() {
    if (askProc.running) { askPending = true; return }
    askPending = false
    var seen = ({}), words = []
    for (var i = 0; i < itemOrder.length; i++) {
      var e = items[itemOrder[i]]
      var w = e && e.action ? firstWord(e.action) : ""
      if (w && !seen[w]) { seen[w] = true; words.push(w) }
    }
    if (!words.length) { askWords = ({}); return }
    askProc.collected = ""
    askProc.command = ["bash", "-lc", askScript(), "bash"].concat(words)
    askProc.running = true
  }
  Process {
    id: askProc
    property string collected: ""
    stdout: SplitParser { onRead: function(data) { askProc.collected += data + "\n" } }
    onExited: function(exitCode, exitStatus) {
      if (exitCode === 0 && exitStatus === 0) {
        var next = ({})
        var lines = askProc.collected.split("\n")
        for (var i = 0; i < lines.length; i++) {
          var w = lines[i].trim()
          if (w) next[w] = true
        }
        src.askWords = next
      }
      if (src.askPending) Qt.callLater(src.evaluateAsks)
    }
  }

  // ---------------------------------------------------------------- providers
  // The native menu's bash providers, copied from the `providers` map in
  // shell/plugins/menu/Menu.qml (tests/regressions.cjs compares them): one
  // row per line, `label\tvalue\tcurrent` plus an optional search term.
  // A volatile one runs again each time its level is entered; the others
  // once per menu definition.
  readonly property var providers: ({
    "fonts": {
      script: "current=$(omarchy-font-current 2>/dev/null); omarchy-font-list 2>/dev/null | while read -r f; do [[ -z $f ]] && continue; printf '%s\\t%s\\t%s\\n' \"$f\" \"$f\" \"$current\"; done",
      icon: "\ue659",
      volatile: true,
      actionFor: function(value) { return "omarchy-font-set " + Util.shellQuote(value) }
    },
    "power-profiles": {
      script: "current=$(powerprofilesctl get 2>/dev/null); omarchy-powerprofiles-list 2>/dev/null | while read -r p; do [[ -z $p ]] && continue; printf '%s\\t%s\\t%s\\n' \"$p\" \"$p\" \"$current\"; done",
      icon: "\udb81\udc0b",
      actionFor: function(value) { return "omarchy-powerprofiles-set autodetect " + Util.shellQuote(value) }
    },
    "languages": {
      script: "current=$(omarchy-language 2>/dev/null); omarchy-language list 2>/dev/null | while IFS=$'\\t' read -r name code english; do [[ -z $code ]] && continue; printf '%s\\t%s\\t%s\\t%s\\n' \"$name\" \"$code\" \"$current\" \"$english\"; done",
      icon: "\uf1ab",
      volatile: true,
      actionFor: function(value) { return "omarchy-language " + Util.shellQuote(value) }
    }
  })
  // menu id → rows; replaced whole, never written in place
  property var providerRows: ({})
  property var providerQueue: []
  property int providerRevision: 0

  // Apps needs the application library (a shell new enough to hand menu
  // plugins its facade); unknown names stay with the native menu.
  function hasProvider(name) { return name === "apps" ? !!appLibrary : !!providers[name] }
  function providerRowsFor(menuId) { return providerRows[menuId] || null }

  function loadProvider(menuId, name) {
    if (name === "apps") { loadApps(); return }
    var spec = providers[name]
    if (!spec) return
    if (providerRows[menuId] && !spec.volatile) return
    if (providerProc.running) {
      if (providerProc.menuId === menuId) return
      var queued = providerQueue.some(function(q) { return q.menuId === menuId })
      if (!queued) providerQueue = providerQueue.concat([{ menuId: menuId, name: name }])
      return
    }
    providerProc.menuId = menuId
    providerProc.name = name
    providerProc.revision = providerRevision
    providerProc.collected = ""
    providerProc.command = ["bash", "-lc", spec.script]
    providerProc.running = true
  }

  // As the native mergeProviderRows: ✓ marks the current value (here the
  // drop-down's own checked mark), ids stay distinct.
  function providerList(menuId, name, text) {
    var spec = providers[name]
    if (!spec) return []
    var lines = String(text || "").split("\n")
    var out = [], taken = ({})
    for (var i = 0; i < lines.length; i++) {
      var line = lines[i].trim()
      if (!line) continue
      var parts = line.split("\t")
      var label = parts[0] || ""
      var value = parts[1] || parts[0] || ""
      var current = parts[2] || ""
      if (!label) continue
      var id = menuId + "." + MenuModel.slugify(value)
      while (taken[id]) id += "-"
      taken[id] = true
      var action = spec.actionFor(value)
      // Native search includes the value via the row id and an optional
      // fourth field (e.g. "Danish" for the language labeled "Dansk").
      out.push({ kind: "action", id: id, label: label, icon: spec.icon || "", checked: value === current,
                 searchTerms: [value].concat(parts[3] ? [parts[3]] : []),
                 action: action, asks: asks(action), path: "" })
    }
    return out
  }

  Process {
    id: providerProc
    property string menuId: ""
    property string name: ""
    property string collected: ""
    property int revision: 0
    stdout: SplitParser { onRead: function(data) { providerProc.collected += data + "\n" } }
    onExited: {
      if (providerProc.revision === src.providerRevision) {
        var next = Object.assign({}, src.providerRows)
        next[providerProc.menuId] = src.providerList(providerProc.menuId, providerProc.name, providerProc.collected)
        src.providerRows = next
      }
      Qt.callLater(src.startNextProvider)
    }
  }
  function startNextProvider() {
    if (providerProc.running || !providerQueue.length) return
    var q = providerQueue[0]
    providerQueue = providerQueue.slice(1)
    loadProvider(q.menuId, q.name)
  }

  // ---------------------------------------------------------------- apps
  // The shell's application library (shell.appLibrary, the facade the engine
  // receives as a "menu" plugin): rows like the native mergeAppRows(), one
  // per desktop id, alphabetical. null until the Apps level was entered.
  property var appLibrary: null
  property var appRows: null

  function appRow(lib, entry, id, path) {
    var sub = String(lib.entrySubtext(entry) || "")
    return { kind: "app", id: "apps." + id, appId: id, label: String(lib.entryName(entry) || id),
             sub: sub, path: path === undefined ? sub : path, appIcon: String(entry.icon || ""), icon: "\u{f003b}" }
  }
  function loadApps() {
    var lib = appLibrary
    if (!lib) { appRows = []; return }
    var list = lib.sortedEntries("") || []
    var out = [], seen = ({})
    for (var i = 0; i < list.length; i++) {
      var e = list[i] ? list[i].entry : null
      var id = String((e && e.id) || "")
      if (!id || seen[id]) continue
      seen[id] = true
      out.push(appRow(lib, e, id))
    }
    // DesktopEntries can reorder when an application starts (native comment)
    out.sort(function(a, b) {
      var x = a.label.toLowerCase(), y = b.label.toLowerCase()
      if (x !== y) return x < y ? -1 : 1
      return a.appId < b.appId ? -1 : a.appId > b.appId ? 1 : 0
    })
    appRows = out
  }
  // Installed apps matching a search, ranked by the library (the launcher's
  // own order), at most `limit`.
  function appHits(query, limit) {
    var lib = appLibrary
    if (!lib || !String(query || "").trim()) return []
    var list = lib.sortedEntries(query) || []
    var out = [], seen = ({})
    for (var i = 0; i < list.length && out.length < (limit || 8); i++) {
      var e = list[i] ? list[i].entry : null
      var id = String((e && e.id) || "")
      if (!id || seen[id]) continue
      seen[id] = true
      out.push(appRow(lib, e, id, "Apps"))
    }
    return out
  }
  // After the menu closed (DropMenu's iconRefresh): icons that arrived since
  // (the native launcher runs refreshIcons on every open), at most once a minute.
  property double lastAppsRefresh: 0
  function refreshApps() {
    if (!appLibrary) return
    var now = Date.now()
    if (now - lastAppsRefresh < 60000) return
    lastAppsRefresh = now
    appLibrary.refreshIcons()
    if (appRows !== null) loadApps()
  }
  Connections {
    target: src.appLibrary
    ignoreUnknownSignals: true
    function onAppsChanged() { if (src.appRows !== null) src.loadApps() }
  }
}
