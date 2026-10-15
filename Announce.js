.pragma library

// Device announcements: a presentation-free model that decides when a change is
// worth one line on the on-screen display. No devices, shell commands or timers
// live here; Announcer.qml feeds it samples and sends the lines.
//
// Channels
//   output     the default audio output changed. Omarchy's own output switch
//              already says so; this covers the automatic moves (a headset taking
//              over, a dock going away).
//   bluetooth  a device connected or disconnected, or the radio switched.
// Volume and brightness keep Omarchy's own OSD, so they are not repeated.
//
// Every channel starts silently: the first reading, and anything inside the
// settle window after it, only sets the baseline. A source that arrives late
// gets its own baseline, so start-up and device enumeration stay quiet.

var SETTLE_MS = 900
var BLUETOOTH_SETTLE_MS = 4000
var MIN_GAP_MS = 1500
var DURATION_MS = 2200
var MAX_TEXT = 60
var CHANNELS = ["output", "bluetooth"]
var ISLAND_ID = "nerdibeard.tusche-island"
// Nerd Font Material glyphs; the OSD takes a glyph as an icon name unchanged.
var GLYPH = { on: "\u{f00af}", connected: "\u{f00b1}", off: "\u{f00b2}" }

function initial(enabled) {
  return { enabled: enabled === true, channels: {}, hint: null, seq: 0 }
}

// One plain line: control characters and angle brackets go (a device name is
// remote input), whitespace collapses, the length is bounded.
function clean(value, fallback) {
  var text = String(value === undefined || value === null ? "" : value)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/[<>]/g, "").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT)
  return text || String(fallback || "")
}

function normalized(channel, sample) {
  if (!sample || sample.ready !== true) return null
  if (channel === "output") {
    var id = clean(sample.id)
    if (!id) return null
    return { id: id, name: clean(sample.name, id) }
  }
  if (channel === "bluetooth") {
    var devices = [], seen = {}
    var list = Array.isArray(sample.devices) ? sample.devices.slice(0, 64) : []
    for (var i = 0; i < list.length; i++) {
      var d = list[i]
      if (!d) continue
      var key = clean(d.id || d.name)
      if (!key || seen["$" + key]) continue
      seen["$" + key] = true
      devices.push({ id: key, name: clean(d.name, "Bluetooth device"), connected: d.connected !== false })
    }
    devices.sort(function(a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0 })
    return { id: clean(sample.id, "adapter"), on: sample.on === true, devices: devices }
  }
  return null
}

function same(a, b) { return JSON.stringify(a) === JSON.stringify(b) }

// The line for a change, or null when it is not news.
function describe(channel, before, after) {
  if (channel === "output") {
    return before.id !== after.id ? { icon: "volume-high", text: after.name } : null
  }
  if (channel === "bluetooth") {
    if (before.id !== after.id) return null            // another adapter: a new baseline
    if (before.on !== after.on) return after.on ? { icon: GLYPH.on, text: "Bluetooth on" } : { icon: GLYPH.off, text: "Bluetooth off" }
    if (!after.on) return null
    var knownIds = before.devices.map(function(d) { return d.id })
    var oldIds = before.devices.filter(function(d) { return d.connected }).map(function(d) { return d.id })
    var connected = after.devices.filter(function(d) { return d.connected })
    var newIds = connected.map(function(d) { return d.id })
    // Newly enumerated objects are baselines, even if BlueZ supplies them late
    // already connected. A known disconnected object connecting is real news.
    var added = connected.filter(function(d) { return knownIds.indexOf(d.id) >= 0 && oldIds.indexOf(d.id) < 0 })
    var removed = before.devices.filter(function(d) { return d.connected && newIds.indexOf(d.id) < 0 })
    if (added.length === 1 && !removed.length) return { icon: GLYPH.connected, text: "Connected · " + added[0].name }
    if (removed.length === 1 && !added.length) return { icon: GLYPH.off, text: "Disconnected · " + removed[0].name }
    if (added.length || removed.length)
      return { icon: GLYPH.connected, text: connected.length + (connected.length === 1 ? " device connected" : " devices connected") }
    // Renaming or reordering an unchanged connected set stays quiet.
  }
  return null
}

function configure(state, enabled) {
  if (!state || state.enabled !== (enabled === true)) return initial(enabled)
  return state
}

// `suppressed`: someone else already shows this channel; the baseline still
// advances, so a later change is compared with what was true meanwhile.
function observe(state, channel, sample, now, suppressed) {
  if (!state || !state.enabled) return initial(false)
  if (CHANNELS.indexOf(channel) < 0 || typeof now !== "number" || !isFinite(now)) return state
  var channels = Object.assign({}, state.channels), previous = channels[channel]
  var value = normalized(channel, sample), hint = state.hint, seq = state.seq
  if (!value) {
    delete channels[channel]
    return { enabled: true, channels: channels, hint: hint, seq: seq }
  }
  channels[channel] = { value: value,
    settleUntil: previous ? previous.settleUntil : now + (channel === "bluetooth" ? BLUETOOTH_SETTLE_MS : SETTLE_MS) }
  if (suppressed !== true && previous && now >= previous.settleUntil && !same(previous.value, value)) {
    var line = describe(channel, previous.value, value)
    if (line) { seq++; hint = { seq: seq, kind: channel, icon: line.icon, text: line.text } }
  }
  return { enabled: true, channels: channels, hint: hint, seq: seq }
}

// At most one line per MIN_GAP_MS. While a line waits, a newer one replaces it:
// a flapping device ends in its final state, not in a queue of old ones.
function gate(g, hint, now) {
  g = g || { last: -Infinity, pending: null }
  if (!hint) return { state: g, emit: null, delay: 0 }
  if (now - g.last >= MIN_GAP_MS) return { state: { last: now, pending: null }, emit: hint, delay: 0 }
  return { state: { last: g.last, pending: hint }, emit: null, delay: Math.max(1, g.last + MIN_GAP_MS - now) }
}
function release(g, now) {
  if (!g || !g.pending) return { state: g || { last: -Infinity, pending: null }, emit: null, delay: 0 }
  if (now - g.last >= MIN_GAP_MS) return { state: { last: now, pending: null }, emit: g.pending, delay: 0 }
  return { state: g, emit: null, delay: Math.max(1, g.last + MIN_GAP_MS - now) }
}

// A line that waited out the rate limit is only still true while its source is
// there: a source that disappeared in the meantime takes its waiting line along.
function stillTrue(state, hint) {
  return !!(hint && state && state.enabled === true && state.channels && state.channels[hint.kind])
}

// The command line for Omarchy's OSD. An argv, never a shell string: the text
// can carry a device's own name.
function argv(hint) {
  return ["omarchy-osd", "-i", String(hint.icon), "-m", String(hint.text), "-d", String(DURATION_MS)]
}

// Does the island already show Bluetooth devices connecting? It does unless its
// `bluetooth` setting is off (or it is disabled or not configured).
function islandShowsBluetooth(config) {
  if (!config) return false
  var disabled = Array.isArray(config.disabledPlugins) ? config.disabledPlugins : []
  if (disabled.indexOf(ISLAND_ID) >= 0) return false
  var list = Array.isArray(config.plugins) ? config.plugins.slice() : []
  var layout = config.bar && config.bar.layout ? config.bar.layout : {}
  ;Object.keys(layout).forEach(function(side) {
    if (Array.isArray(layout[side])) list = list.concat(layout[side])
  })
  return list.some(function(entry) {
    if (entry === ISLAND_ID) entry = { id: ISLAND_ID }
    return !!entry && entry.id === ISLAND_ID && entry.enabled !== false && entry.bluetooth !== false
  })
}
