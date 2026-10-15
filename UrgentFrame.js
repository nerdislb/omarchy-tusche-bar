.pragma library

// A window that asks for you gets Hyprland's own inactive border in the theme's
// urgent colour, until you focus it (or it closes). No overlay, no polling and
// no animation: Hyprland draws the border, we only set and unset one window
// property through `hyprctl setprop`. Hyprland's raw events (`urgent>>ADDRESS`,
// `activewindowv2>>ADDRESS`, `closewindow>>ADDRESS`) drive it.
//
// Pure decisions only: the engine passes each event in and runs the argv lists
// that come back.

var MAX_TRACKED = 64
var PROPERTY = "inactive_border_color"

function initial() { return { urgent: [] } }

// Hyprland sends window addresses without the 0x prefix. Anything else is not an address.
function address(data) {
  var a = String(data === undefined || data === null ? "" : data).trim().toLowerCase().replace(/^0x/, "")
  return /^[0-9a-f]{1,16}$/.test(a) ? a : ""
}

// "#rrggbb" (or "rrggbb") -> "rgba(rrggbbff)"; anything else is refused.
function rgba(colour) {
  var c = String(colour === undefined || colour === null ? "" : colour).trim().replace(/^#/, "").toLowerCase()
  return /^[0-9a-f]{6}$/.test(c) ? "rgba(" + c + "ff)" : ""
}

function set(addr, colour) { return ["hyprctl", "setprop", "address:0x" + addr, PROPERTY, rgba(colour)] }
function unset(addr) { return ["hyprctl", "setprop", "address:0x" + addr, PROPERTY, "unset"] }

// -> { state, commands: [argv, ...] }
function handle(state, name, data, colour) {
  var s = state && Array.isArray(state.urgent) ? { urgent: state.urgent.slice() } : initial()
  var a = address(data)
  if (!a) return { state: s, commands: [] }
  var at = s.urgent.indexOf(a)
  if (name === "urgent") {
    if (rgba(colour) === "") return { state: s, commands: [] }
    if (at < 0) {
      s.urgent.push(a)
      // bounded: the oldest falls off (its border is let go as well)
      var dropped = s.urgent.length > MAX_TRACKED ? s.urgent.shift() : ""
      return { state: s, commands: (dropped ? [unset(dropped)] : []).concat([set(a, colour)]) }
    }
    return { state: s, commands: [set(a, colour)] }      // the colour may have changed with a theme
  }
  if (name === "activewindowv2") {
    if (at < 0) return { state: s, commands: [] }
    s.urgent.splice(at, 1)
    return { state: s, commands: [unset(a)] }
  }
  if (name === "closewindow") {
    if (at >= 0) s.urgent.splice(at, 1)                   // nothing to unset: the window is gone
    return { state: s, commands: [] }
  }
  return { state: s, commands: [] }
}

// The option was switched off (or the engine goes away): give every window back.
function release(state) {
  var s = state && Array.isArray(state.urgent) ? state.urgent : []
  return { state: initial(), commands: s.map(unset) }
}

// A theme switch changes the urgent colour: windows that are still urgent follow.
function recolour(state, colour) {
  var s = state && Array.isArray(state.urgent) ? state.urgent : []
  if (rgba(colour) === "") return { state: state || initial(), commands: [] }
  return { state: { urgent: s.slice() }, commands: s.map(function(a) { return set(a, colour) }) }
}
