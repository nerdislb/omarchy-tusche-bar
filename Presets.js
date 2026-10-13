var ELEMENTS = {
  workspaces: {
    label: "Workspaces",
    variants: [
      { id: "today", label: "As today" },
      { id: "pips", label: "Pips" },
      { id: "stack", label: "Screen stack" },
      { id: "logo", label: "Logo carries the number" },
      { id: "minimap", label: "Minimap" }
    ]
  },
  ai: {
    label: "AI quotas",
    variants: [
      { id: "today", label: "As today" },
      { id: "gauge", label: "Gauge" },
      { id: "vu", label: "VU meter" },
      { id: "rings", label: "Rings" },
      { id: "ondemand", label: "Only when needed" }
    ]
  },
  right: {
    label: "Right side",
    variants: [
      { id: "today", label: "As today" },
      { id: "groups", label: "Groups" },
      { id: "deviations", label: "Only deviations" }
    ]
  },
  edge: {
    label: "Bar edge",
    variants: [
      { id: "none", label: "None" },
      { id: "theme", label: "From the theme (light & shadow)" }
    ]
  },
  logo: {
    label: "Logo",
    variants: [
      { id: "omarchy", label: "Omarchy" },
      { id: "arch", label: "Arch Linux" },
      { id: "nerdibeard", label: "Nerdibeard seal" }
    ]
  },
  centre: {
    label: "Centre",
    variants: [
      { id: "today", label: "As today" },
      { id: "calm", label: "Temperature at the weather" }
    ]
  },
  // not a layout option: a chrome glint on the focused window (WindowGlint.qml)
  frames: {
    label: "Window frames",
    variants: [
      { id: "hyprland", label: "Hyprland's own" },
      { id: "glint", label: "Chrome glint on focus, as the popups (metal themes)" },
      { id: "orbit", label: "Chrome glint once round the window (metal themes)" }
    ]
  },
  glass: {
    label: "Glass material (Frost / Smoke)",
    variants: [ { id: "on", label: "Bevel Lens" }, { id: "off", label: "Solid surface" } ]
  },
  glassMotion: {
    label: "Glass motion (Frost / Smoke)",
    variants: [ { id: "on", label: "Soft spring" }, { id: "off", label: "Classic roll" } ]
  },
  // not a layout option: Super+Space opens the bar's menu (bin/keybinds.py)
  keys: {
    label: "Super+Space",
    variants: [
      { id: "omarchy", label: "Omarchy menu" },
      { id: "bar", label: "Bar menu with search" }
    ]
  }
}

// Look options that sit on top of any preset: presets keep the current
// value, and preset matching ignores them.
var LOOK = ["edge", "keys", "frames", "glass", "glassMotion"]

// Presets.
var PRESETS = [
  { id: "today", label: "Today", note: "Your bar as before",
    options: { workspaces: "today", ai: "today", right: "today", logo: "omarchy", centre: "today" } },
  { id: "tidy", label: "Tidy", note: "Pips · gauge · groups",
    options: { workspaces: "pips", ai: "gauge", right: "groups", logo: "omarchy", centre: "calm" } },
  { id: "focus", label: "Focus", note: "Stack · on demand · deviations",
    options: { workspaces: "stack", ai: "ondemand", right: "deviations", logo: "omarchy", centre: "calm" } }
]
// Preset ids of the Amiga Bar this grew out of.
var OLD_PRESETS = { heute: "today", k1: "tidy", k3: "focus" }

// Native widgets a variant folds into our own modules (removed from the
// layout; our modules show their state and controls instead). Mail and
// WhatsApp always stay native: their widgets need their own services.
var AI_IDS = ["nerdibeard.ai-usage", "omarchy.agents"]
var GROUPED = {
  net: ["omarchy.network", "io.github.iamfitsum.omarchy-proton-vpn", "omarchy.tailscale", "omarchy.bluetooth"],
  phone: ["flux", "io.github.nerdislb.buds-control"],
  system: ["bitr0t.system-monitor", "nerdibeard.monitor", "nerdibeard.googledrive", "com.omastorm.radar", "community.plugin-manager"]
}
var CENTRE_IDS = ["omarchy.weather", "omarchy.elsewhen"]

function groupedIds() {
  var out = []
  for (var g in GROUPED) out = out.concat(GROUPED[g])
  return out
}

// Ids removed from the layout for these options.
function foldedIds(options) {
  var o = normalizeOptions(options)
  var out = []
  if (o.ai !== "today") out = out.concat(AI_IDS)
  if (o.right === "groups" || o.right === "deviations") out = out.concat(groupedIds())
  if (o.right !== "today" && out.indexOf("omarchy.agents") === -1) out.push("omarchy.agents")
  return out
}

function removeIds(layout, ids) {
  var sections = ["left", "center", "right"]
  for (var s = 0; s < sections.length; s++)
    layout[sections[s]] = layout[sections[s]].filter(function(e) { return ids.indexOf(entryId(e)) === -1 })
}

var OWN_PREFIX = "tusche."
// Own module ids; the Amiga Bar's ids (amiga.*) count too, so a layout built
// by it is recognised and replaced.
function isOwn(id) { id = String(id || ""); return id.indexOf(OWN_PREFIX) === 0 || id.indexOf("amiga.") === 0 }
function ownName(id) { return String(id || "").replace(/^(tusche|amiga)\./, "") }

function presetById(id) {
  id = OLD_PRESETS[id] || id
  for (var i = 0; i < PRESETS.length; i++) if (PRESETS[i].id === id) return PRESETS[i]
  return null
}

function copy(v) { return JSON.parse(JSON.stringify(v)) }

function entryId(e) { return typeof e === "string" ? e : (e && e.id ? String(e.id) : "") }

// The user's layout without anything this plugin added.
function stripOwn(layout) {
  var out = { left: [], center: [], right: [] }
  var sections = ["left", "center", "right"]
  for (var s = 0; s < sections.length; s++) {
    var list = layout && Array.isArray(layout[sections[s]]) ? layout[sections[s]] : []
    for (var i = 0; i < list.length; i++)
      if (!isOwn(entryId(list[i]))) out[sections[s]].push(copy(list[i]))
  }
  return out
}

function hasOwn(layout) {
  var sections = ["left", "center", "right"]
  for (var s = 0; s < sections.length; s++) {
    var list = layout && Array.isArray(layout[sections[s]]) ? layout[sections[s]] : []
    for (var i = 0; i < list.length; i++) if (isOwn(entryId(list[i]))) return true
  }
  return false
}

// Replace the ids in `remove` (in whichever section they sit) by `entry`,
// placed where the first of them was. Returns true if something matched.
function replaceGroup(layout, remove, entry) {
  var sections = ["left", "center", "right"]
  for (var s = 0; s < sections.length; s++) {
    var list = layout[sections[s]]
    var at = -1
    for (var i = list.length - 1; i >= 0; i--) {
      if (remove.indexOf(entryId(list[i])) !== -1) { at = i; list.splice(i, 1) }
    }
    if (at !== -1) { list.splice(at, 0, entry); return true }
  }
  return false
}

// base: saved user layout; options: element -> variant; moduleDir: absolute
// path of this plugin's modules/ directory.
function build(base, options, moduleDir) {
  var layout = stripOwn(base)
  var o = normalizeOptions(options)
  var ws = String(o.workspaces || "today")
  if (ws !== "today") {
    var entry = { id: "tusche.workspaces", source: moduleDir + "/Workspaces.qml", variant: ws, menu: true, logo: o.logo }
    if (!replaceGroup(layout, ["omarchy.menu", "omarchy.workspaces"], entry)) layout.left.unshift(entry)
  } else if (o.logo !== "omarchy") {
    // Native workspaces stay; only the menu logo becomes ours.
    var menu = { id: "tusche.workspaces", source: moduleDir + "/Workspaces.qml", variant: "none", menu: true, logo: o.logo }
    if (!replaceGroup(layout, ["omarchy.menu"], menu)) layout.left.unshift(menu)
  }
  // Insert our modules where the widgets they replace sat, then fold.
  if (o.ai && o.ai !== "today") {
    var q = { id: "tusche.quota", source: moduleDir + "/Quota.qml", variant: String(o.ai) }
    if (!insertBefore(layout, "nerdibeard.ai-usage", q)) layout.left.push(q)
  }
  if (o.right && o.right !== "today") {
    // Folded widgets travel along with their own settings: the status
    // module mounts them invisibly so their native popups keep working.
    var embeds = {}
    var fold = foldedIds(o)
    var sections = ["left", "center", "right"]
    for (var si = 0; si < sections.length; si++) {
      var list = layout[sections[si]]
      for (var li = 0; li < list.length; li++) {
        var eid = entryId(list[li])
        if (fold.indexOf(eid) === -1 || AI_IDS.indexOf(eid) !== -1 || CENTRE_IDS.indexOf(eid) !== -1) continue
        var es = typeof list[li] === "object" ? copy(list[li]) : {}
        delete es.id
        embeds[eid] = es
      }
    }
    var st = { id: "tusche.status", source: moduleDir + "/Status.qml", variant: String(o.right), embeds: embeds }
    if (!insertBefore(layout, "omarchy.audio", st)) layout.right.push(st)
  }
  // Weather and world clocks stay native (their popups position
  // themselves through the centre section); we add the temperature.
  if (o.centre === "calm") {
    var centre = { id: "tusche.centre", source: moduleDir + "/Centre.qml" }
    if (!insertAfter(layout, "omarchy.weather", centre)) layout.center.push(centre)
  }
  removeIds(layout, foldedIds(o))
  return layout
}

function insertAfter(layout, id, entry) {
  var sections = ["left", "center", "right"]
  for (var s = 0; s < sections.length; s++) {
    var list = layout[sections[s]]
    for (var i = 0; i < list.length; i++) if (entryId(list[i]) === id) { list.splice(i + 1, 0, entry); return true }
  }
  return false
}

function insertBefore(layout, id, entry) {
  var sections = ["left", "center", "right"]
  for (var s = 0; s < sections.length; s++) {
    var list = layout[sections[s]]
    for (var i = 0; i < list.length; i++) if (entryId(list[i]) === id) { list.splice(i, 0, entry); return true }
  }
  return false
}

function normalizeOptions(o) {
  var out = {}
  for (var key in ELEMENTS) {
    var v = o && o[key] ? String(o[key]) : ELEMENTS[key].variants[0].id
    var ok = ELEMENTS[key].variants.some(function(x) { return x.id === v })
    out[key] = ok ? v : ELEMENTS[key].variants[0].id
  }
  return out
}

function matchPreset(options) {
  var n = normalizeOptions(options)
  for (var i = 0; i < PRESETS.length; i++) {
    var p = normalizeOptions(PRESETS[i].options)
    LOOK.forEach(function(k) { p[k] = n[k] })
    if (JSON.stringify(p) === JSON.stringify(n)) return PRESETS[i].id
  }
  return ""
}

// Whether two option sets build different bars. The look options (edge,
// keys, frames) never change bar.layout, so switching only those keeps the bar
// as the user arranged it.
function layoutDiffers(a, b) {
  var x = normalizeOptions(a), y = normalizeOptions(b)
  for (var key in ELEMENTS) if (LOOK.indexOf(key) === -1 && x[key] !== y[key]) return true
  return false
}

// Options for a preset or saved combination: a preset or an older saved
// combination without a look option keeps the current one.
function keepLook(next, current) {
  var o = normalizeOptions(next)
  var now = normalizeOptions(current)
  LOOK.forEach(function(k) { if (!next || next[k] === undefined) o[k] = now[k] })
  return o
}

// Widget settings edited through folded native popups survive preset changes.
function mergeEmbeddedSettings(base, current) {
  var out = copy(base), embeds = {}, native = {}
  ;["left", "center", "right"].forEach(function(section) {
    ;(current && current[section] || []).forEach(function(entry) {
      if (isOwn(entryId(entry)) && ownName(entryId(entry)) === "status") embeds = entry.embeds || {}
      else if (entry && typeof entry === "object" && !isOwn(entryId(entry))) native[entryId(entry)] = entry
    })
  })
  ;["left", "center", "right"].forEach(function(section) {
    out[section] = (out[section] || []).map(function(entry) {
      var id = entryId(entry)
      return embeds[id] ? Object.assign({}, copy(embeds[id]), {id: id}) : native[id] ? copy(native[id]) : entry
    })
  })
  return out
}

// Recovery when base.json is lost while our modules are in the layout: turn
// each module back into the native widgets it replaced. Folded widgets come
// back with their settings (kept in the status entry); order within a group
// follows the catalogue, not necessarily the user's original order.
function reconstructBase(layout) {
  var out = { left: [], center: [], right: [] }
  var seen = {}
  function push(section, entry) {
    var id = entryId(entry)
    if (!id || seen[id]) return
    seen[id] = true
    out[section].push(copy(entry))
  }
  ;["left", "center", "right"].forEach(function(section) {
    ;(layout && Array.isArray(layout[section]) ? layout[section] : []).forEach(function(entry) {
      var id = entryId(entry), own = isOwn(id) ? ownName(id) : ""
      if (own === "workspaces") { push(section, "omarchy.menu"); push(section, "omarchy.workspaces") }
      else if (own === "quota") AI_IDS.forEach(function(a) { push(section, a) })
      else if (own === "status") {
        var embeds = entry.embeds || {}
        Object.keys(embeds).forEach(function(k) { push(section, Object.assign({ id: k }, embeds[k])) })
      }
      else if (!own) push(section, entry)
    })
  })
  // omarchy.agents is folded by the AI and right-side modules only
  var folding = ["left", "center", "right"].some(function(section) {
    return (layout && Array.isArray(layout[section]) ? layout[section] : []).some(function(e) {
      var id = entryId(e); return isOwn(id) && (ownName(id) === "status" || ownName(id) === "quota") })
  })
  if (folding && !seen["omarchy.agents"]) out.left.push("omarchy.agents")
  // plain string entries stay plain
  ;["left", "center", "right"].forEach(function(section) {
    out[section] = out[section].map(function(e) { return typeof e === "object" && Object.keys(e).length === 1 ? e.id : e })
  })
  return out
}
