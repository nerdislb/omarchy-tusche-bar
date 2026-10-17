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

// ---------------------------------------------------------------------------
// The companion (option `seal: omi`). It says more than the plain seal, from
// the same facts plus what the island reports. Skin-independent: this decides
// what the face stands for, a skin (modules/OmiFace.qml) draws it.

var BADGE_MAX = 99

function count(v) {
  var n = Math.floor(Number(v))
  return isFinite(n) && n > 0 ? n : 0
}

// The island's `companion` object (its state IPC) as plain numbers; null when
// it is absent, unreadable or not an object, so a missing island changes nothing.
function island(raw) {
  if (!raw || typeof raw !== "object") return null
  return { unread: count(raw.unread), alerts: count(raw.alerts), dnd: raw.dnd === true,
           blocked: count(raw.blocked), working: count(raw.working),
           done: count(raw.doneSerial !== undefined ? raw.doneSerial : raw.done) }   // idempotent: companion() reads it again
}

// facts: { battery, urgent, island: the raw companion object or null }
// face: the one thing the face stands for, by importance:
//   battery    the charge is nearly gone (<= 15 %, discharging): the face gives way to a battery
//   alert      something broke (a critical or failure notification is unread)
//   waiting    an agent waits for you
//   attention  a workspace wants you
//   drained    the charge is low (<= 30 %, discharging)
//   working    an agent is working
//   calm       nothing
// badge: unread notifications, unless Do Not Disturb is on; urgent while an alert is among them.
function companion(facts) {
  var f = facts || {}
  var b = battery(f.battery)
  var i = island(f.island) || { unread: 0, alerts: 0, dnd: false, blocked: 0, working: 0, done: 0 }
  var urgent = count(f.urgent)
  var face = b.line && b.low ? "battery"
    : i.alerts > 0 ? "alert"
    : i.blocked > 0 ? "waiting"
    : urgent > 0 ? "attention"
    : b.line ? "drained"
    : i.working > 0 ? "working"
    : "calm"
  return {
    face: face,
    tone: face === "battery" || face === "alert" ? "urgent" : "accent",
    level: b.fill,
    badge: i.unread > 0 && !i.dnd ? { count: Math.min(i.unread, BADGE_MAX), tone: i.alerts > 0 ? "urgent" : "accent" } : null
  }
}

// What changed between two readings of the island (as island() returns them):
// `done`: an agent finished (its serial moved up); `pop`: more unread than
// before. The first reading, or one after the island was gone, is only a baseline.
function observe(prev, next) {
  if (!prev || !next) return { done: false, pop: false }
  return { done: next.done > prev.done, pop: next.unread > prev.unread && !next.dnd }
}

// The words for assistive technology, in the order of importance.
function describeCompanion(c, level) {
  var parts = []
  var pct = Math.round(clamp01(level) * 100)
  if (c.face === "battery") parts.push("battery almost empty at " + pct + " percent")
  else if (c.face === "alert") parts.push("something failed")
  else if (c.face === "waiting") parts.push("an agent is waiting for you")
  else if (c.face === "attention") parts.push("a workspace needs you")
  else if (c.face === "drained") parts.push("battery low at " + pct + " percent")
  else if (c.face === "working") parts.push("an agent is working")
  if (c.badge) parts.push(c.badge.count === 1 ? "1 unread notification" : c.badge.count + " unread notifications")
  return parts.join(", ")
}
