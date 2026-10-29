.pragma library

// Exact under-damped step: retargeting keeps both position and velocity.
// A bounded real-time step also survives a sleeping output without a jump.
function step(x, velocity, target, seconds, omega, damping) {
  var dt = Math.max(0, Math.min(0.05, Number(seconds) || 0))
  var w = Math.max(1, Number(omega) || 22)
  var z = Math.max(0.1, Math.min(0.99, Number(damping) || 0.82))
  var a = z * w, b = w * Math.sqrt(1 - z * z)
  var delta = x - target, c = (velocity + a * delta) / b
  var cs = Math.cos(b * dt), sn = Math.sin(b * dt), e = Math.exp(-a * dt)
  var d = e * (delta * cs + c * sn)
  return { x: target + d, v: e * (-a * (delta * cs + c * sn) + b * (-delta * sn + c * cs)) }
}

function settled(x, velocity, target) {
  return Math.abs(x - target) < 0.0003 && Math.abs(velocity) < 0.003
}

// Apple's spring parameters (response in seconds, damping fraction) as the
// natural frequency step() takes.
function omega(response) {
  return 2 * Math.PI / Math.max(0.05, Number(response) || 0.34)
}

// CSS cubic-bezier(x1, y1, x2, y2) at progress t (0 to 1), for the calm
// motion's timed steps.
function ease(x1, y1, x2, y2, t) {
  if (!(t > 0)) return 0
  if (t >= 1) return 1
  function at(a, b, s) { return 3 * a * s * (1 - s) * (1 - s) + 3 * b * s * s * (1 - s) + s * s * s }
  var low = 0, high = 1, s = t
  for (var i = 0; i < 24; i++) {
    s = (low + high) / 2
    if (at(x1, x2, s) < t) low = s
    else high = s
  }
  return at(y1, y2, s)
}

// Popup switch handoff (flat motion, see MaterialCard): the card that opens
// for a switch announces it, the card that closes for it leaves its rect, the
// opening card takes that rect and springs its plate from there. One store
// per plugin (a library script is shared by every importer of this file).
var switchExpect = null
var switchRect = null
function expectSwitch(key, screen, now) {
  switchExpect = { key: key, screen: screen, t: now }
}
function switchExpected(key, screen, now) {
  var e = switchExpect
  return !!e && e.key !== key && e.screen === screen && now - e.t < 250
}
function leaveRect(key, screen, now, rect) {
  switchRect = { key: key, screen: screen, t: now, x: rect.x, y: rect.y, w: rect.w, h: rect.h }
}
function takeRect(key, screen, now) {
  var r = switchRect
  if (!r || r.key === key || r.screen !== screen || now - r.t > 250) return null
  switchRect = null
  switchExpect = null
  return r
}

// Hyprland's client positions are global logical coordinates. Reject parked,
// hidden and other-workspace clients before constructing any capture source.
function clientRect(client, monitor, region) {
  if (!client || !monitor || !region || client.mapped !== true || client.hidden === true) return null
  var ws = client.workspace && client.workspace.id
  var active = monitor.activeWorkspace && monitor.activeWorkspace.id
  var special = monitor.specialWorkspace && monitor.specialWorkspace.id
  if (ws !== active && !(special && ws === special)) return null
  var at = client.at, size = client.size
  if (!at || !size || ![at[0], at[1], size[0], size[1]].every(function(n) { return typeof n === "number" && isFinite(n) })) return null
  var x = at[0] - region.x, y = at[1] - region.y, w = size[0], h = size[1]
  if (w <= 0 || h <= 0 || x >= region.w || y >= region.h || x + w <= 0 || y + h <= 0) return null
  return { x: x, y: y, w: w, h: h, z: client.floating ? 10000 : 0 }
}

// Independent material and motion options; do not mutate the theme object.
function material(source, glass, motion) {
  if (!source || !source.glass) return source
  var out = JSON.parse(JSON.stringify(source))
  out.glass.enabled = glass !== "off"
  out.glass.spring = motion !== "off"
  return out
}

// Shapes, Apple's chain (WWDC25, "Get to know the new design system") as the
// shell's Style shape tokens have it: a popup card has a fixed radius, what
// sits inside it is concentric (the card's radius less the inset, never under
// 4 px) and only what stands out (a segmented row's track and lens, a meter)
// is a capsule. A theme without rounding stays square. `style` is qs.Commons'
// Style; on a shell without the tokens the card takes the window rounding.
function rounded(style) {
  return style && style.rounded !== undefined ? !!style.rounded : !!style && Number(style.cornerRadius) > 0
}
function popupRadius(style) {
  var r = style ? Number(style.popupRadius) : NaN
  return isFinite(r) && r >= 0 ? r : Math.max(0, style ? Number(style.cornerRadius) || 0 : 0)
}
function concentric(style, outer, inset, minimum) {
  if (!rounded(style)) return 0
  var floor = minimum === undefined ? 4 : minimum
  return Math.max(floor, Math.round((Number(outer) || 0) - Math.max(0, Number(inset) || 0)))
}
function capsule(style, size) {
  return rounded(style) ? Math.max(0, Number(size) || 0) / 2 : 0
}
