.pragma library

// What the Omi skin draws besides Omi himself: which of his modes stands for
// a face (FocusSeal.js `companion`), a speech-bubble badge with a counter, and
// a battery that takes the place of the face. All of it is filled rectangles
// on the logo's own grid (one cell = 20 units, the logo is 300 x 300, the pack's
// view square is [-70, -70, 440, 440]), so it stays crisp and morphs with the rest.
// No pack data lives here; Omi's design is not ours to ship (see the README).

var CELL = 20
var VIEW = { x: -70, y: -70, w: 440, h: 440 }
// The outermost cell of the view that is on the logo's grid (the view itself is half a cell off it).
var EDGE = { right: 360, top: -60 }

// First mode of a face the pack has. A pack that dropped a mode falls back along
// the list, ending at `idle` and, last of all, the bare logo.
var MODES = {
  calm: ["idle"],
  working: ["working", "thinking", "idle"],
  waiting: ["listening", "idle"],
  attention: ["warning", "skeptical", "idle"],
  drained: ["low-battery", "sleeping", "idle"],
  alert: ["angry", "warning", "idle"],
  battery: ["logo"],
  asleep: ["sleeping", "idle"]
}

function modeFor(face, available) {
  var have = {}
  var list = Array.isArray(available) ? available : []
  for (var i = 0; i < list.length; i++) have[String(list[i])] = true
  var wanted = MODES[face] || MODES.calm
  for (var j = 0; j < wanted.length; j++) if (have[wanted[j]]) return wanted[j]
  return have.idle ? "idle" : "logo"
}

// The mode a skin shows for a face while the pack is not available yet.
function fallbackMode(face) { return (MODES[face] || MODES.calm)[0] }

// A 3 x 5 pixel digit, one string per row.
var DIGITS = {
  "0": ["111", "101", "101", "101", "111"],
  "1": ["010", "110", "010", "010", "111"],
  "2": ["111", "001", "111", "100", "111"],
  "3": ["111", "001", "111", "001", "111"],
  "4": ["101", "101", "111", "001", "001"],
  "5": ["111", "100", "111", "001", "111"],
  "6": ["111", "100", "111", "101", "111"],
  "7": ["111", "001", "001", "001", "001"],
  "8": ["111", "101", "111", "101", "111"],
  "9": ["111", "101", "111", "001", "111"],
  ":": ["0", "1", "0", "1", "0"]
}

// A solid speech bubble in the top right corner of Omi's view, the glyphs cut out of it
// (to be painted in the ground colour), its tail pointing down and left to the face.
// `text` is digits and colons. Returns the body, the tail and the glyphs as rectangles,
// plus the text.
function speech(text) {
  var chars = String(text)
  var widths = 0, c
  for (c = 0; c < chars.length; c++) widths += DIGITS[chars.charAt(c)][0].length
  var cols = widths + (chars.length - 1) + 2          // one cell between glyphs, one of padding each side
  var w = cols * CELL, h = 7 * CELL                   // five rows of glyph, a cell of padding above and below
  var x0 = EDGE.right - w, y0 = EDGE.top
  var glyphs = []
  var cursor = 1
  for (c = 0; c < chars.length; c++) {
    var rows = DIGITS[chars.charAt(c)], gw = rows[0].length
    for (var r = 0; r < 5; r++) {
      var k = 0
      while (k < gw) {
        if (rows[r].charAt(k) !== "1") { k++; continue }
        var start = k
        while (k < gw && rows[r].charAt(k) === "1") k++
        glyphs.push({ x: x0 + (cursor + start) * CELL, y: y0 + (1 + r) * CELL, w: (k - start) * CELL, h: CELL })
      }
    }
    cursor += gw + 1
  }
  return {
    text: chars,
    body: { x: x0, y: y0, w: w, h: h },
    tail: [{ x: x0 + CELL, y: y0 + h, w: 2 * CELL, h: CELL }, { x: x0, y: y0 + h + CELL, w: 2 * CELL, h: CELL }],
    digits: glyphs
  }
}

// The unread count as a bubble: 1..99 (anything else is clamped).
function bubble(count) {
  return speech(String(Math.max(1, Math.min(99, Math.floor(Number(count)) || 1))))
}

// The time as a bubble, "HH:MM"; anything else reads as 00:00.
function clock(text) {
  return speech(/^\d\d:\d\d$/.test(String(text)) ? String(text) : "00:00")
}

// A battery inside the logo's frame, where the face is, centred on the logo's middle
// cell: outline and nub, and `cells` of its four inner cells filled. 0 is empty.
// Returns { outline, fill } as rectangles.
function battery(cells) {
  var n = Math.max(0, Math.min(4, Math.floor(Number(cells)) || 0))
  var fill = []
  for (var i = 0; i < n; i++) fill.push({ x: 100 + i * CELL, y: 140, w: CELL, h: CELL })
  return {
    outline: [
      { x: 80, y: 120, w: 120, h: CELL }, { x: 80, y: 160, w: 120, h: CELL },
      { x: 80, y: 140, w: CELL, h: CELL }, { x: 180, y: 140, w: CELL, h: CELL },
      { x: 200, y: 140, w: CELL, h: CELL }
    ],
    fill: fill
  }
}

// How many of the battery's four cells a charge shows: none when it is all but gone.
function batteryCells(level) {
  var v = Number(level)
  return isFinite(v) && v >= 0.05 ? 1 : 0
}

// A fly that circles Omi for a few seconds: in from far away, round him on a wobbling
// ring, and out again. Its place is a function of the time alone, on the grid, so it steps
// from cell to cell like a sprite. `seed` varies the start and the direction.
var FLY = { duration: 9, radius: 175, wobble: 24, spin: 1.5, far: 420, flap: 12, ease: 1.1 }
function fly(t, seed) {
  var s = Math.floor(Number(seed)) || 0
  var time = Number(t)
  if (!(time >= 0) || time >= FLY.duration) return { alive: false, x: 0, y: 0, wing: false, visible: false }
  var f = Math.min(1, time / FLY.ease, (FLY.duration - time) / FLY.ease)
  f = f * f * (3 - 2 * f)
  var r = FLY.far + (FLY.radius + FLY.wobble * Math.sin(time * 1.9 + s) - FLY.far) * f
  var a = s * 0.9 + (s % 2 === 0 ? 1 : -1) * FLY.spin * time
  var x = Math.round((150 + r * Math.cos(a) - CELL / 2) / CELL) * CELL
  var y = Math.round((150 + r * Math.sin(a) - CELL / 2) / CELL) * CELL
  return {
    alive: true, x: x, y: y, wing: Math.floor(time * FLY.flap) % 2 === 1,
    visible: x - CELL >= VIEW.x && x + 2 * CELL <= VIEW.x + VIEW.w && y - CELL >= VIEW.y && y + 2 * CELL <= VIEW.y + VIEW.h
  }
}

// The fly's body and wings: the wings flap between up and down, always on the diagonals so
// the body never reads as a bar.
function flyRects(f) {
  var dy = f.wing ? -CELL : CELL
  return [{ x: f.x, y: f.y, w: CELL, h: CELL },
          { x: f.x - CELL, y: f.y + dy, w: CELL, h: CELL }, { x: f.x + CELL, y: f.y + dy, w: CELL, h: CELL }]
}

// Where Omi's eyes turn to see a thing at (x, y) in grid units, as `look` wants it: each -1..1.
function lookAt(x, y) {
  var clamp = function(v) { return Math.round(Math.max(-1, Math.min(1, v)) * 100) / 100 }
  return [clamp((Number(x) + CELL / 2 - 150) / 190), clamp((Number(y) + CELL / 2 - 150) / 190)]
}
