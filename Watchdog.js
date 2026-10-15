.pragma library

// Safety net for the island's takeover of Omarchy's notification service.
//
// With the island's `notifications` setting on, it disables omarchy.notifications
// and serves the notifications itself (leaving a marker file). If the island then
// fails to load or stops answering, nobody shows notifications at all, and nothing
// in the island can notice that. This model decides when to give Omarchy's service
// back. It only ever acts on a takeover that has the island's marker: a service
// somebody disabled by hand stays disabled.
//
// Cheap by design: a look every five minutes while all is well; only a missing
// answer switches to a quick confirmation (three silent answers, twenty seconds
// apart) before the service goes back. After a hand-back there is a long pause.
// No decision here depends on a clock other than the `now` it is given.

var FIRST_MS = 45000       // after the shell (or the takeover) starts: let the island load
var FAST_MS = 20000        // confirming a silence
var SLOW_MS = 300000       // all well: a look every five minutes
var MISSES = 3             // consecutive silent answers before the service goes back
var COOLDOWN_MS = 600000   // after a hand-back, no second one for ten minutes
var SERVICE_ID = "omarchy.notifications"

function initial() {
  return { misses: 0, handedBacks: 0, handedBackAt: -Infinity, lastOk: -Infinity, lastCheck: -Infinity, armed: false }
}

// The takeover is the island's when Omarchy's service is disabled and the island
// left its marker.
function owned(facts) { return !!facts && facts.disabled === true && facts.marker === true }

// answer: "ok" · "silent" (no reply, or not "ok") · "nomarker"
function classify(text) {
  var t = String(text === undefined || text === null ? "" : text).trim()
  return t === "ok" || t === "nomarker" ? t : "silent"
}

// -> { state, action: null | "handback" }
function step(state, answer, now) {
  var s = Object.assign({}, state || initial())
  s.lastCheck = now
  if (answer === "nomarker") { s.misses = 0; s.armed = false; return { state: s, action: null } }
  s.armed = true
  if (answer === "ok") { s.misses = 0; s.lastOk = now; return { state: s, action: null } }
  s.misses = (s.misses || 0) + 1
  if (s.misses >= MISSES && now - s.handedBackAt >= COOLDOWN_MS) {
    // The pause starts with the attempt, so a failing hand-back is not retried in a loop.
    s.misses = 0
    s.handedBackAt = now
    s.armed = false
    return { state: s, action: "handback" }
  }
  return { state: s, action: null }
}

// The service really went back.
function handedBack(state) {
  var s = Object.assign({}, state || initial())
  s.handedBacks = (s.handedBacks || 0) + 1
  return s
}

// Milliseconds until the next look.
function nextDelay(state) { return state && state.misses > 0 ? FAST_MS : SLOW_MS }

// For the Health page.
function describe(state, enabled, now) {
  var s = state || initial()
  if (s.handedBacks > 0)
    return { state: "issue", detail: "The island stayed silent, so Omarchy's notification service was handed back (" + s.handedBacks +
      (s.handedBacks === 1 ? " time" : " times") + " since the shell started). Fix the island, then switch its notifications off and on." }
  if (!enabled) return { state: "ok", detail: "Not needed: Omarchy's notification service is running" }
  if (s.misses > 0)
    return { state: "issue", detail: "The island did not answer " + s.misses + " of " + MISSES + " times; Omarchy's notifications go back after the third" }
  if (s.lastOk === -Infinity || s.lastOk === undefined)
    return { state: "ok", detail: "Armed: first look shortly after the shell starts, then every " + Math.round(SLOW_MS / 60000) + " minutes" }
  var minutes = Math.max(0, Math.round((now - s.lastOk) / 60000))
  return { state: "ok", detail: "Armed: the island answered " + (minutes < 1 ? "just now" : minutes + " min ago") +
    "; Omarchy's service goes back after " + MISSES + " silent answers" }
}
