.pragma library

// The idle life of the Omi seal, as in an old game when nobody touches the
// controller: while you work he only blinks; once you have been away a while
// he looks about, fidgets now and then, yawns, and falls asleep; the first
// sign of you wakes him with a start. Pure decisions: no timers, no QML. The
// skin (modules/OmiFace.qml) ticks `step()` twice a second and plays the actions.
//
// idleFor counts from your last input: the IdleMonitor reports after `idleSec`
// and the stairs below run from there.
//   glances      from the first idle report: a look left, right, up, down
//   fidgets      from `fidgetFrom`: a wink, a raised brow, shyness, humming,
//                drumming fingers, a laugh, a peek, chasing a fly
//   yawn         at `yawnAt`, once; he is drowsy afterwards (fewer fidgets)
//   sleep        at `sleepAt`, until something wakes him
// The small hours shorten the last two. Never the same fidget twice in a row.

var PROFILES = {
  off: null,
  gentle: { idleSec: 40, glanceGap: [9, 18], fidgetFrom: 90, fidgetGap: [45, 110], yawnAt: 300, sleepAt: 600 },
  lively: { idleSec: 20, glanceGap: [5, 11], fidgetFrom: 40, fidgetGap: [18, 45], yawnAt: 150, sleepAt: 300 }
}

// What a fidget is: a mode of the kit played as a reaction (`seconds` after its
// morph lands), or a prop of ours (the fly). `weight` is how often it comes up.
var FIDGETS = [
  { id: "wink", kind: "react", mode: "wink", seconds: 1.2, weight: 2, takes: 3 },
  { id: "skeptical", kind: "react", mode: "skeptical", seconds: 2.4, weight: 2, takes: 5 },
  { id: "shy", kind: "react", mode: "shy", seconds: 2, weight: 1, takes: 5 },
  { id: "humming", kind: "react", mode: "thinking-dots", seconds: 3, weight: 2, takes: 6 },
  { id: "drumming", kind: "react", mode: "typing", seconds: 3, weight: 1.5, takes: 6 },
  { id: "laugh", kind: "react", mode: "laughing", seconds: 1.6, weight: 1, takes: 4 },
  { id: "peek", kind: "react", mode: "peek", seconds: 3, weight: 1, takes: 6 },
  { id: "fly", kind: "fly", seconds: 0, weight: 2.5, takes: 11 }
]
var GLANCES = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -0.5], [1, -0.5]]

var NIGHT_FROM = 23, NIGHT_TO = 6
var AFTER_YAWN = 1.8        // gaps grow by this once he is drowsy
var FIRST_GLANCE_S = 3      // the first glance comes soon after the idle report

function profile(name) { return Object.prototype.hasOwnProperty.call(PROFILES, name) ? PROFILES[name] : PROFILES.lively }
// The IdleMonitor's timeout for a profile, in seconds; 0 for off.
function idleSeconds(name) { var p = profile(name); return p ? p.idleSec : 0 }
function night(hour) { return hour >= NIGHT_FROM || hour < NIGHT_TO }

function initial() { return { phase: "awake", idleSince: 0, nextAt: 0, busyUntil: 0, yawned: false, active: false, recent: [], queue: [], lastGlance: -1 } }

function copy(m) {
  return { phase: m.phase, idleSince: m.idleSince, nextAt: m.nextAt, busyUntil: m.busyUntil, yawned: m.yawned,
           active: m.active, recent: m.recent.slice(), queue: m.queue.slice(), lastGlance: m.lastGlance }
}

// A glance still waiting for its "look ahead again" must not be lost when the queue is dropped
// for a yawn or for sleep: the eyes are put straight ahead now.
function lookAhead(m, actions) {
  if (m.queue.length) actions.push({ kind: "look", x: 0, y: 0 })
  m.queue = []
}

function between(range, rnd) { return (range[0] + (range[1] - range[0]) * rnd()) * 1000 }

function pick(options, rnd) {
  var total = 0, i
  for (i = 0; i < options.length; i++) total += options[i].weight
  var at = rnd() * total
  for (i = 0; i < options.length; i++) { at -= options[i].weight; if (at < 0) return options[i] }
  return options[options.length - 1]
}

// input: { now (ms), idle (you have been away), calm (nothing else to say), working (an agent
//          is working: he still glances and fidgets, but neither yawns nor sleeps, as that would
//          look like nothing is going on), reduced (reduced motion), hour (0-23), modes (ids the kit has), rnd }
// Returns { model, actions }: actions are
//   { kind: "look", x, y } · { kind: "react", mode, seconds } · { kind: "fly" }
//   { kind: "yawn" } · { kind: "sleep" } · { kind: "wake", startle } · { kind: "cancel" }
function step(model, input) {
  var m = copy(model || initial())
  var p = profile(input.profileName === undefined ? "lively" : input.profileName)
  var actions = []
  var now = input.now
  var working = input.working === true
  var quiet = !p || input.reduced === true || input.calm !== true || input.idle !== true

  if (quiet || (working && m.phase === "asleep")) {
    if (m.phase === "asleep") actions.push({ kind: "wake", startle: input.idle !== true && input.calm === true })
    else if (m.active) actions.push({ kind: "cancel" })
    return { model: Object.assign(initial(), { recent: m.recent, lastGlance: m.lastGlance }), actions: actions }
  }

  if (m.phase === "awake") {
    m.phase = "idle"
    m.idleSince = now - p.idleSec * 1000
    m.nextAt = now + FIRST_GLANCE_S * 1000
    m.yawned = false
    m.queue = []
  }
  m.active = true
  var idleFor = (now - m.idleSince) / 1000
  var late = night(input.hour) ? 0.5 : 1
  var yawnAt = p.yawnAt * late, sleepAt = p.sleepAt * late

  while (m.queue.length && m.queue[0].at <= now) actions.push(m.queue.shift().action)
  if (m.phase === "asleep") return { model: m, actions: actions }

  if (!working && idleFor >= sleepAt) {
    m.phase = "asleep"
    lookAhead(m, actions)
    actions.push({ kind: "sleep" })
    return { model: m, actions: actions }
  }
  if (!working && !m.yawned && idleFor >= yawnAt) {
    m.yawned = true
    m.busyUntil = now + 4000
    m.nextAt = now + 9000
    lookAhead(m, actions)
    actions.push({ kind: "yawn" })
    return { model: m, actions: actions }
  }
  if (now < m.nextAt || now < m.busyUntil) return { model: m, actions: actions }

  var stretch = m.yawned ? AFTER_YAWN : 1
  var have = {}
  var modes = Array.isArray(input.modes) ? input.modes : null
  var pool = [{ id: "glance", weight: idleFor < p.fidgetFrom ? 1 : 3, kind: "glance", takes: 3 }]
  if (idleFor >= p.fidgetFrom) {
    for (var i = 0; i < FIDGETS.length; i++) {
      var f = FIDGETS[i]
      if (f.kind === "react" && modes && modes.indexOf(f.mode) < 0) continue
      pool.push(f)
    }
  }
  pool = pool.filter(function(o) { return m.recent.indexOf(o.id) < 0 || pool.length < 3 })
  var chosen = pick(pool, input.rnd)
  m.recent = [chosen.id].concat(m.recent).slice(0, 2)
  var seconds = chosen.takes
  if (chosen.kind === "glance") {
    var gi = Math.min(GLANCES.length - 1, Math.floor(input.rnd() * GLANCES.length))
    if (gi === m.lastGlance) gi = (gi + 1) % GLANCES.length        // never the same way twice in a row
    m.lastGlance = gi
    actions.push({ kind: "look", x: GLANCES[gi][0], y: GLANCES[gi][1] })
    m.queue.push({ at: now + 1800 + Math.floor(input.rnd() * 1200), action: { kind: "look", x: 0, y: 0 } })
    seconds = 3.5
  } else if (chosen.kind === "react") {
    actions.push({ kind: "react", mode: chosen.mode, seconds: chosen.seconds })
  } else {
    actions.push({ kind: "fly" })
  }
  m.busyUntil = now + seconds * 1000
  m.nextAt = now + seconds * 1000 + between(idleFor < p.fidgetFrom ? p.glanceGap : p.fidgetGap, input.rnd) * stretch
  return { model: m, actions: actions }
}
