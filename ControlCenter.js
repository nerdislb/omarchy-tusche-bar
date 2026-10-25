.pragma library
.import "Presets.js" as Presets
.import "Watchdog.js" as Watchdog

// Control Center model: the settings registry, staging for Save · Use ·
// Cancel, the apply/revert plans, search and health checks. Pure functions;
// ControlCenter.qml runs the plans (bar options through the engine's apply,
// island settings through its IPC, the card picker through its script,
// Omarchy's settings through their menu actions, Hyprland overrides through
// bin/hypr-overrides.py, Omarchy's idle times through bin/idle-times.py).
//
// State shape (live, snapshot, pending):
//   { bar: <normalized Tusche Bar options>,
//     screens: { <output name>: "compact" | "detailed" },
//     island: { notifications, noteStyle } | null (not configured),
//     cards: { override: "enabled" | "disabled" } | null (not known),
//     extras: { fullWidth: "edge" | "gaps" | "unknown" | "error",
//               sheet: "on" | "off" | "missing" | "unknown" } | null (not read),
//     omarchy: { <row key>: <value id> | "unknown" } | null (not read),
//     omarchySpecs: [<rows from OmarchySettings.derive>],
//     hypr: { <Hyprland option>: <override> | "" (none) } | null (not read),
//     hyprEffective: { <Hyprland option>: <value Hyprland runs with> },
//     idle: { screensaver, lock: <seconds Omarchy runs with> } | null (shell.json not read),
//     idleRaw: { <key>: <the value in shell.json, absent when unset> },
//     link: {} (links have no value), linkSpecs: [<link rows>] }
// Values are strings, as the island IPC takes them. Staged edits are an
// overlay { "<domain>.<key>": value } on top of the live state, so a setting
// nobody touched follows the live value.

var ISLAND_ID = "nerdibeard.tusche-island"
var CARDS_ID = "nerdibeard.card-picker"
var SHEET_ID = "nerdibeard.shortcut-sheet"

// The sidebar: areas in groups. Every row says where it comes from: Tusche
// (our plugins), Omarchy (runs Omarchy's own command), Override (a Hyprland
// value in the Control Center's own toggle file) or Link (opens a panel, a
// terminal flow or an editor; nothing to stage).
var GROUPS = [
  { id: "overview", label: "OVERVIEW" },
  { id: "appearance", label: "APPEARANCE" },
  { id: "bar", label: "BAR" },
  { id: "work", label: "WORK" },
  { id: "devices", label: "DEVICES" },
  { id: "system", label: "SYSTEM" }
]
var AREAS = [
  { id: "quick", group: "overview", label: "Quick", note: "Most-used switches" },
  { id: "health", group: "overview", label: "Health", note: "Checks from live state" },
  { id: "cards", group: "appearance", label: "Theme & font", note: "Theme and wallpaper menus, the system font" },
  { id: "windows", group: "appearance", label: "Windows", note: "Omarchy's window switches, full width and fine values" },
  { id: "motion", group: "appearance", label: "Material & motion", note: "Try the current material without changing it" },
  { id: "bar", group: "bar", label: "Tusche Bar", note: "Presets, combinations, every bar option, Omarchy's bar" },
  { id: "island", group: "bar", label: "Tusche Island", note: "Notifications in the bar, Omarchy's do not disturb" },
  { id: "dock", group: "bar", label: "Dock", note: "Omarchy's dock" },
  { id: "input", group: "work", label: "Input & keys", note: "Touchpad, keyboard, pointer, layouts and the shortcut sheet" },
  { id: "screens", group: "work", label: "Screens", note: "Bar presentation per screen, display switches, arrangement" },
  { id: "devices", group: "devices", label: "Sound & network", note: "Omarchy's panels for sound, Wi-Fi and Bluetooth, DNS" },
  { id: "power", group: "devices", label: "Power & sleep", note: "Power profile, staying awake, the screensaver, idle times" },
  { id: "apps", group: "system", label: "Default apps", note: "What Omarchy opens for browsing, terminals, editing, agents" },
  { id: "system", group: "system", label: "System", note: "Security, Git, time and Omarchy's other settings" }
]
// Older names still open their area (IPC: cc <area>).
var AREA_ALIASES = { extras: "windows", sound: "devices", network: "devices", bluetooth: "devices", wifi: "devices" }
// Generic rows (Omarchy, overrides, full width, idle times, links) per area,
// in this section order; sections not listed follow in the order they come.
var SECTIONS = {
  windows: ["WINDOWS", "FINE VALUES", "LAYOUT"],
  input: ["DEVICES", "KEYBOARD", "POINTER", "TOUCHPAD", "SETUP"],
  screens: ["DISPLAYS", "ARRANGEMENT"],
  devices: ["SOUND", "NETWORK", "BLUETOOTH"],
  power: ["POWER", "SLEEP", "IDLE TIMES"],
  system: ["SYSTEM", "SECURITY", "SETUP", "HARDWARE", "MORE FROM OMARCHY"]
}

// Panels a link opens (the window closes first). Omarchy's device panels are
// bar widgets: they open where they sit, in the bar or embedded in a Tusche
// status group (host.openWidget finds them); one that is neither has nothing
// to open from. `widgets`: candidates, the first one placed opens (your own
// display panel before Omarchy's). The display editor answers its own IPC
// from the panel that hosts it (`hosts`).
var DEVICE_LINKS = [
  { key: "sound", area: "devices", section: "SOUND", label: "Sound", widgets: ["omarchy.audio"],
    note: "Volume, the output and input device, the mixer per app" },
  { key: "network", area: "devices", section: "NETWORK", label: "Wi-Fi and network", widgets: ["omarchy.network"],
    note: "Networks, connect and forget, signal, speed test" },
  { key: "tailscale", area: "devices", section: "NETWORK", label: "Tailscale", widgets: ["omarchy.tailscale"],
    note: "The tailnet connection and its machines" },
  { key: "bluetooth", area: "devices", section: "BLUETOOTH", label: "Bluetooth", widgets: ["omarchy.bluetooth"],
    note: "Devices, connect and disconnect, batteries, the radio" },
  { key: "arrange", area: "screens", section: "ARRANGEMENT", label: "Arrange displays",
    command: "omarchy-shell display-layout open", requires: "nerdibeard.display-layout", hosts: ["nerdibeard.monitor", "nerdibeard.display-layout"],
    note: "Drag the displays into place, then Keep or let it revert" },
  { key: "brightness", area: "screens", section: "ARRANGEMENT", label: "Brightness", widgets: ["nerdibeard.monitor", "omarchy.monitor"],
    note: "Brightness and the laptop display" }
]
// Where this bar widget can open from: "bar" (an entry of the bar's layout;
// the shell summons it), "group" (embedded in a Tusche status group, which
// mounts it: tusche-status member) or "" (nowhere).
function widgetPlace(config, id) {
  var layout = config && config.bar && config.bar.layout ? config.bar.layout : {}
  var sections = Presets.layoutSections(layout), grouped = false
  for (var s = 0; s < sections.length; s++) {
    var list = Array.isArray(layout[sections[s]]) ? layout[sections[s]] : []
    for (var i = 0; i < list.length; i++) {
      var e = list[i]
      if (Presets.entryId(e) === id) return "bar"
      if (Presets.entryId(e) === "tusche.status" && e.embeds && typeof e.embeds === "object" && Object.prototype.hasOwnProperty.call(e.embeds, id)) grouped = true
    }
  }
  return grouped ? "group" : ""
}
function widgetPlaced(config, id) { return widgetPlace(config, id) !== "" }
// The device links this machine has: plugins: the installed plugin folders
// (null while not read; Omarchy's own widgets always count). A link whose
// panel is not placed stays, unavailable, with the reason.
function deviceLinks(config, plugins) {
  var has = function(id) { return String(id).indexOf("omarchy.") === 0 || (Array.isArray(plugins) && plugins.indexOf(id) !== -1) }
  var out = []
  if (!config || typeof config !== "object" || !Object.keys(config).length) return out   // shell.json not read yet
  DEVICE_LINKS.forEach(function(l) {
    if (l.requires && !has(l.requires)) return
    var hosts = (l.widgets || l.hosts || []).filter(has)
    if (!hosts.length) return
    var placed = hosts.filter(function(id) { return widgetPlaced(config, id) })[0] || ""
    var widget = l.widgets ? placed || hosts[0] : ""
    // the way the panel opens follows where it actually sits
    var route = widget && placed ? (widgetPlace(config, widget) === "group" ? "member" : "summon") : ""
    out.push({ id: "link." + l.key, domain: "link", kind: "link", source: "omarchy", key: l.key,
               area: l.area, section: l.section, label: l.label, note: l.note, opens: "panel",
               widget: widget, route: route, action: l.command || "", hint: widget || l.command || "",
               available: placed !== "", why: placed ? "" : "Not in the bar: add " + hosts[0] + " to the bar (or its Tusche group) to open it here",
               values: [], terms: hosts.concat([l.command || "", l.note]) })
  })
  return out
}

// Omarchy's idle times: shell.json idle.screensaver and idle.lock, seconds
// from the moment the computer goes idle, 0 turns that step off. Omarchy's
// idle service reads them live (shell/plugins/services/idle); without a
// value it uses its defaults. Written by bin/idle-times.py.
var IDLE_SETTINGS = [
  { key: "screensaver", label: "Screensaver after", fallback: 150 },
  { key: "lock", label: "Lock after", fallback: 300 }
]
var IDLE_CHOICES = [0, 60, 120, 150, 300, 600, 900, 1800, 3600]
function idleSetting(key) {
  for (var i = 0; i < IDLE_SETTINGS.length; i++) if (IDLE_SETTINGS[i].key === key) return IDLE_SETTINGS[i]
  return null
}
function idleLabel(seconds) {
  var n = Number(seconds)
  if (!isFinite(n) || n < 0) return String(seconds)
  if (n === 0) return "Off"
  if (n < 60) return n + " s"
  if (n % 3600 === 0) return (n / 3600) + " h"
  if (n > 3600) return Math.floor(n / 3600) + " h " + idleLabel(n % 3600)
  if (n % 60 === 0) return (n / 60) + " min"
  if (n % 30 === 0) return (n / 60) + " min"
  return Math.floor(n / 60) + " min " + (n % 60) + " s"
}
// What Omarchy's idle service makes of a shell.json value: exactly
// IdleModel.secondsFromConfig (a missing value is the default; null, false
// and "" are 0, off).
function idleSeconds(v, fallback) {
  var n = Number(v)
  if (!isFinite(n) || n < 0) return fallback
  return Math.floor(n)
}
// shell.json → { values: { key: "<seconds>" }, raw: { key: <stored value> } }
// or null before shell.json has been read.
function idleFacts(config) {
  if (!config || typeof config !== "object" || !Object.keys(config).length) return null
  var idle = config.idle && typeof config.idle === "object" && !Array.isArray(config.idle) ? config.idle : {}
  var values = {}, raw = {}
  IDLE_SETTINGS.forEach(function(s) {
    values[s.key] = String(idleSeconds(idle[s.key], s.fallback))
    if (Object.prototype.hasOwnProperty.call(idle, s.key)) raw[s.key] = idle[s.key]
  })
  return { values: values, raw: raw }
}
// Does shell.json (the host's copy) hold what an idle step wrote? Use:
// { key: <seconds> }; Cancel (restore): { key: { value: <JSON as it was> } |
// { absent: true } }.
function idleHolds(config, changes, restore) {
  var idle = config && config.idle && typeof config.idle === "object" && !Array.isArray(config.idle) ? config.idle : {}
  return Object.keys(changes || {}).every(function(key) {
    var want = changes[key], has = Object.prototype.hasOwnProperty.call(idle, key)
    if (restore && want && want.absent === true) return !has
    var v = restore ? (want ? want.value : undefined) : want
    return has && JSON.stringify(idle[key]) === JSON.stringify(v)
  })
}
function idleSpec(s, live) {
  var now = live && live.idle ? live.idle[s.key] : undefined
  var ids = IDLE_CHOICES.map(String)
  if (now !== undefined && ids.indexOf(now) === -1) {
    ids.push(now)
    ids.sort(function(a, b) { return Number(a) - Number(b) })
  }
  return { id: "idle." + s.key, domain: "idle", key: s.key, area: "power", section: "IDLE TIMES", label: s.label,
           hint: "default " + idleLabel(s.fallback), kind: "choice", source: "omarchy",
           values: ids.map(function(id) { return { id: id, label: idleLabel(id) } }),
           terms: ["idle", "shell.json", "idle." + s.key, s.key === "lock" ? "lock screen" : "screensaver"] }
}

// Extras: switches beyond the bar. fullWidth is a Hyprland toggle file
// (bin/full-width.py); sheet is the Shortcut Sheet plugin's enabled state in
// shell.json, offered only when that plugin is installed.
var EXTRAS_SETTINGS = [
  { key: "fullWidth", label: "Full width windows", hint: "Super+Alt+F", area: "windows", section: "WINDOWS",
    values: [{ id: "edge", label: "Edge to edge" }, { id: "gaps", label: "With gaps and border" }] },
  { key: "sheet", label: "Shortcut sheet", hint: "Plugin nerdibeard.shortcut-sheet", area: "input", section: "SHORTCUTS",
    values: [{ id: "on", label: "On" }, { id: "off", label: "Off" }] }
]

// Hyprland overrides: values the Control Center writes into its own Omarchy
// toggle file (bin/hypr-overrides.py → 00-tusche-settings.lua). It loads
// after your hypr config and the theme but before Omarchy's other toggles,
// so Omarchy's switches (Gaps Off, Sharp or Rounded corners, Animations Off)
// still win over a value here. "" is no override: Hyprland keeps what your
// config says. Values are strings; hyprPayload types them for the helper.
var HYPR_FILE = "00-tusche-settings.lua"
var HYPR_SETTINGS = [
  { option: "general:gaps_in", label: "Inner gap", type: "int", min: 0, max: 30, step: 1, unit: "px", area: "windows", section: "FINE VALUES" },
  { option: "general:gaps_out", label: "Outer gap", type: "int", min: 0, max: 40, step: 1, unit: "px", area: "windows", section: "FINE VALUES" },
  { option: "general:border_size", label: "Border width", type: "int", min: 0, max: 8, step: 1, unit: "px", area: "windows", section: "FINE VALUES" },
  { option: "decoration:rounding", label: "Corner radius", type: "int", min: 0, max: 24, step: 1, unit: "px", area: "windows", section: "FINE VALUES" },
  { option: "decoration:blur:enabled", label: "Blur", type: "bool", area: "windows", section: "FINE VALUES" },
  { option: "decoration:blur:size", label: "Blur size", type: "int", min: 1, max: 16, step: 1, area: "windows", section: "FINE VALUES", advanced: true },
  { option: "decoration:dim_inactive", label: "Dim inactive windows", type: "bool", area: "windows", section: "FINE VALUES" },
  { option: "decoration:dim_strength", label: "Dim strength", type: "float", min: 0.05, max: 0.9, step: 0.05, area: "windows", section: "FINE VALUES", advanced: true },
  { option: "input:repeat_rate", label: "Key repeat rate", type: "int", min: 10, max: 80, step: 5, unit: "/s", area: "input", section: "KEYBOARD" },
  { option: "input:repeat_delay", label: "Key repeat delay", type: "int", min: 150, max: 1000, step: 25, unit: "ms", area: "input", section: "KEYBOARD" },
  { option: "input:sensitivity", label: "Pointer speed", type: "float", min: -1, max: 1, step: 0.1, area: "input", section: "POINTER" },
  { option: "input:accel_profile", label: "Pointer acceleration", type: "choice", area: "input", section: "POINTER", advanced: true,
    choices: [{ id: "adaptive", label: "Adaptive" }, { id: "flat", label: "Flat" }] },
  { option: "cursor:hide_on_key_press", label: "Hide the cursor while typing", type: "bool", area: "input", section: "POINTER" },
  { option: "input:touchpad:natural_scroll", label: "Natural scrolling", type: "bool", area: "input", section: "TOUCHPAD" },
  { option: "input:touchpad:scroll_factor", label: "Scroll speed", type: "float", min: 0.1, max: 2, step: 0.1, area: "input", section: "TOUCHPAD" },
  { option: "input:touchpad:disable_while_typing", label: "Off while typing", type: "bool", area: "input", section: "TOUCHPAD", advanced: true }
]

var ISLAND_SETTINGS = [
  { key: "notifications", label: "Notifications", fallback: "false",
    values: [{ id: "true", label: "Island, in the bar" }, { id: "false", label: "Omarchy popups" }] },
  { key: "noteStyle", label: "Note style (themes without material)", fallback: "window",
    values: [{ id: "window", label: "Window" }, { id: "bubble", label: "Bubble" }, { id: "float", label: "Float" }] }
]

var CARDS_SETTING = { key: "override", label: "Theme & wallpaper menus",
  values: [{ id: "enabled", label: "Card picker" }, { id: "disabled", label: "Omarchy pickers" }] }

// Quick area: the most-used switches, in this order. Desktop ones show when
// they exist (Omarchy rows come from its menu).
var QUICK = ["bar.edge", "bar.logo", "bar.keys", "island.notifications", "island.noteStyle"]
var QUICK_DESKTOP = ["omarchy.trigger.toggle.nightlight-on", "omarchy.trigger.toggle.notifications-on",
                     "omarchy.trigger.toggle.idle-lock-on", "extras.fullWidth"]

function copy(v) { return JSON.parse(JSON.stringify(v)) }

function areaOf(id) {
  id = AREA_ALIASES[id] || id
  for (var i = 0; i < AREAS.length; i++) if (AREAS[i].id === id) return AREAS[i]
  return null
}
function areaLabel(id) { var a = areaOf(String(id)); return a ? a.label : "" }
function areaNote(id) { var a = areaOf(String(id)); return a ? a.note : "" }
function isArea(id) { return areaOf(String(id)) !== null }
function resolveArea(id) { var a = areaOf(String(id)); return a ? a.id : "" }
// The sidebar as rows: a head per group, then its areas.
function sidebar() {
  var out = []
  GROUPS.forEach(function(g) {
    out.push({ kind: "group", id: g.id, label: g.label })
    AREAS.forEach(function(a) { if (a.group === g.id) out.push({ kind: "area", id: a.id, label: a.label }) })
  })
  return out
}

// Where a row comes from, for its tag.
function sourceOf(spec) {
  if (!spec) return ""
  return spec.domain === "omarchy" || spec.domain === "idle" ? "Omarchy" : spec.domain === "hypr" ? "Override"
    : spec.domain === "link" ? "Link" : "Tusche"
}

function hyprSpec(s) {
  var values = s.type === "bool" ? [{ id: "", label: "Default" }, { id: "true", label: "On" }, { id: "false", label: "Off" }]
    : s.type === "choice" ? [{ id: "", label: "Default" }].concat(s.choices) : []
  return { id: "hypr." + s.option, domain: "hypr", key: s.option, area: s.area, section: s.section, label: s.label,
           hint: s.option, kind: s.type === "int" || s.type === "float" ? "number" : "choice", type: s.type,
           min: s.min, max: s.max, step: s.step, unit: s.unit || "", advanced: !!s.advanced, values: values,
           terms: [s.option, HYPR_FILE] }
}

// Every editable setting. Bar rows come from Presets.ELEMENTS and Omarchy's
// from its menu (live.omarchySpecs), so new options appear here (and in
// search) without touching the Control Center.
function settings(live) {
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
  EXTRAS_SETTINGS.forEach(function(s) {
    out.push({ id: "extras." + s.key, domain: "extras", key: s.key, area: s.area, section: s.section, label: s.label,
               values: s.values, hint: s.hint || "" })
  })
  HYPR_SETTINGS.forEach(function(s) { out.push(hyprSpec(s)) })
  IDLE_SETTINGS.forEach(function(s) { out.push(idleSpec(s, live)) })
  // a section opens with its panel, then Omarchy's rows, then menu links
  var links = live && Array.isArray(live.linkSpecs) ? live.linkSpecs : []
  out = out.concat(links.filter(function(l) { return !l.fromMenu }))
  if (live && Array.isArray(live.omarchySpecs)) out = out.concat(live.omarchySpecs)
  return out.concat(links.filter(function(l) { return l.fromMenu }))
}
function setting(id, live) {
  var all = settings(live)
  for (var i = 0; i < all.length; i++) if (all[i].id === id) return all[i]
  return null
}
function hyprSetting(option) {
  for (var i = 0; i < HYPR_SETTINGS.length; i++) if (HYPR_SETTINGS[i].option === option) return HYPR_SETTINGS[i]
  return null
}
function hyprOptions() { return HYPR_SETTINGS.map(function(s) { return s.option }) }
// A Hyprland value as the Control Center keeps it ("8", "0.4", "true",
// "flat"), or null when it is not a value of that setting. "" is no override.
function hyprValue(option, v) {
  var s = hyprSetting(option)
  if (!s) return null
  v = String(v === undefined || v === null ? "" : v).trim()
  if (v === "") return ""
  if (s.type === "bool") return v === "true" || v === "false" ? v : null
  if (s.type === "choice") return s.choices.some(function(c) { return c.id === v }) ? v : null
  var n = Number(v)
  if (!isFinite(n) || n < s.min - 1e-9 || n > s.max + 1e-9) return null
  if (s.type === "int") return Math.round(n) === n ? String(n) : null
  var places = String(s.step).indexOf(".") >= 0 ? String(s.step).split(".")[1].length : 0
  return String(Number(n.toFixed(places)))
}
// One step up or down from the value shown (the override, else what
// Hyprland runs with), inside the setting's range.
function hyprStep(option, shown, direction) {
  var s = hyprSetting(option)
  if (!s || (s.type !== "int" && s.type !== "float")) return null
  var n = Number(shown)
  if (!isFinite(n)) n = s.min
  var next = Math.min(s.max, Math.max(s.min, n + direction * s.step))
  return hyprValue(option, s.type === "int" ? Math.round(next) : next.toFixed(6))
}
// The helper takes typed JSON: numbers, booleans, strings, null to drop one.
function hyprPayload(changes) {
  var out = {}
  Object.keys(changes || {}).forEach(function(option) {
    var s = hyprSetting(option), v = changes[option]
    if (!s) return
    out[option] = v === "" ? null : s.type === "bool" ? v === "true" : s.type === "choice" ? v : Number(v)
  })
  return out
}
// hypr-overrides.py status → { values, effective, error } with every value a
// string the way hyprValue keeps them, or null when unreadable.
function hyprFacts(text) {
  try {
    var d = JSON.parse(String(text))
    if (!d || typeof d !== "object") return null
    var values = {}, effective = {}
    HYPR_SETTINGS.forEach(function(s) {
      var v = d.values && d.values[s.option] !== undefined && d.values[s.option] !== null ? hyprValue(s.option, String(d.values[s.option])) : ""
      values[s.option] = v === null ? "" : v
      effective[s.option] = d.effective && d.effective[s.option] !== undefined ? String(d.effective[s.option]) : ""
    })
    return { values: values, effective: effective, error: typeof d.error === "string" ? d.error : "" }
  } catch (e) { return null }
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
           noteStyle: entry.noteStyle === "bubble" || entry.noteStyle === "float" ? entry.noteStyle : "window" }
}
function listed(config, id) {
  var plugins = config && Array.isArray(config.plugins) ? config.plugins : []
  return plugins.some(function(p) { return p === id || (p && p.id === id) })
}
// extrasFacts: { fullWidth: full-width.py status ("edge" | "gaps" | "error"
// | "" not read yet), sheetInstalled: true | false | null (not checked yet) }.
// The sheet's on/off is the plugin's entry in shell.json, so it follows
// outside changes at once.
function extrasValues(config, facts) {
  if (!facts) return null
  var fw = facts.fullWidth === "edge" || facts.fullWidth === "gaps" || facts.fullWidth === "error" ? facts.fullWidth : "unknown"
  var sheet = facts.sheetInstalled === true ? (listed(config, SHEET_ID) ? "on" : "off")
    : facts.sheetInstalled === false ? "missing" : "unknown"
  return { fullWidth: fw, sheet: sheet }
}
// omarchy: OmarchySettings.derive's answer ({ specs, values, links }) or null
// while it has not read Omarchy's menu; hypr: hyprFacts or null (not read
// yet); plugins: the installed plugin folders (host.installedPlugins) or null.
function liveState(options, config, cardsStatus, extrasFacts, omarchy, hypr, plugins) {
  var entries = config && Array.isArray(config.plugins) ? config.plugins : []
  var owner = entries.filter(function(p) { return p && p.id === "nerdibeard.tusche-bar" })[0]
  var bar = Presets.normalizeOptions(options || {})
  var idle = idleFacts(config)
  return { bar: bar,
           screens: Presets.normalizeScreens(owner && owner.screenProfiles),
           island: islandValues(islandEntry(config)),
           cards: cardsStatus === "enabled" || cardsStatus === "disabled" ? { override: cardsStatus } : null,
           extras: extrasValues(config, extrasFacts),
           omarchy: omarchy ? omarchy.values : null,
           omarchySpecs: omarchy ? omarchy.specs : [],
           hypr: hypr && !hypr.error ? hypr.values : null,
           hyprEffective: hypr ? hypr.effective : {},
           idle: idle ? idle.values : null,
           idleRaw: idle ? idle.raw : {},
           link: {},
           linkSpecs: deviceLinks(config, plugins).concat(omarchy && Array.isArray(omarchy.links) ? omarchy.links : []) }
}
// Can this setting be changed now? An extra only while its live value is one
// of its choices (not while unknown, failed or not installed); an Omarchy row
// only while it is not read-only and its live value is one it can go back to;
// a link (nothing to stage) while its panel is there to open.
function available(live, id) {
  var spec = setting(id, live)
  if (!spec || !live || !live[spec.domain]) return false
  if (spec.domain === "omarchy") {
    if (spec.readOnly) return false
    var now = live.omarchy[spec.key]
    return spec.values.some(function(x) { return x.id === now && x.pick })
  }
  if (spec.domain === "link") return spec.available !== false
  if (spec.domain !== "extras") return true
  var v = live.extras[spec.key]
  return spec.values.some(function(x) { return x.id === v })
}
// A value this setting may be staged with (never one for a link).
function acceptable(live, id, v) {
  var spec = setting(id, live)
  if (!spec || spec.domain === "link") return false
  if (spec.domain === "hypr") return hyprValue(spec.key, v) === v
  if (spec.domain === "omarchy" || spec.domain === "idle" || spec.domain === "extras")
    return spec.values.some(function(x) { return x.id === v && x.pick !== false })
  return true
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
  if (!live || !live[p.domain] || p.domain === "link") return out
  if (p.domain === "screens" && (!Presets.screenNameValid(p.key) || ["inherit", "compact", "detailed"].indexOf(v) < 0)) return out
  if ((p.domain === "extras" || p.domain === "omarchy" || p.domain === "hypr" || p.domain === "idle") &&
      (!available(live, id) || !acceptable(live, id, v))) return out
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
  settings(live).forEach(function(s) {
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

// The action that sets an Omarchy row to value v.
function omarchyAction(live, key, v) {
  var spec = setting("omarchy." + key, live)
  var hit = spec ? spec.values.filter(function(x) { return x.id === v && x.pick })[0] : null
  return hit ? hit.action : ""
}
// Steps for Use / Save. Omarchy's settings first, one action each (some write
// shell.json, so each waits until Omarchy reports the new value), then the
// Hyprland overrides as ONE write and reload, the idle times as ONE
// shell.json write, the island (it writes shell.json from the shell's
// in-memory copy), the card picker (its own menu file), the extras (a
// Hyprland toggle file; the sheet through the shell's plugin IPC), the bar
// last as ONE apply (each bar write rebuilds the bar).
function plan(edits, live) {
  var ch = changes(edits, live)
  var steps = []
  ch.forEach(function(c) {
    if (c.domain !== "omarchy") return
    var action = omarchyAction(live, c.key, c.to)
    if (action) steps.push({ domain: "omarchy", key: c.key, value: c.to, action: action })
  })
  var hypr = {}
  ch.forEach(function(c) { if (c.domain === "hypr") hypr[c.key] = c.to })
  if (Object.keys(hypr).length) steps.push({ domain: "hypr", keys: Object.keys(hypr), changes: hypr })
  var idle = {}
  ch.forEach(function(c) { if (c.domain === "idle") idle[c.key] = Number(c.to) })
  if (Object.keys(idle).length) steps.push({ domain: "idle", keys: Object.keys(idle), changes: idle })
  ch.forEach(function(c) { if (c.domain === "island") steps.push({ domain: "island", key: c.key, value: c.to }) })
  ch.forEach(function(c) { if (c.domain === "cards") steps.push({ domain: "cards", key: c.key, value: c.to }) })
  ch.forEach(function(c) { if (c.domain === "extras") steps.push({ domain: "extras", key: c.key, value: c.to }) })
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
  // Omarchy rows Use touched, back to their value from opening (a toggle
  // runs only while it differs), in the reverse order of Use: a row another
  // one hides (Clock formats under a side bar Position) is offered again once
  // that one is back. The action comes from the row as it was at opening when
  // the row is not offered right now.
  if (applied.omarchy && snapshot.omarchy && live.omarchy) {
    var order = settings(snapshot).concat(settings(live)).map(function(s) { return s.id })
    Object.keys(applied.omarchy).sort(function(a, b) {
      return order.indexOf("omarchy." + b) - order.indexOf("omarchy." + a)
    }).forEach(function(key) {
      var before = snapshot.omarchy[key]
      if (before === undefined || before === "unknown" || live.omarchy[key] === before) return
      var action = omarchyAction(live, key, before) || omarchyAction(snapshot, key, before)
      if (action) steps.push({ domain: "omarchy", key: key, value: before, action: action })
    })
  }
  if (applied.hypr && snapshot.hypr && live.hypr) {
    var back = {}
    Object.keys(applied.hypr).forEach(function(option) {
      var before = snapshot.hypr[option] === undefined ? "" : snapshot.hypr[option]
      if (live.hypr[option] !== before) back[option] = before
    })
    if (Object.keys(back).length) steps.push({ domain: "hypr", keys: Object.keys(back), changes: back })
  }
  // Idle times Use touched, back to exactly what shell.json held at opening:
  // the same JSON value (whatever it was), or no value at all.
  if (applied.idle && snapshot.idle && live.idle) {
    var was = {}, before = snapshot.idleRaw || {}, now = live.idleRaw || {}
    Object.keys(applied.idle).forEach(function(key) {
      if (!idleSetting(key)) return
      var had = Object.prototype.hasOwnProperty.call(before, key), has = Object.prototype.hasOwnProperty.call(now, key)
      if (had === has && (!had || JSON.stringify(before[key]) === JSON.stringify(now[key]))) return
      was[key] = had ? { value: copy(before[key]) } : { absent: true }
    })
    if (Object.keys(was).length) steps.push({ domain: "idle", restore: true, keys: Object.keys(was), changes: was })
  }
  if (applied.island && snapshot.island && live.island)
    ISLAND_SETTINGS.forEach(function(s) {
      if (live.island[s.key] !== snapshot.island[s.key]) steps.push({ domain: "island", key: s.key, value: snapshot.island[s.key] })
    })
  if (applied.cards && snapshot.cards && live.cards && live.cards.override !== snapshot.cards.override)
    steps.push({ domain: "cards", key: "override", value: snapshot.cards.override })
  if (applied.extras && snapshot.extras && live.extras)
    EXTRAS_SETTINGS.forEach(function(s) {
      var before = snapshot.extras[s.key]
      var valid = s.values.some(function(x) { return x.id === before })
      if (valid && available(live, "extras." + s.key) && live.extras[s.key] !== before)
        steps.push({ domain: "extras", key: s.key, value: before })
    })
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

// Read after opening: fill what the snapshot did not know yet in a domain
// whose rows arrive later (Omarchy, the overrides), but not for rows Use has
// touched since. Returns the new snapshot, or null when nothing changed.
function fillSnapshot(snapshot, live, domain, touched) {
  // called on every live change while open, so it copies only when it fills
  if (!snapshot || !live || !live[domain]) return null
  if (!snapshot[domain]) {
    var s = copy(snapshot)
    s[domain] = copy(live[domain])
    // the rows as they were at opening: Cancel's actions when a row is hidden later
    if (domain === "omarchy") s.omarchySpecs = copy(live.omarchySpecs)
    // what shell.json held: Cancel puts back exactly that
    if (domain === "idle") s.idleRaw = copy(live.idleRaw || {})
    return s
  }
  var missing = Object.keys(live[domain]).filter(function(k) {
    return !(touched && touched[k]) && (snapshot[domain][k] === undefined || snapshot[domain][k] === "unknown") && live[domain][k] !== "unknown"
  })
  if (!missing.length) return null
  var out = copy(snapshot)
  missing.forEach(function(k) { out[domain][k] = live[domain][k] })
  // a row that appeared later brings its actions for Cancel along
  if (domain === "omarchy") {
    out.omarchySpecs = out.omarchySpecs || []
    ;(live.omarchySpecs || []).forEach(function(spec) {
      if (missing.indexOf(spec.key) !== -1 && !out.omarchySpecs.some(function(x) { return x.key === spec.key })) out.omarchySpecs.push(copy(spec))
    })
  }
  return out
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
// Index entries: { id, area, label, values: [labels], current, terms }.
// terms: the commands, Hyprland options and Omarchy menu paths behind a row.
function searchIndex(live, edits, extra) {
  var pending = pendingState(live, edits || {})
  var out = []
  settings(live).forEach(function(s) {
    if (!live || !live[s.domain]) return
    var now = pending[s.domain][s.key]
    out.push({ id: s.id, area: s.area, label: s.label,
               values: s.values.map(function(v) { return v.label }),
               current: s.domain === "hypr" ? hyprShown(live, s.key, now) : s.domain === "link" ? "open …" : valueLabel(s, now),
               terms: (s.terms || []).concat(s.hint ? [s.hint] : []).filter(function(t) { return t }) })
  })
  return out.concat(extra || [])
}
// What an override row shows: its value, else Hyprland's with "default".
function hyprShown(live, option, v) {
  var s = hyprSetting(option)
  if (v !== "" && v !== undefined) return s && s.type === "bool" ? (v === "true" ? "On" : "Off") : String(v) + (s && s.unit ? " " + s.unit : "")
  var e = live && live.hyprEffective ? live.hyprEffective[option] : ""
  return e === "" || e === undefined ? "default" : "default · " + e
}
function wordScore(text, token, prefix, inner) {
  if (text.indexOf(token) === 0 || text.indexOf(" " + token) !== -1 || text.indexOf("(" + token) !== -1) return prefix
  return text.indexOf(token) !== -1 ? inner : 0
}
// Every token must match the label, a value, the area name, a term (command,
// Hyprland option, Omarchy menu path) or the id.
function search(index, query, limit) {
  var tokens = String(query || "").toLowerCase().split(/\s+/).filter(function(t) { return t !== "" })
  if (!tokens.length) return []
  var hits = []
  ;(index || []).forEach(function(e, order) {
    var label = String(e.label || "").toLowerCase()
    var area = areaLabel(e.area).toLowerCase()
    var values = (e.values || []).map(function(v) { return String(v).toLowerCase() })
    var terms = (e.terms || []).map(function(v) { return String(v).toLowerCase() })
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
      if (!s) for (var k = 0; k < terms.length && !s; k++) s = terms[k].indexOf(tok) !== -1 ? (terms[k].indexOf(tok) === 0 ? 2 : 1) : 0
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

// ---------------------------------------------------------------- generic rows
// The rows of an area the window lays out from the registry (Omarchy rows,
// overrides, idle times, links, full width), as heads and setting ids in
// section order. The hand-made parts of an area (presets, screens, the sheet
// button …) stay in ControlCenter.qml. opts: { advanced: show advanced rows }.
var GENERIC = { omarchy: true, hypr: true, idle: true, link: true }
function genericRow(s) { return GENERIC[s.domain] === true || s.id === "extras.fullWidth" }
function areaRows(area, live, opts) {
  opts = opts || {}
  var sections = [], bySection = {}
  settings(live).forEach(function(s) {
    if (s.area !== area || !genericRow(s) || (s.advanced && !opts.advanced)) return
    if (s.domain !== "hypr" && (!live || !live[s.domain])) return
    var sec = s.section || ""
    if (!bySection[sec]) { bySection[sec] = []; sections.push(sec) }
    bySection[sec].push(s.id)
  })
  var order = SECTIONS[area] || []
  sections.sort(function(a, b) {
    var x = order.indexOf(a), y = order.indexOf(b)
    return (x < 0 ? 99 : x) - (y < 0 ? 99 : y) || sections.indexOf(a) - sections.indexOf(b)
  })
  var out = []
  sections.forEach(function(sec) {
    if (sec) out.push({ kind: "head", text: sec })
    bySection[sec].forEach(function(id) { out.push({ kind: "row", id: id }) })
  })
  return out
}
// "Changed only": staged rows, Hyprland overrides that are set, Tusche
// options and idle times away from their defaults. Omarchy's menu settings
// have no default to compare with, so they show only when staged; links
// never. Grouped by area.
function changedRows(live, edits, opts) {
  var pending = pendingState(live, edits || {})
  var defaults = Presets.normalizeOptions({})
  var byArea = {}
  settings(live).forEach(function(s) {
    if (!live || !live[s.domain] || (s.advanced && !(opts && opts.advanced) && !(s.id in (edits || {})))) return
    var now = pending[s.domain][s.key]
    var staged = (s.id in (edits || {})) && edits[s.id] !== live[s.domain][s.key]
    var away = s.domain === "hypr" ? now !== ""
      : s.domain === "bar" ? now !== defaults[s.key]
      : s.domain === "island" ? now !== (ISLAND_SETTINGS.filter(function(x) { return x.key === s.key })[0] || {}).fallback
      : s.domain === "idle" ? now !== String(idleSetting(s.key).fallback)
      : false
    if (staged || away) (byArea[s.area] = byArea[s.area] || []).push(s.id)
  })
  var out = []
  AREAS.forEach(function(a) {
    if (!byArea[a.id]) return
    out.push({ kind: "head", text: a.label.toUpperCase(), area: a.id })
    byArea[a.id].forEach(function(id) { out.push({ kind: "row", id: id }) })
  })
  return out
}

// ---------------------------------------------------------------- health
// Facts come from live state only (engine properties, shell.json, the
// island's IPC state, the takeover marker, usage record ages, the card
// picker's script, Omarchy's menu, the override file). state: ok | issue |
// unknown.
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

  // Omarchy's settings: { state: reading | ok | failed | empty, rows, readOnly }.
  var om = f.omarchy
  if (om) {
    if (om.state === "ok") add("omarchy", "Omarchy settings", "ok", om.rows + " read from Omarchy's menu" +
                               (om.readOnly ? " · " + om.readOnly + " read-only (password, window or no active value)" : ""))
    else if (om.state === "failed") add("omarchy", "Omarchy settings", "issue", "Omarchy's menu guards did not answer: its rows stay hidden (the drop-down menu shows the same)")
    else if (om.state === "empty") add("omarchy", "Omarchy settings", "issue", "Omarchy's menu file was not found or is empty (" + (f.omarchyPath || "OMARCHY_PATH") + ")")
    else add("omarchy", "Omarchy settings", "unknown", "Reading Omarchy's menu …")
  }
  // The override file: hyprFacts, or null while unread, or { error }.
  var ov = f.overrides
  if (ov !== undefined) {
    if (ov === null) add("overrides", "Hyprland overrides", "unknown", "Reading " + HYPR_FILE + " …")
    else if (ov.error) add("overrides", "Hyprland overrides", "issue", ov.error)
    else {
      var set = Object.keys(ov.values).filter(function(k) { return ov.values[k] !== "" })
      add("overrides", "Hyprland overrides", "ok", set.length ? set.length + (set.length === 1 ? " value" : " values") + " in " + HYPR_FILE + ": " + set.join(", ")
                                                              : "None set: Hyprland runs your config")
    }
  }

  // Shown when the window passes the extras (null: not read yet).
  var x = f.extras
  if (x === undefined) return out
  if (!x || x.fullWidth === "unknown") add("extras", "Extras", "unknown", "Checking …")
  else if (x.fullWidth === "error") add("extras", "Extras", "issue", "bin/full-width.py status failed")
  else add("extras", "Extras", "ok", "Full width windows: " + valueLabel(setting("extras.fullWidth"), x.fullWidth).toLowerCase()
           + " · Shortcut sheet: " + (x.sheet === "missing" ? "not installed" : x.sheet === "unknown" ? "…" : x.sheet))
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
