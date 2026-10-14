.import "Presets.js" as Presets

// Presentation-only state: no writes, services, or mutation of the staged object.
var PARTS = ["logo", "workspaces", "ai", "right"]

function valid(key, value) {
  var element = Presets.ELEMENTS[key]
  return !!element && Array.isArray(element.variants) && element.variants.some(function(v) { return v.id === value })
}

function previewOptions(current, key, value) {
  var out = Presets.normalizeOptions(current)
  if (PARTS.indexOf(key) !== -1 && valid(key, value)) out[key] = value
  return out
}

function valueLabel(key, value) {
  var element = Presets.ELEMENTS[key]
  if (!element) return String(value || "")
  for (var i = 0; i < element.variants.length; i++)
    if (element.variants[i].id === value) return element.variants[i].label
  return String(value || "")
}

function differences(current, next) {
  var a = Presets.normalizeOptions(current), b = Presets.normalizeOptions(next), out = []
  Object.keys(Presets.ELEMENTS).forEach(function(key) {
    if (a[key] !== b[key]) out.push({key: key, label: Presets.ELEMENTS[key].label,
      before: valueLabel(key, a[key]), after: valueLabel(key, b[key])})
  })
  return out
}

function differenceText(current, next) {
  var changes = differences(current, next)
  return changes.length ? changes.map(function(c) { return c.label + ": " + c.before + " → " + c.after }).join("\n") : "No changes"
}

function presetDifference(current, preset) {
  return differenceText(current, Presets.keepLook(preset.options, current))
}

// Specimens are quiet even when a theme explicitly enables continuous metal
// flow. A copy is essential: previewing must not alter the live theme object.
function quietMaterial(material) {
  if (!material) return null
  var copy = JSON.parse(JSON.stringify(material))
  if (copy.metal) copy.metal.flow = 0
  return copy
}

function help(key, value) {
  if (value === "today") return "Keeps the original widgets. Their full appearance remains on the live bar."
  if (key === "ai" && value === "ondemand") return "Hidden below 75%; the fullest limit appears when it needs attention."
  if (key === "right" && value === "deviations") return "Only exceptions and connected devices stay visible. The menu remains available."
  if (key === "workspaces" && value === "minimap") return "Actual window rectangles from the selected display; the focused window is marked."
  if (key === "workspaces" && value === "logo") return "The menu square carries the workspace number, with companion dots beside it."
  if (key === "logo") return "Uses the current theme's strong ink. The numbered-workspace variant replaces the logo."
  return "The same renderer and palette as the live bar, using the current snapshot."
}
