.pragma library

// The Omi state protocol, version 1 (tahayvr/omi, protocol/README.md): one Omi shared by every app on
// the machine. A service holds one state; any app sets it; every app following it shows the same.
// This is the service's side as pure decisions, the way the reference service (service/omi-service.js)
// takes them: messages in, messages out. OmiShare.qml owns the socket and the timer.
//
//   to the service:    set { mode, instant?, for?, then? } · get · hello { name }
//   from the service:  state { protocol, mode, from, since, instant } · error { message }
//
// The state starts as the plain logo ("logo", nothing set yet). A `for`/`then` pair starts a timer that
// belongs to its change: any later set cancels it. Setting the mode Omi is already in changes nothing
// (`since` stays) but replaces a pending timer. Every set and get is answered with the state.

var PROTOCOL = 1
var MAX_FOR = 86400          // a timer longer than a day is a day

function initial(now) { return { mode: "logo", from: null, since: now, instant: true } }

function stateMessage(state) {
  return { type: "state", protocol: PROTOCOL, mode: state.mode, from: state.from, since: state.since, instant: state.instant }
}

// Where the service listens: $OMI_SOCKET, else $XDG_RUNTIME_DIR/omi.sock, else nowhere (the reference
// falls back to a per-user file in the temporary directory, which a shell cannot name without a uid).
function socketPath(omiSocket, runtimeDir) {
  if (omiSocket) return String(omiSocket)
  if (runtimeDir) return String(runtimeDir).replace(/\/+$/, "") + "/omi.sock"
  return ""
}

// null when `id` is a mode this service accepts (`modes`: the ids of the kit, or null to accept any id).
function checkMode(id, modes) {
  if (typeof id !== "string" || !id) return "mode must be a mode id"
  if (Array.isArray(modes) && modes.indexOf(id) < 0) return "no mode \"" + id + "\""
  return null
}

function changed(state, mode, instant, now) {
  return mode === state.mode ? state : { mode: mode, from: state.mode, since: now, instant: instant === true }
}

// One message from one app. Returns { model, send, broadcast, timer, name }:
//   send       messages for the sender alone
//   broadcast  messages for every connected app, the sender included
//   timer      { clear: true } or { clear: true, seconds, then }: what to do with the one timer
//   name       the sender's own name, from a hello
// `model` is { state }; it is never mutated.
function handle(model, msg, now, modes) {
  var out = { model: model, send: [], broadcast: [], timer: null, name: null }
  if (!msg || typeof msg !== "object") return out
  if (msg.type === "hello") {
    if (typeof msg.name === "string") out.name = msg.name.replace(/[\u0000-\u001f\u007f]/g, " ").slice(0, 60)
    return out
  }
  if (msg.type === "get") { out.send.push(stateMessage(model.state)); return out }
  if (msg.type !== "set") return out
  var bad = checkMode(msg.mode, modes)
  if (!bad && (msg.for != null || msg.then != null)) {
    bad = !(typeof msg.for === "number" && isFinite(msg.for) && msg.for > 0)
      ? "for must be a number of seconds above 0"
      : checkMode(msg.then, modes)
  }
  if (bad) { out.send.push({ type: "error", message: bad }); return out }
  var next = changed(model.state, msg.mode, msg.instant, now)
  out.model = { state: next }
  out.timer = msg.for != null ? { clear: true, seconds: Math.min(msg.for, MAX_FOR), then: msg.then } : { clear: true }
  if (next !== model.state) out.broadcast.push(stateMessage(next))
  else out.send.push(stateMessage(next))
  return out
}

// The timer of a for/then pair ran out: change to `then`, unless the state moved on.
function expire(model, then, now, modes) {
  var out = { model: model, broadcast: [] }
  if (checkMode(then, modes)) return out
  var next = changed(model.state, then, false, now)
  if (next !== model.state) { out.model = { state: next }; out.broadcast.push(stateMessage(next)) }
  return out
}

// A state message from another service we follow (we are a client then): the state it describes, or null.
function follow(model, msg, modes) {
  if (!msg || msg.type !== "state" || typeof msg.mode !== "string" || !msg.mode) return null
  var since = Number(msg.since)
  return { state: { mode: msg.mode, from: typeof msg.from === "string" ? msg.from : null,
                    since: isFinite(since) ? since : 0, instant: msg.instant === true } }
}

// What the seal shows for the shared state: `""` when there is nothing to show (nothing set, back to idle,
// or a mode the kit does not have); else the mode id. A reaction like `success` works as a state here too.
function shown(state, modes) {
  var id = state && typeof state.mode === "string" ? state.mode : ""
  if (!id || id === "logo" || id === "idle") return ""
  if (Array.isArray(modes) && modes.indexOf(id) < 0) return ""
  return id
}
