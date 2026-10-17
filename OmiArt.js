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
  battery: ["logo"]
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
  "9": ["111", "101", "111", "001", "111"]
}

// A solid speech bubble in the top right corner of Omi's view, the digits cut out of it
// (to be painted in the ground colour), its tail pointing down and left to the face.
// count: 1..99 (anything else is clamped). Returns the body, the tail and
// the digits as rectangles, plus the bubble's size in cells.
function bubble(count) {
  var n = Math.max(1, Math.min(99, Math.floor(Number(count)) || 1))
  var text = String(n)
  var cols = text.length * 4 + 1                    // a cell of padding each side, one between digits
  var w = cols * CELL, h = 7 * CELL                 // five rows of digit, a cell of padding above and below
  var x0 = EDGE.right - w, y0 = EDGE.top
  var digits = []
  for (var d = 0; d < text.length; d++) {
    var rows = DIGITS[text.charAt(d)]
    for (var r = 0; r < 5; r++) {
      var c = 0
      while (c < 3) {
        if (rows[r].charAt(c) !== "1") { c++; continue }
        var start = c
        while (c < 3 && rows[r].charAt(c) === "1") c++
        digits.push({ x: x0 + (1 + d * 4 + start) * CELL, y: y0 + (1 + r) * CELL, w: (c - start) * CELL, h: CELL })
      }
    }
  }
  return {
    text: text,
    body: { x: x0, y: y0, w: w, h: h },
    tail: [{ x: x0 + CELL, y: y0 + h, w: 2 * CELL, h: CELL }, { x: x0, y: y0 + h + CELL, w: 2 * CELL, h: CELL }],
    digits: digits
  }
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
