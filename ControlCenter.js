.pragma library
.import "Presets.js" as Presets
.import "Watchdog.js" as Watchdog

// Control Center model: the settings registry, staging for Save · Use ·
// Cancel, the apply/revert plans, search and health checks. Pure functions;
// ControlCenter.qml runs the plans (bar options through the engine's apply,
// island settings through its IPC, the card picker through its script).
//
// State shape (live, snapshot, pending):
//   { bar: <normalized Tusche Bar options>,
//     screens: { <output name>: "compact" | "detailed" },
//     island: { notifications, noteStyle } | null (not configured),
//     cards: { override: "enabled" | "disabled" } | null (not known) }
// Values are strings, as the island IPC takes them. Staged edits are an
// overlay { "<domain>.<key>": value } on top of the live state, so a setting
// nobody touched follows the live value.

var ISLAND_ID = "nerdibeard.tusche-island"
var CARDS_ID = "nerdibeard.card-picker"

var AREAS = [
  { id: "quick", label: "Quick", note: "Most-used switches" },
  { id: "bar", label: "Tusche Bar", note: "Presets, combinations, every bar option" },
  { id: "screens", label: "Screens", note: "Presentation profiles, not display settings" },
  { id: "motion", label: "Motion", note: "Try the current material without changing it" },
  { id: "island", label: "Tusche Island", note: "Notifications in the bar" },
  { id: "cards", label: "Card picker", note: "Theme and wallpaper menus" },
  { id: "health", label: "Health", note: "Checks from live state" }
]

var ISLAND_SETTINGS = [
  { key: "notifications", label: "Notifications", fallback: "false",
    values: [{ id: "true", label: "Island, in the bar" }, { id: "false", label: "Omarchy popups" }] },
  { key: "noteStyle", label: "Note style (themes without material)", fallback: "window",
    values: [{ id: "window", label: "Window" }, { id: "bubble", label: "Bubble" }] }
]

var CARDS_SETTING = { key: "override", label: "Theme & wallpaper menus",
  values: [{ id: "enabled", label: "Card picker" }, { id: "disabled", label: "Omarchy pickers" }] }

// Quick area: the most-used switches, in this order.
var QUICK = ["bar.edge", "bar.logo", "bar.keys", "island.notifications", "island.noteStyle"]

function copy(v) { return JSON.parse(JSON.stringify(v)) }

function areaLabel(id) {
  for (var i = 0; i < AREAS.length; i++) if (AREAS[i].id === id) return AREAS[i].label
  return ""
}
function areaNote(id) {
  for (var i = 0; i < AREAS.length; i++) if (AREAS[i].id === id) return AREAS[i].note
  return ""
}
function isArea(id) { return areaLabel(String(id)) !== "" }

// Every editable setting. Bar rows come from Presets.ELEMENTS, so new
// options appear here (and in search) without touching the Control Center.
function settings() {
  var out = []
  for (var key in Presets.ELEMENTS) {
    var e = Presets.ELEMENTS[key]
    out.push({ id: "bar." + key, domain: "bar", key: key, area: "bar", label: e.label, values: e.variants, hint: "" })
  }
  ISLAND_SETTINGS.forEach(function(s) {
    out.push({ id: "island." + s.key, domain: "island", key: s.key, area: "island", label: s.label,
               values: s.values, hint: s.hint || "" })
  })
  out.push({ id: "cards.override", domain: "cards", key: "override", area: "cards", label: CARDS_SETTING.label,
             values: CARDS_SETTING.values, hint: "" })
  return out
}
function setting(id) {
  var all = settings()
  for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i]
  return null
}
function barIds() { return Object.keys(Presets.ELEMENTS).map(function(k) { return "bar." + k }) }
function valueLabel(spec, v) {
  if (!spec) return String(v === undefined ? "" : v)
  for (var i = 0; i < spec.values.length; i++) if (spec.values[i].id === v) return spec.values[i].label
  return String(v === undefined ? "" : v)
}

// ---------------------------------------------------------------- live state
// The island's settings sit in its bar.layout entry (that is where the
// island writes them); a plugins[] entry is the fallback.
function islandEntry(config) {
  var layout = config && config.bar && config.bar.layout ? config.bar.layout : {}
  var sections = Presets.layoutSections(layout)
  for (var s = 0; s < sections.length; s++) {
    var list = Array.isArray(layout[sections[s]]) ? layout[sections[s]] : []
    for (var i = 0; i < list.length; i++) if (list[i] && typeof list[i] === "object" && list[i].id === ISLAND_ID) return list[i]
  }
  var plugins = config && Array.isArray(config.plugins) ? config.plugins : []
  for (var j = 0; j < plugins.length; j++) if (plugins[j] && plugins[j].id === ISLAND_ID) return plugins[j]
  return null
}
function islandValues(entry) {
  if (!entry) return null
  return { notifications: entry.notifications === true ? "true" : "false",
           noteStyle: entry.noteStyle === "bubble" ? "bubble" : "window" }
}
function listed(config, id) {
  var plugins = config && Array.isArray(config.plugins) ? config.plugins : []
  return plugins.some(function(p) { return p === id || (p && p.id === id) })
}
function liveState(options, config, cardsStatus) {
  var entries = config && Array.isArray(config.plugins) ? config.plugins : []
  var owner = entries.filter(function(p) { return p && p.id === "nerdibeard.tusche-bar" })[0]
  return { bar: Presets.normalizeOptions(options || {}),
           screens: Presets.normalizeScreens(owner && owner.screenProfiles),
           island: islandValues(islandEntry(config)),
           cards: cardsStatus === "enabled" || cardsStatus === "disabled" ? { override: cardsStatus } : null }
}

function split(id) { var i = String(id).indexOf("."); return { domain: String(id).slice(0, i), key: String(id).slice(i + 1) } }
function value(state, id) {
  var p = split(id)
  if (p.domain === "screens") return state && state.screens && state.screens[p.key] || "inherit"
  return state && state[p.domain] ? state[p.domain][p.key] : undefined
}
function withValue(state, id, v) {
  var out = copy(state), p = split(id)
  if (out[p.domain]) out[p.domain][p.key] = v
  return out
}

// ---------------------------------------------------------------- staging
function pendingState(live, edits) {
  var out = copy(live)
  for (var id in edits) {
    var p = split(id)
    if (out[p.domain] && edits[id] !== undefined) out[p.domain][p.key] = edits[id]
  }
  return out
}
function stage(edits, live, id, v) {
  var p = split(id)
  var out = Object.assign({}, edits)
  if (!live || !live[p.domain]) return out
  if (p.domain === "screens" && (!Presets.screenNameValid(p.key) || ["inherit", "compact", "detailed"].indexOf(v) < 0)) return out
  if (value(live, id) === v) delete out[id]
  else out[id] = v
  return out
}
// Presets and saved combinations: stage every bar key at once.
function stageBar(edits, live, options) {
  var o = Presets.normalizeOptions(options)
  var out = edits
  for (var key in o) out = stage(out, live, "bar." + key, o[key])
  return out
}
// Drop edits that equal the live value (after Use, or after outside changes).
function prune(edits, live) {
  var out = {}
  for (var id in edits) {
    var p = split(id)
    if (live && live[p.domain] && value(live, id) !== edits[id]) out[id] = edits[id]
  }
  return out
}
// Staged changes that differ from live, in registry order.
function changes(edits, live) {
  var out = []
  settings().forEach(function(s) {
    if (!(s.id in edits) || !live || !live[s.domain]) return
    var from = live[s.domain][s.key], to = edits[s.id]
    if (from !== to) out.push({ id: s.id, domain: s.domain, key: s.key, area: s.area, from: from, to: to })
  })
  Object.keys(edits).filter(function(id) { return id.indexOf("screens.") === 0 }).sort().forEach(function(id) {
    var key = split(id).key, from = value(live, id), to = edits[id]
    if (Presets.screenNameValid(key) && ["inherit", "compact", "detailed"].indexOf(to) >= 0 && from !== to)
      out.push({ id: id, domain: "screens", key: key, area: "screens", from: from, to: to })
  })
  return out
}
function commitBar(pendingBar) {
  return Presets.normalizeOptions(pendingBar)
}
function sameOptions(a, b) {
  return JSON.stringify(Presets.normalizeOptions(a)) === JSON.stringify(Presets.normalizeOptions(b))
}

// Steps for Use / Save. Island first (the island writes shell.json from the
// shell's in-memory copy), then the card picker (its own menu file), the bar
// last as ONE apply (each bar write rebuilds the bar).
function plan(edits, live) {
  var ch = changes(edits, live)
  var steps = []
  ch.forEach(function(c) { if (c.domain === "island") steps.push({ domain: "island", key: c.key, value: c.to }) })
  ch.forEach(function(c) { if (c.domain === "cards") steps.push({ domain: "cards", key: c.key, value: c.to }) })
  var bar = {}
  ch.forEach(function(c) { if (c.domain === "bar") bar[c.key] = c.to })
  if (Object.keys(bar).length) {
    var step = { domain: "bar", keys: Object.keys(bar), changes: bar }
    if (!sameOptions(barOptions(step, live.bar), live.bar)) steps.push(step)
  }
  var screens = {}
  ch.forEach(function(c) { if (c.domain === "screens") screens[c.key] = c.to })
  if (Object.keys(screens).length) steps.push({ domain: "screens", keys: Object.keys(screens), changes: screens })
  return steps
}
function screenOptions(step, current) {
  var result = Presets.normalizeScreens(current)
  Object.keys(step.changes).forEach(function(name) {
    if (step.changes[name] === "inherit") delete result[name]
    else result[name] = step.changes[name]
  })
  return Presets.normalizeScreens(result)
}
function sameScreens(a, b) { return JSON.stringify(Presets.normalizeScreens(a)) === JSON.stringify(Presets.normalizeScreens(b)) }
// A bar step carries only its changed keys; the options are computed when
// it runs, on top of the live options then (an outside change in between is
// kept).
function barOptions(step, liveBar) {
  return commitBar(Object.assign({}, Presets.normalizeOptions(liveBar), step.changes))
}
// Steps for Cancel after Use: back to the snapshot, only in the domains Use
// touched.
function revertPlan(snapshot, live, applied) {
  var steps = []
  if (!snapshot || !live) return steps
  applied = applied || {}
  if (applied.island && snapshot.island && live.island)
    ISLAND_SETTINGS.forEach(function(s) {
      if (live.island[s.key] !== snapshot.island[s.key]) steps.push({ domain: "island", key: s.key, value: snapshot.island[s.key] })
    })
  if (applied.cards && snapshot.cards && live.cards && live.cards.override !== snapshot.cards.override)
    steps.push({ domain: "cards", key: "override", value: snapshot.cards.override })
  if (applied.bar) {
    var step = { domain: "bar", keys: Object.keys(snapshot.bar), changes: copy(snapshot.bar) }
    if (!sameOptions(barOptions(step, live.bar), live.bar)) steps.push(step)
  }
  if (applied.screens) {
    var restore = {}, before = Presets.normalizeScreens(snapshot.screens), current = Presets.normalizeScreens(live.screens)
    Object.keys(applied.screens).forEach(function(name) {
      if (before[name] !== current[name]) restore[name] = before[name] || "inherit"
    })
    if (Object.keys(restore).length) steps.push({ domain: "screens", keys: Object.keys(restore), changes: restore })
  }
  return steps
}

// Does the island's own state (omarchy-shell tusche-island state →
// notifications) show this value?
function islandReports(notes, key, v) {
  if (!notes) return false
  if (key === "notifications") return notes.wants === (v === "true")
  // (an island from before the rename reports its window style as "workbench")
  if (key === "noteStyle") return (notes.style === "workbench" ? "window" : notes.style) === v
  return false
}

// ---------------------------------------------------------------- search
// Index entries: { id, area, label, values: [labels], current }.
function searchIndex(live, edits, extra) {
  var pending = pendingState(live, edits || {})
  var out = []
  settings().forEach(function(s) {
    if (!live || !live[s.domain]) return
    out.push({ id: s.id, area: s.area, label: s.label,
               values: s.values.map(function(v) { return v.label }),
               current: valueLabel(s, pending[s.domain][s.key]) })
  })
  return out.concat(extra || [])
}
function wordScore(text, token, prefix, inner) {
  if (text.indexOf(token) === 0 || text.indexOf(" " + token) !== -1 || text.indexOf("(" + token) !== -1) return prefix
  return text.indexOf(token) !== -1 ? inner : 0
}
// Every token must match the label, a value, the area name or the id.
function search(index, query, limit) {
  var tokens = String(query || "").toLowerCase().split(/\s+/).filter(function(t) { return t !== "" })
  if (!tokens.length) return []
  var hits = []
  ;(index || []).forEach(function(e, order) {
    var label = String(e.label || "").toLowerCase()
    var area = areaLabel(e.area).toLowerCase()
    var values = (e.values || []).map(function(v) { return String(v).toLowerCase() })
    var total = 0, matched = ""
    for (var t = 0; t < tokens.length; t++) {
      var tok = tokens[t]
      var ls = wordScore(label, tok, 6, 4)
      var vs = 0, vl = ""
      for (var i = 0; i < values.length; i++) {
        var q = wordScore(values[i], tok, 3, 2)
        if (q > vs) { vs = q; vl = e.values[i] }
      }
      var s = Math.max(ls, vs)
      if (vs > ls && !matched) matched = vl
      if (!s && area.indexOf(tok) !== -1) s = 1
      if (!s && String(e.id).toLowerCase().indexOf(tok) !== -1) s = 1
      if (!s) return
      total += s
    }
    hits.push({ id: e.id, area: e.area, areaLabel: areaLabel(e.area), label: e.label,
                value: matched || String(e.current || ""), matchedValue: matched !== "", score: total, order: order })
  })
  hits.sort(function(a, b) { return b.score - a.score || a.order - b.order })
  return hits.slice(0, limit || 8)
}

// ---------------------------------------------------------------- health
// Facts come from live state only (engine properties, shell.json, the
// island's IPC state, the takeover marker, usage record ages, the card
// picker's script). state: ok | issue | unknown.
function healthChecks(f) {
  f = f || {}
  var out = []
  function add(id, label, state, detail) { out.push({ id: id, label: label, state: state, detail: detail }) }

  add("base", "Bar base layout", f.hasBase ? "ok" : "issue",
      f.hasBase ? "Your own layout is saved (base.json); Today restores it"
                : "No saved base layout: choose Today, then run omarchy-shell tusche-bar recaptureBase")

  var mins = Math.max(1, Math.round(Number(f.usageIntervalSec || 900) / 60))
  if (!f.usageFolded) add("usage", "AI usage refresh", "ok", "The AI widgets are in the bar and refresh themselves")
  else if (f.usageAgeSec === null || f.usageAgeSec === undefined) add("usage", "AI usage refresh", "unknown", "Engine refreshes every " + mins + " min · reading record age …")
  else if (f.usageAgeSec < 0) add("usage", "AI usage refresh", "issue", "Widgets are folded, but there are no usage records yet")
  else {
    var age = Math.round(f.usageAgeSec / 60)
    var stale = f.usageAgeSec > 2 * Number(f.usageIntervalSec || 900) + 300
    add("usage", "AI usage refresh", stale ? "issue" : "ok",
        (stale ? "Newest record is " + age + " min old although the engine refreshes every " + mins + " min"
               : "Engine refreshes every " + mins + " min while folded · newest record " + age + " min old")
        + (f.usageRunning ? " · running now" : ""))
  }

  var n = f.islandState, label = "Notifications takeover"
  if (f.marker === null || f.marker === undefined) add("notes", label, "unknown", "Checking the takeover marker …")
  else if (!f.islandConfigured) {
    if (f.marker) add("notes", label, "issue", "Takeover marker left behind, but the island is not configured: Omarchy's notifications may stay off")
    else add("notes", label, "ok", "Island not configured; Omarchy shows notifications")
  }
  else if (n === null || n === undefined) add("notes", label, "unknown", "Asking the island …")
  else if (n === false) add("notes", label, "issue", "The island does not answer (omarchy-shell tusche-island state)")
  else if (f.islandWants) {
    if (!n.serving && !n.omarchyDisabled) add("notes", label, "issue", "Setting is on, but Omarchy's notification service is still running")
    else if (!n.serving) add("notes", label, "issue", "Setting is on, but the island is not serving notifications yet")
    else if (!f.marker && !n.omarchyDisabled) add("notes", label, "issue", "Setting is on, but there is no takeover marker")
    else add("notes", label, "ok", f.marker ? "The island serves notifications (takeover marker present)"
                                            : "The island serves notifications; Omarchy's were already off (no marker)")
  }
  else if (f.marker) add("notes", label, "issue", "Setting is off, but the takeover marker is still there: Omarchy's notifications may stay off")
  else add("notes", label, "ok", "Omarchy shows notifications (island setting off, no marker)")

  var c = f.cards
  if (c === "enabled") add("cards", "Card picker menus", "ok", "Style → Theme / Background open the card picker")
  else if (c === "disabled") add("cards", "Card picker menus", "ok", "Override off: Omarchy's own pickers")
  else if (c === "missing") add("cards", "Card picker menus", f.cardsConfigured ? "issue" : "ok",
                                f.cardsConfigured ? "The card picker is configured, but its menu-override script is missing" : "Card picker not installed")
  else if (c === "error") add("cards", "Card picker menus", "issue", "menu-override.py status failed")
  else add("cards", "Card picker menus", "unknown", "Checking …")

  // The island took Omarchy's notification service over; a watchdog hands it back
  // if the island then goes silent (Watchdog.js).
  if (f.watchdog) {
    var wd = Watchdog.describe(f.watchdog.state, f.watchdog.enabled === true, f.watchdog.now || 0)
    add("watchdog", "Notification safety net", wd.state, wd.detail)
  }

  var g = f.generation
  if (!g || !g.installed) add("generation", "Loaded code", "unknown", "Reading the installed generation …")
  else if (!g.loaded || g.loaded === g.installed) add("generation", "Loaded code", "ok", "The shell runs the installed generation (" + g.installed.slice(0, 8) + ")")
  else add("generation", "Loaded code", "issue", "The shell still runs generation " + g.loaded.slice(0, 8) + " but " + g.installed.slice(0, 8) +
           " is installed: plugin rescans keep cached QML; restart the shell after unlocking")

  var h = f.hypr
  if (h === "unused") add("hypr", "Workspace data", "ok", "Not in use: the bar keeps the native workspaces")
  else if (h === "native") add("hypr", "Workspace data", "ok", "Quickshell reports monitors and workspace ids itself")
  else if (h === "snapshot") add("hypr", "Workspace data", "ok", "Quickshell's monitor and workspace metadata is incomplete on this build (expected on Lua Hyprland): one bounded hyprctl batch supplies it")
  else if (h === "missing") add("hypr", "Workspace data", "issue", "Quickshell has no monitor or workspace ids and the hyprctl fallback has delivered nothing yet; workspace faces may show the wrong marker")
  else add("hypr", "Workspace data", "unknown", "Checking …")

  var fm = f.focus
  if (fm === null || fm === undefined) add("focus", "Focus mode and bar visibility", "unknown", "Reading the hide flag …")
  else if (fm.error) add("focus", "Focus mode and bar visibility", "issue", "The focus ownership record is unreadable; Show the bar archives it, omarchy-toggle-bar off shows the bar")
  else if (fm.hidden && fm.owned) add("focus", "Focus mode and bar visibility", "ok", "Focus mode is on: the native bar is parked, its services keep running · click the seal or Show the bar")
  else if (fm.hidden) add("focus", "Focus mode and bar visibility", "ok", "The bar is hidden, not by focus mode · omarchy-toggle-bar off shows it")
  else add("focus", "Focus mode and bar visibility", "ok", "The bar is visible")

  var mm = f.menuModel
  if (mm === "same") add("menumodel", "Menu model", "ok", "vendor/MenuModel.js is Omarchy's current copy")
  else if (mm === "different") add("menumodel", "Menu model", "issue", "vendor/MenuModel.js differs from Omarchy's: new menu entries may be missing; copy it again (vendor/README.md)")
  else if (mm === "missing") add("menumodel", "Menu model", "ok", "Omarchy's menu model was not found to compare with")
  else add("menumodel", "Menu model", "unknown", "Comparing with Omarchy's copy …")

  var a = f.anchor
  if (a && a.modern) add("anchor", "Centre layout", a.anchor ? "issue" : "ok", a.anchor
      ? "This layout uses Omarchy's centre box; remove the obsolete bar.centerAnchor setting"
      : "Omarchy centres the centre box (" + (a.centre.join(", ") || "empty") + "); centerBegin and centerEnd stay on its two sides")
  else if (!a || !a.anchor) add("anchor", "Centre layout", "ok", "Omarchy centres the middle group as a whole")
  else if ((a.centre || []).indexOf(a.anchor) >= 0) add("anchor", "Centre anchor", "ok", a.anchor + " anchors the centre")
  else add("anchor", "Centre anchor", "issue", "bar.centerAnchor names " + a.anchor + ", which is not in the centre section: Omarchy centres the whole group and the middle drifts with its widths" +
           (a.suggest ? " · set it to " + a.suggest : ""))

  var r = String(f.lastResult || "")
  if (r.indexOf("error") === 0) add("apply", "Last bar write", "issue", r)
  else add("apply", "Last bar write", "ok", r === "" ? "Nothing written since the shell started" : r === "ok" ? "Succeeded" : r)

  if (f.savedError) add("saved", "Saved combinations", "issue", f.savedError)
  else add("saved", "Saved combinations", "ok", (f.savedCount || 0) + " saved (presets.json)")
  return out
}
// Facts the health page needs from shell.json: the centre anchor and where it
// points. A renamed widget leaves a stale id behind (the Amiga Island became the
// Tusche Island), and Omarchy then silently centres the whole group instead.
var ISLAND_IDS = ["nerdibeard.tusche-island"]
function anchorFacts(config) {
  var bar = config && config.bar ? config.bar : {}
  var centre = bar.layout && Array.isArray(bar.layout.center) ? bar.layout.center : []
  var ids = centre.map(function(e) { return typeof e === "string" ? e : (e && e.id ? String(e.id) : "") }).filter(function(x) { return x })
  var anchor = typeof bar.centerAnchor === "string" ? bar.centerAnchor : ""
  var suggest = ""
  if (anchor && ids.indexOf(anchor) < 0) {
    if (/island$/.test(anchor)) for (var i = 0; i < ISLAND_IDS.length; i++) if (ids.indexOf(ISLAND_IDS[i]) >= 0) suggest = ISLAND_IDS[i]
  }
  return { anchor: anchor, centre: ids, suggest: suggest,
           modern: !!(bar.layout && (Array.isArray(bar.layout.centerBegin) || Array.isArray(bar.layout.centerEnd))) }
}
// installed-generation.json → the generation name, or "".
function generationOf(text) {
  try { var d = JSON.parse(String(text)); return d && typeof d.generation === "string" && /^[0-9a-f]{8,64}$/.test(d.generation) ? d.generation : "" } catch (e) { return "" }
}
// The loaded code's generation from the plugin's code directory (…/generations/<hash>).
function loadedGeneration(pluginDir) {
  var m = /\/generations\/([0-9a-f]{8,64})\/?$/.exec(String(pluginDir || ""))
  return m ? m[1] : ""
}
// The plugin's installed root: the code directory without …/generations/<hash>.
function pluginRoot(pluginDir) { return String(pluginDir || "").replace(/\/generations\/[0-9a-f]{8,64}\/?$/, "") }
// focus-mode.py status → { hidden, owned } or { error: true }.
function focusFacts(exitCode, text) {
  if (exitCode !== 0) return { error: true }
  try {
    var d = JSON.parse(String(text))
    return d && typeof d.hidden === "boolean" ? { hidden: d.hidden, owned: d.owned === true, error: false } : { error: true }
  } catch (e) { return { error: true } }
}
function menuModelFacts(exitCode) { return exitCode === 0 ? "same" : exitCode === 1 ? "different" : "missing" }

function healthSummary(checks) {
  var issues = 0, unknown = 0
  ;(checks || []).forEach(function(c) { if (c.state === "issue") issues++; else if (c.state === "unknown") unknown++ })
  return { issues: issues, unknown: unknown,
           label: issues ? (issues === 1 ? "1 issue" : issues + " issues") : unknown ? "…" : "OK" }
}
