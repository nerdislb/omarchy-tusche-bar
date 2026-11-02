.pragma library

// Only compositor-owned layout names become display text or OSD input.
function label(mode) {
  switch (mode) {
  case "dwindle": return "Dwindle"
  case "scrolling": return "Scrolling"
  case "pages": return "Pages"
  case "master": return "Master"
  case "stacking":
  case "floating": return "Floating"
  default: return ""
  }
}
