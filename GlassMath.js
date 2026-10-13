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
