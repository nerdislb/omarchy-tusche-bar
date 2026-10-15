.pragma library

// What the focus seal says while the native bar is parked. The bar shows the
// battery and a workspace that needs you all the time; with the bar away the
// seal must not hide them, but it stays calm until something matters: a thin
// line under the seal appears when the battery is low and discharging, and a
// small square marks a workspace that wants attention. No services here.

var SHOW_BELOW = 0.30     // the line appears at or under this level while discharging
var LOW_BELOW = 0.15      // and turns urgent at or under this one

function clamp01(v) { v = Number(v); return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0 }

// battery: { present, level (0..1), charging } -> { line, fill, low }
function battery(b) {
  if (!b || b.present !== true) return { line: false, fill: 0, low: false }
  var level = clamp01(b.level)
  if (b.charging === true || level > SHOW_BELOW) return { line: false, fill: level, low: false }
  return { line: true, fill: level, low: level <= LOW_BELOW }
}

// facts: { battery, urgent: number of workspaces that want attention }
function state(facts) {
  var b = battery(facts && facts.battery)
  var urgent = Math.max(0, Math.floor(Number(facts && facts.urgent) || 0))
  return { line: b.line, fill: b.fill, low: b.low, mark: urgent > 0 || b.low, urgent: urgent }
}

// The words for assistive technology, in the order of importance.
function describe(s, level) {
  var parts = []
  if (s.low) parts.push("battery low at " + Math.round(clamp01(level) * 100) + " percent")
  else if (s.line) parts.push("battery at " + Math.round(clamp01(level) * 100) + " percent")
  if (s.urgent > 0) parts.push(s.urgent === 1 ? "a workspace needs you" : s.urgent + " workspaces need you")
  return parts.join(", ")
}

// How many workspaces want you. The bar's own workspace module knows (its urgent ids),
// but a bar with native workspaces ("As today") has none of ours: then Hyprland's public
// workspace list is the source, the same data the native widget reads.
function urgentCount(moduleIds, nativeWorkspaces) {
  if (Array.isArray(moduleIds)) return moduleIds.length
  var n = 0, list = Array.isArray(nativeWorkspaces) ? nativeWorkspaces : []
  for (var i = 0; i < list.length; i++) if (list[i] && list[i].urgent === true) n++
  return n
}

// What a click does: the bar comes back on left and right click; the middle
// button opens the Control Center.
function clickAction(button) {
  return button === "middle" ? "open" : "show"
}
