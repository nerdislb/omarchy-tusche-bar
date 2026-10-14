// Presentation-only state machine shared by the live status row and its tests.
// No devices, shell commands, timers or notifications live here.
var HINT_MS = 2400
var SETTLE_MS = 900
var BLUETOOTH_SETTLE_MS = 4000
var CHANNELS = ["audio", "brightness", "bluetooth"]

function initial(enabled) {
  return { enabled: enabled === true, channels: {}, hint: null }
}

function clean(value, fallback) {
  var text = String(value === undefined || value === null ? "" : value)
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160)
  return text || String(fallback || "")
}

function number(value, min, max) {
  if (typeof value !== "number" || !isFinite(value) || value < min || value > max) return null
  return Math.round(value)
}

function normalized(channel, sample) {
  if (!sample || sample.ready !== true) return null
  if (channel === "audio") {
    var percent = number(sample.percent, 0, 1000)
    if (percent === null) return null
    return { id: clean(sample.id, "output"), name: clean(sample.name, "Output"), percent: percent, muted: sample.muted === true }
  }
  if (channel === "brightness") {
    var brightness = number(sample.percent, 0, 100)
    if (brightness === null) return null
    return { id: clean(sample.id, "display"), percent: brightness }
  }
  if (channel === "bluetooth") {
    var devices = [], seen = {}
    var list = Array.isArray(sample.devices) ? sample.devices.slice(0, 64) : []
    for (var i = 0; i < list.length; i++) {
      var d = list[i]
      if (!d) continue
      var id = clean(d.id || d.name)
      if (!id || seen["$" + id]) continue
      seen["$" + id] = true
      devices.push({ id: id, name: clean(d.name, "Bluetooth device"), connected: d.connected !== false })
    }
    devices.sort(function(a, b) { return a.id < b.id ? -1 : a.id > b.id ? 1 : 0 })
    return { id: clean(sample.id, "adapter"), on: sample.on === true, devices: devices }
  }
  return null
}

function same(a, b) { return JSON.stringify(a) === JSON.stringify(b) }

function changedText(channel, before, after) {
  if (channel === "audio") {
    // A changed stored volume while muted is not audible news. Unmuting
    // still announces its latest value because the baseline always advances.
    if (before.id === after.id && before.muted && after.muted) return ""
    if (before.id === after.id && before.percent === after.percent && before.muted === after.muted) return ""
    if (after.muted) return "Muted"
    return (before.id !== after.id ? after.name + " · " : "Volume ") + after.percent + "%"
  }
  if (channel === "brightness") {
    // A different focused display is a new baseline, not a brightness change.
    return before.id === after.id && before.percent !== after.percent ? "Brightness " + after.percent + "%" : ""
  }
  if (channel === "bluetooth") {
    if (before.id !== after.id) return ""
    if (before.on !== after.on) return after.on ? "Bluetooth on" : "Bluetooth off"
    if (!after.on) return ""
    var knownIds = before.devices.map(function(d) { return d.id })
    var oldIds = before.devices.filter(function(d) { return d.connected }).map(function(d) { return d.id })
    var connected = after.devices.filter(function(d) { return d.connected })
    var newIds = connected.map(function(d) { return d.id })
    // Newly enumerated objects are baselines, even if BlueZ supplies them late
    // already connected. A known disconnected object changing is real news.
    var added = connected.filter(function(d) { return knownIds.indexOf(d.id) >= 0 && oldIds.indexOf(d.id) < 0 })
    var removed = before.devices.filter(function(d) { return d.connected && newIds.indexOf(d.id) < 0 })
    if (added.length === 1 && !removed.length) return "Connected · " + added[0].name
    if (removed.length === 1 && !added.length) return "Disconnected · " + removed[0].name
    if (added.length || removed.length) return connected.length + (connected.length === 1 ? " device connected" : " devices connected")
    // Renaming or reordering an unchanged connected-device set stays quiet.
  }
  return ""
}

function expire(state, now) {
  if (!state || !state.enabled) return initial(false)
  if (!state.hint || now < state.hint.until) return state
  return { enabled: true, channels: state.channels, hint: null }
}

function configure(state, enabled) {
  if (!state || state.enabled !== (enabled === true)) return initial(enabled)
  return state
}

function observe(state, channel, sample, now, suppressed) {
  if (!state || !state.enabled) return initial(false)
  if (CHANNELS.indexOf(channel) < 0 || typeof now !== "number" || !isFinite(now)) return state
  state = expire(state, now)
  var channels = Object.assign({}, state.channels), previous = channels[channel]
  var value = normalized(channel, sample), hint = state.hint
  if (!value) {
    delete channels[channel]
    if (hint && hint.kind === channel) hint = null
    return { enabled: true, channels: channels, hint: hint }
  }
  // Each source gets its own late-arrival baseline. Allow its initial burst
  // of native properties to settle, independently of other source readiness.
  channels[channel] = { value: value, settleUntil: previous ? previous.settleUntil : now + (channel === "bluetooth" ? BLUETOOTH_SETTLE_MS : SETTLE_MS) }
  if (suppressed === true) {
    if (hint && hint.kind === channel) hint = null
  } else if (previous && now >= previous.settleUntil && !same(previous.value, value)) {
    var label = changedText(channel, previous.value, value)
    if (label) hint = { kind: channel, text: label, until: now + HINT_MS }
  }
  return { enabled: true, channels: channels, hint: hint }
}

// Respect the Island's existing channel ownership without changing it. Only
// read the already-loaded configuration; no new file watcher or service probe.
function islandOwners(config) {
  var out = { audio: false, brightness: false, bluetooth: false }
  if (!config) return out
  var disabled = Array.isArray(config.disabledPlugins) ? config.disabledPlugins : []
  var id = "nerdibeard.tusche-island"
  if (disabled.indexOf(id) >= 0) return out
  var list = Array.isArray(config.plugins) ? config.plugins.slice() : []
  var layout = config.bar && config.bar.layout ? config.bar.layout : {}
  ;["left", "center", "right"].forEach(function(side) {
    if (Array.isArray(layout[side])) list = list.concat(layout[side])
  })
  list.forEach(function(entry) {
    if (entry === id) entry = { id: id }
    if (!entry || entry.id !== id || entry.enabled === false) return
    var osd = entry.osd === true && disabled.indexOf("omarchy.osd") >= 0
    out.audio = out.audio || entry.volume === true || osd
    out.brightness = out.brightness || entry.brightness === true || osd
    out.bluetooth = out.bluetooth || entry.bluetooth !== false
  })
  return out
}
