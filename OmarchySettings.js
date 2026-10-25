.pragma library

// Omarchy's own settings as Control Center rows, read from Omarchy's menu
// definition (default/omarchy/omarchy-menu.jsonc plus the user's extensions,
// merged and answered by OmarchyMenuSource through vendor/MenuModel.js).
// Pure functions; ControlCenter.js keeps them in the live state as the
// `omarchy` domain, ControlCenter.qml runs the actions.
//
// Three shapes are recognised, so a setting Omarchy adds to its menu shows up
// here without touching the Control Center:
//   choice  a menu whose entries carry `checked:` guards (Window Corners, Bar
//           Background, Defaults › Browser …): one row, its entries the
//           values, the checked one live;
//   toggle  two neighbouring entries whose `when:` guards are each other's
//           negation (Window Gaps On / Off …): one row, and the state live is
//           the entry the menu does NOT offer (it offers the way out);
//   reader  a menu of `<reader> <value>` actions where <reader> alone prints
//           the current value (Position Bar: `omarchy-bar position top`), and
//           the lists the native menu fills from bash (fonts …); both are read
//           by the Control Center's own batch (readerScript).
// A value runs exactly its menu entry's action, the way the menu would.
// Nothing may ask behind the Control Center's exclusive keyboard: actions
// that open a terminal or a window (omarchy-launch-…), shell constructs and
// scripts that use sudo or pkexec are shown read-only; for the rest,
// bin/cc-shim refuses a question, a terminal or a password prompt at run time
// (an Omarchy default app that is not installed yet, say) and the step fails
// with the reason.

// Where the rows go and what they are called. Keys are the row keys: the menu
// id of a choice, the first entry of a toggle, or a reader key. A setting not
// listed here still appears, under System › More from Omarchy.
var PLACE = {
  "appearance.top-bar.position":                         { area: "bar", section: "OMARCHY BAR", label: "Position" },
  "appearance.top-bar.background":                       { area: "bar", section: "OMARCHY BAR", label: "Background" },
  "appearance.top-bar.indicators.clock":                 { area: "bar", section: "OMARCHY BAR", label: "Clock" },
  "appearance.top-bar.indicators.battery-percentage-on": { area: "bar", section: "OMARCHY BAR" },
  "appearance.top-bar.hide":                             { area: "bar", section: "OMARCHY BAR" },
  "appearance.windows.corners":                          { area: "windows", section: "WINDOWS", label: "Corners" },
  "appearance.windows.transparency":                     { area: "windows", section: "WINDOWS", label: "Opacity" },
  "appearance.windows.gaps-on":                          { area: "windows", section: "WINDOWS" },
  "appearance.windows.one-window-ratio-on":              { area: "windows", section: "WINDOWS" },
  "appearance.animations-on":                            { area: "windows", section: "WINDOWS" },
  "appearance.workspace-layout":                         { area: "windows", section: "LAYOUT", label: "Default layout" },
  "appearance.font":                                     { area: "cards", section: "FONT" },
  "appearance.dock.position":                            { area: "dock", section: "DOCK", label: "Position" },
  "appearance.dock.autohide":                            { area: "dock", section: "DOCK" },
  "trigger.toggle.notifications-on":                     { area: "island", section: "DO NOT DISTURB" },
  "trigger.toggle.idle-lock-on":                         { area: "power", section: "SLEEP" },
  "trigger.toggle.screensaver-on":                       { area: "power", section: "SLEEP" },
  "power-profile":                                       { area: "power", section: "POWER" },
  "trigger.toggle.nightlight-on":                        { area: "screens", section: "DISPLAYS" },
  "trigger.hardware.laptop-display-on":                  { area: "screens", section: "DISPLAYS" },
  "trigger.hardware.mirror-display-on":                  { area: "screens", section: "DISPLAYS" },
  "trigger.hardware.hybrid-gpu-on":                      { area: "system", section: "HARDWARE" },
  "trigger.hardware.touchpad-on":                        { area: "input", section: "DEVICES" },
  "trigger.hardware.touchscreen-on":                     { area: "input", section: "DEVICES" },
  "trigger.hardware.touchpad-haptics":                   { area: "input", section: "DEVICES", label: "Touchpad haptics" },
  "setup.default.browser":                               { area: "apps", section: "DEFAULT APPS" },
  "setup.default.terminal":                              { area: "apps", section: "DEFAULT APPS" },
  "setup.default.editor":                                { area: "apps", section: "DEFAULT APPS" },
  "setup.default.agent":                                 { area: "apps", section: "DEFAULT APPS" },
  "setup.default.dictation":                             { area: "apps", section: "DEFAULT APPS" },
  "trigger.toggle.crash-capture-on":                     { area: "system", section: "SYSTEM" },
  "setup.language":                                      { area: "system", section: "SYSTEM" },
  "setup.network.dns":                                   { area: "system", section: "SYSTEM" },
  "update.channel":                                      { area: "system", section: "SYSTEM", label: "Update channel" }
}
var OTHER = { area: "system", section: "MORE FROM OMARCHY" }

// Toggle rows: the row label and each state's name, in the order shown.
// Unlisted pairs take the words both entries share as the label and the rest
// as the states ("Window Gaps On" / "Window Gaps Off" → Window Gaps: On · Off).
function onOff(label, on, off) { var v = {}; v[on] = "On"; v[off] = "Off"; return { label: label, order: [on, off], values: v } }
var TOGGLES = {
  "appearance.top-bar.hide": { label: "Bar", order: ["appearance.top-bar.show", "appearance.top-bar.hide"],
                               values: { "appearance.top-bar.show": "Shown", "appearance.top-bar.hide": "Hidden" } },
  "appearance.top-bar.indicators.battery-percentage-on": { label: "Battery percentage",
    order: ["appearance.top-bar.indicators.battery-percentage-on", "appearance.top-bar.indicators.battery-percentage-off"],
    values: { "appearance.top-bar.indicators.battery-percentage-on": "Shown", "appearance.top-bar.indicators.battery-percentage-off": "Hidden" } },
  "appearance.windows.gaps-on": onOff("Gaps", "appearance.windows.gaps-on", "appearance.windows.gaps-off"),
  "appearance.windows.one-window-ratio-on": onOff("One-window ratio", "appearance.windows.one-window-ratio-on", "appearance.windows.one-window-ratio-off"),
  "appearance.animations-on": onOff("Animations", "appearance.animations-on", "appearance.animations-off"),
  "appearance.dock.autohide": { label: "Dock", order: ["appearance.dock.autohide", "appearance.dock.always-on"],
                                values: { "appearance.dock.autohide": "Auto-hide", "appearance.dock.always-on": "Always on" } },
  "trigger.toggle.idle-lock-on": onOff("Stay awake", "trigger.toggle.idle-lock-on", "trigger.toggle.idle-lock-off"),
  // "Silence Notifications" turns do not disturb on
  "trigger.toggle.notifications-on": onOff("Do not disturb", "trigger.toggle.notifications-off", "trigger.toggle.notifications-on"),
  "trigger.toggle.nightlight-on": onOff("Nightlight", "trigger.toggle.nightlight-on", "trigger.toggle.nightlight-off"),
  "trigger.toggle.screensaver-on": onOff("Screensaver", "trigger.toggle.screensaver-on", "trigger.toggle.screensaver-off"),
  "trigger.toggle.crash-capture-on": onOff("Crash capture", "trigger.toggle.crash-capture-on", "trigger.toggle.crash-capture-off"),
  "trigger.hardware.laptop-display-on": onOff("Laptop display", "trigger.hardware.laptop-display-on", "trigger.hardware.laptop-display-off"),
  "trigger.hardware.mirror-display-on": onOff("Display mirroring", "trigger.hardware.mirror-display-on", "trigger.hardware.mirror-display-off"),
  "trigger.hardware.hybrid-gpu-on": { label: "GPU mode", order: ["trigger.hardware.hybrid-gpu-on", "trigger.hardware.hybrid-gpu-off"],
                                      values: { "trigger.hardware.hybrid-gpu-on": "Hybrid", "trigger.hardware.hybrid-gpu-off": "Integrated" } },
  "trigger.hardware.touchpad-on": onOff("Touchpad", "trigger.hardware.touchpad-on", "trigger.hardware.touchpad-off"),
  "trigger.hardware.touchscreen-on": onOff("Touchscreen", "trigger.hardware.touchscreen-on", "trigger.hardware.touchscreen-off")
}

// Lists the native menu fills from bash (shell/plugins/menu/Menu.qml
// providers), read by readerScript: the current value and the choices.
// `menu` is the menu entry that offers the list, if there is one.
var LISTS = [
  { key: "appearance.font", menu: "appearance.font", label: "Font",
    current: "omarchy-font-current", list: "omarchy-font-list", set: "omarchy-font-set" },
  { key: "power-profile", label: "Power profile",
    current: "powerprofilesctl get", list: "omarchy-powerprofiles-list", set: "omarchy-powerprofiles-set autodetect",
    names: { "power-saver": "Power saver", "balanced": "Balanced", "performance": "Performance" } },
  // `omarchy-language list` prints name<TAB>code<TAB>English name
  { key: "setup.language", menu: "setup.language", label: "Language",
    current: "omarchy-language", list: "omarchy-language list", set: "omarchy-language", fields: true }
]

function shellQuote(s) { return "'" + String(s).replace(/'/g, "'\\''") + "'" }

// ---------------------------------------------------------------- menu reading
function children(items, order, parent) {
  var out = []
  for (var i = 0; i < order.length; i++) {
    var e = items[order[i]]
    if (e && e.parent === parent && e.kind !== "app") out.push(e)
  }
  return out
}
// "Appearance › Windows": the labels above an entry, without the root.
function pathOf(items, id) {
  var names = [], e = items[id], guard = 0
  e = e ? items[e.parent] : null
  while (e && e.id !== "root" && guard++ < 32) { names.unshift(String(e.label || e.id)); e = items[e.parent] }
  return names.join(" › ")
}
function firstWord(action) {
  var m = /^\s*([A-Za-z0-9_.+\/-]+)(\s|$)/.exec(String(action || ""))
  return m ? m[1] : ""
}
// One command with plain arguments: quoted strings are fine, anything the
// shell would run on its own (; & | ` $( redirections) is not.
function simpleAction(action) {
  var a = String(action || "").trim()
  if (!firstWord(a)) return false
  var bare = a.replace(/\$'(?:[^'\\]|\\.)*'/g, "").replace(/'[^']*'/g, "").replace(/"(?:[^"\\$`]|\\.)*"/g, "")
  return !/[;&|`$<>(){}]/.test(bare)
}
// Can the Control Center run this action itself? `asking` holds the first
// words whose scripts use sudo or pkexec (askingScript).
function runnable(action, asking) { return why(action, asking) === "" }
// Why the Control Center will not run an action itself: "window" (a terminal,
// a window or a shell construct), "password" (sudo, pkexec) or "restart" (it
// restarts the shell this window runs in, as omarchy-font-set does); "" when
// it can.
function why(action, asking) {
  if (!simpleAction(action)) return "window"
  var w = firstWord(action)
  if (/^omarchy-launch-/.test(w)) return "window"
  var reason = asking ? asking[w] : undefined
  return reason === "restart" || reason === "password" ? reason : reason ? "password" : ""
}
var WHY = {
  window: "Changing it opens a terminal or a window",
  password: "Changing it may ask for your password",
  restart: "Changing it restarts the shell this window runs in"
}
function shown(m, e) { return !e.when || (m.when && m.when[e.id] === true) }

// Two guards that are each other's negation: the same text up to one more
// negation on one side ("! x" / "x", "!= on" / "== on"), or the same test of
// one value against two complementary literals ("== \"off\"" / "== \"on\"").
// Other literal pairs (light / dark …) are not taken: nothing says only those
// two exist.
var COMPLEMENT = { on: "off", off: "on", "true": "false", "false": "true", yes: "no", no: "yes",
                   enabled: "disabled", disabled: "enabled", "1": "0", "0": "1" }
function negations(s) { return (String(s || "").match(/!=|(^|[\s(&|])!\s+/g) || []).length }
function withoutNegation(s) {
  return String(s || "").replace(/!=/g, "==").replace(/(^|[\s(&|])!\s+/g, "$1").replace(/\s+/g, " ").trim()
}
function literalsOf(s) {
  var lits = []
  var text = String(s || "").replace(/(==|!=)\s*("[^"]*"|'[^']*'|[^\s\]]+)/g, function(all, op, lit) {
    lits.push(lit.replace(/^["']|["']$/g, "")); return op + " _"
  })
  return { text: text.replace(/\s+/g, " ").trim(), lits: lits }
}
function negatedGuards(a, b) {
  if (!a || !b || a === b) return false
  if (withoutNegation(a) === withoutNegation(b)) return Math.abs(negations(a) - negations(b)) === 1
  var la = literalsOf(a), lb = literalsOf(b), swaps = 0
  if (la.text !== lb.text || la.lits.length !== lb.lits.length) return false
  for (var i = 0; i < la.lits.length; i++) {
    if (la.lits[i] === lb.lits[i]) continue
    if (COMPLEMENT[la.lits[i]] !== lb.lits[i]) return false
    swaps++
  }
  return swaps === 1
}
function togglePair(a, b) {
  if (!a || !b || a.parent !== b.parent) return false
  if (!a.action || !b.action || a.checked || b.checked || a.provider || b.provider) return false
  if (a.kind === "menu" || b.kind === "menu" || a.kind === "link" || b.kind === "link") return false
  return negatedGuards(a.when, b.when)
}

// Words every label shares at the start or the end ("Theme Corners", "Sharp
// Corners" → "Theme", "Sharp"), when that leaves each one a word.
function shortLabels(labels) {
  var out = labels.map(function(l) { return String(l).split(/\s+/).filter(function(w) { return w }) })
  if (out.length < 2) return labels.slice()
  function longer() { return out.every(function(w) { return w.length > 1 }) }
  while (longer() && out.every(function(w) { return w[w.length - 1] === out[0][out[0].length - 1] })) out.forEach(function(w) { w.pop() })
  while (longer() && out.every(function(w) { return w[0] === out[0][0] })) out.forEach(function(w) { w.shift() })
  return out.map(function(w) { return w.join(" ") })
}
// A toggle the table does not know: the words both labels share name the
// row, the rest the states.
function guessToggle(a, b) {
  var wa = String(a.label || "").split(/\s+/), wb = String(b.label || "").split(/\s+/)
  var common = wa.filter(function(w) { return wb.indexOf(w) !== -1 })
  var rest = function(ws) { var r = ws.filter(function(w) { return common.indexOf(w) === -1 }).join(" "); return r || ws.join(" ") }
  var v = {}; v[a.id] = rest(wa); v[b.id] = rest(wb)
  return { label: common.join(" ") || String(a.label), order: [a.id, b.id], values: v }
}

function place(key, menuLabel) {
  var p = PLACE[key] || OTHER
  return { area: p.area, section: p.section, label: p.label || menuLabel }
}

// ---------------------------------------------------------------- the rows
// m: { items, itemOrder, evaluated, when, checked, asking, readers } where
// readers is the reader batch's answer ({ key: { current, items: [{ value,
// label }] } }, null before it answered). Returns { specs, values } or null
// while the guards have not answered.
function derive(m) {
  if (!m || !m.items || !m.itemOrder || !m.evaluated) return null
  var items = m.items, order = m.itemOrder, asking = m.asking || {}
  var specs = [], values = {}, used = {}, readers = m.readers || null

  function add(spec, live) {
    spec.id = "omarchy." + spec.key
    spec.domain = "omarchy"
    spec.source = "omarchy"
    var pick = spec.values.filter(function(v) { return v.pick })
    var known = spec.values.some(function(v) { return v.id === live })
    spec.readOnly = !pick.length || !known || !spec.values.filter(function(v) { return v.id === live })[0].pick
    if (!known) spec.note = "Omarchy reports none of these as active: the value is set elsewhere (your own config?)"
    else if (spec.readOnly) {
      var reasons = spec.values.map(function(v) { return why(v.action, asking) }).filter(function(r) { return r })
      var reason = reasons.indexOf("restart") >= 0 ? "restart" : reasons.indexOf("password") >= 0 ? "password" : "window"
      spec.note = WHY[reason] + ": use Omarchy's menu" + (spec.path ? " (" + spec.path + ")" : "")
    }
    // a read-only row shows only what is live
    if (spec.readOnly && known) spec.values = spec.values.filter(function(v) { return v.id === live })
    specs.push(spec)
    values[spec.key] = known ? live : "unknown"
  }

  // choices: a menu of checked entries
  var menus = {}
  for (var i = 0; i < order.length; i++) {
    var e = items[order[i]]
    if (e && e.checked && e.parent && !menus[e.parent]) menus[e.parent] = true
  }
  Object.keys(menus).forEach(function(parent) {
    var p = items[parent]
    if (!p) return
    var kids = children(items, order, parent).filter(function(k) { return k.checked && k.action })
    if (kids.length < 2) return
    var visible = kids.filter(function(k) { return shown(m, k) })
    if (!visible.length) return                     // the hardware or package is not there
    var short = shortLabels(visible.map(function(k) { return k.label }))
    var live = ""
    var on = visible.filter(function(k) { return m.checked && m.checked[k.id] === true })
    if (on.length === 1) live = on[0].id
    var pl = place(parent, String(p.label || parent))
    add({ key: parent, kind: "choice", area: pl.area, section: pl.section, label: pl.label,
          path: pathOf(items, visible[0].id), hint: firstWord(visible[0].action),
          terms: [pathOf(items, visible[0].id), firstWord(visible[0].action), String(p.label || "")],
          values: visible.map(function(k, n) { return { id: k.id, label: short[n], action: k.action, pick: runnable(k.action, asking) } }) }, live)
    kids.forEach(function(k) { used[k.id] = true })
  })

  // toggles: neighbouring entries with opposite guards
  for (var j = 0; j + 1 < order.length; j++) {
    var a = items[order[j]], b = items[order[j + 1]]
    if (!a || !b || used[a.id] || used[b.id] || !togglePair(a, b)) continue
    used[a.id] = used[b.id] = true
    j++
    var va = shown(m, a), vb = shown(m, b)
    if (!va && !vb) continue                        // neither offered: not on this machine
    var t = TOGGLES[a.id] || guessToggle(a, b)
    var byId = {}; byId[a.id] = a; byId[b.id] = b
    var tl = place(a.id, t.label)
    add({ key: a.id, kind: "toggle", area: tl.area, section: tl.section, label: tl.label,
          path: pathOf(items, a.id), hint: firstWord(a.action),
          terms: [pathOf(items, a.id), firstWord(a.action), String(a.label), String(b.label)],
          values: t.order.map(function(id) { return { id: id, label: t.values[id], action: byId[id].action, pick: runnable(byId[id].action, asking) } }) },
        va !== vb ? (va ? b.id : a.id) : "")
  }

  // readers: a menu of `<reader> <value>` entries whose reader prints the value
  readerGroups(items, order, m.guardReaders).forEach(function(g) {
    var p = items[g.key], r = readers && readers[g.key]
    var visible = children(items, order, g.key).filter(function(k) { return shown(m, k) })
    if (!r || !visible.length) return               // not answered yet, or not offered here
    var live = ""
    visible.forEach(function(k) { if (argOf(k.action) === r.current) live = k.id })
    var pl = place(g.key, String(p.label || g.key))
    var short = shortLabels(visible.map(function(k) { return k.label }))
    add({ key: g.key, kind: "choice", area: pl.area, section: pl.section, label: pl.label,
          path: pathOf(items, visible[0].id), hint: g.reader, reader: g.reader,
          terms: [pathOf(items, visible[0].id), g.reader, String(p.label || "")],
          values: visible.map(function(k, n) { return { id: k.id, label: short[n], action: k.action, pick: runnable(k.action, asking) } }) }, live)
  })

  // lists the native menu fills from bash
  LISTS.forEach(function(l) {
    var r = readers && readers[l.key]
    if (!r || !r.items || !r.items.length) return
    var menuEntry = l.menu ? items[l.menu] : null
    if (l.menu && !menuEntry) return                // Omarchy no longer offers it
    var pl = place(l.key, l.label)
    var where = menuEntry ? pathOf(items, l.menu) : ""
    add({ key: l.key, kind: "choice", area: pl.area, section: pl.section, label: pl.label,
          path: menuEntry ? (where ? where + " › " : "") + String(menuEntry.label) : "",
          hint: firstWord(l.set), reader: l.current,
          terms: [l.set, l.current, String(menuEntry ? menuEntry.label : "")],
          values: r.items.map(function(it) {
            return { id: it.value, label: (l.names && l.names[it.value]) || it.label || it.value,
                     action: l.set + " " + shellQuote(it.value), pick: runnable(l.set + " x", asking) }
          }) }, r.current)
  })

  return { specs: specs, values: values }
}

// The Control Center's reader batch: one bash run printing
// `key<TAB>current<TAB>value` and `key<TAB>item<TAB>value<TAB>label` lines for
// the reader menus and LISTS. `groups` is [{ key, reader }] from the reader
// menus found in the menu (readerGroups).
function readerScript(groups) {
  var current = function(key, cmd) { return "printf '%s\\tcurrent\\t%s\\n' " + shellQuote(key) + " \"$(" + cmd + " 2>/dev/null | head -n1)\"" }
  var lines = ["set +e"]
  ;(groups || []).forEach(function(g) { lines.push(current(g.key, g.reader)) })
  LISTS.forEach(function(l) {
    var k = shellQuote(l.key)
    lines.push(current(l.key, l.current))
    if (l.fields) lines.push(l.list + " 2>/dev/null | while IFS=$'\\t' read -r name code english; do [[ -n $code ]] && printf '%s\\titem\\t%s\\t%s\\n' " + k + " \"$code\" \"$name\"; done")
    else lines.push(l.list + " 2>/dev/null | while IFS= read -r v; do [[ -n $v ]] && printf '%s\\titem\\t%s\\t%s\\n' " + k + " \"$v\" \"$v\"; done")
  })
  lines.push("exit 0")
  return lines.join("\n")
}
function parseReaders(text) {
  var out = {}
  String(text || "").split("\n").forEach(function(line) {
    var f = line.split("\t")
    if (f.length < 3 || !f[0]) return
    var r = out[f[0]] || (out[f[0]] = { current: "", items: [] })
    if (f[1] === "current") r.current = f[2]
    else if (f[1] === "item" && f[2]) r.items.push({ value: f[2], label: f[3] || f[2] })
  })
  return out
}
// `omarchy-bar position top` → "omarchy-bar position" · "top"
function readerOf(action) { var m = /^(.*\S)\s+([A-Za-z0-9_-]+)$/.exec(String(action || "")); return m ? m[1] : "" }
function argOf(action) { var m = /^(.*\S)\s+([A-Za-z0-9_-]+)$/.exec(String(action || "")); return m ? m[2] : "" }
// The reader menus in the menu: [{ key, reader }], in menu order, for
// derive and readerScript. guardReaders: MenuModel's GUARD_READERS, the
// commands Omarchy itself reads values from.
function readerGroups(items, order, guardReaders) {
  var out = [], seen = {}
  ;(order || []).forEach(function(id) {
    var parent = items[id] ? items[id].parent : ""
    var p = items[parent]
    if (!p || p.kind !== "menu" || seen[parent]) return
    seen[parent] = true
    var kids = children(items, order, parent)
    if (kids.length < 2 || kids.some(function(k) { return k.checked || !k.action })) return
    var reader = readerOf(kids[0].action)
    if (!reader || (guardReaders || []).indexOf(reader) === -1) return
    if (kids.every(function(k) { return readerOf(k.action) === reader && simpleAction(k.action) })) out.push({ key: parent, reader: reader })
  })
  return out
}

// The words the Control Center must not run itself, from the first words of
// all actions: scripts that restart the shell (omarchy-restart-shell: the
// window and its Cancel would go with it) or use sudo or pkexec (a password
// prompt, or a privileged change better made through Omarchy's own menu).
// Prints `restart <word>` / `password <word>` lines (parseAsking); binaries
// are skipped unread (OmarchyMenuSource.askScript does the same for the
// drop-down).
function askingScript() {
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
    "grep -lE -- '\\<omarchy-restart-shell\\>' \"${!words_of[@]}\" 2>/dev/null | while IFS= read -r f; do",
    "  for w in ${words_of[$f]}; do printf 'restart %s\\n' \"$w\"; done",
    "done",
    "grep -lE -- '\\<(sudo|pkexec)\\>' \"${!words_of[@]}\" 2>/dev/null | while IFS= read -r f; do",
    "  for w in ${words_of[$f]}; do printf 'password %s\\n' \"$w\"; done",
    "done",
    "exit 0"
  ].join("\n")
}
// askingScript's lines → { word: "restart" | "password" } (restart wins).
function parseAsking(text) {
  var out = {}
  String(text || "").split("\n").forEach(function(line) {
    var m = /^(restart|password) (\S+)$/.exec(line.trim())
    if (m && out[m[2]] !== "restart") out[m[2]] = m[1]
  })
  return out
}
function actionWords(items, order) {
  var seen = {}, out = []
  for (var i = 0; i < (order || []).length; i++) {
    var e = items[order[i]]
    var w = e && e.action ? firstWord(e.action) : ""
    if (w && !seen[w]) { seen[w] = true; out.push(w) }
  }
  LISTS.forEach(function(l) { var w = firstWord(l.set); if (!seen[w]) { seen[w] = true; out.push(w) } })
  return out
}
