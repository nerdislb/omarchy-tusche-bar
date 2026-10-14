import QtQuick
import qs.Commons

// The glass family's frame glint (Frost / Smoke; WindowGlint draws it for a theme
// with material.glass instead of MetalShape): one soft light band crosses the
// focused window's frame from the top-left corner to the bottom-right one, as a
// Bevel Lens card's light does as it opens (GlassSurface). The caller drives
// `sweep` and `amount`, as it does MetalShape's frame glint; at rest nothing is
// drawn. The shape sits `pad` px inside the item, so the soft light outside the
// frame has room.
// `spec` is the theme's material.glass; its `frame` object tunes the glint:
//   ms          the glint's duration (650, as a card's light)
//   band        the band's half width, a fraction of the frame's diagonal (0.07)
//   amount      the glint's strength at its start (0.9)
//   tint        the band's light (a cool white)
//   shade       the bevel shadow beside it, and shadeAmt how strong (0.3)
//   bloom       soft light just outside the frame (0.5)
ShaderEffect {
  id: g

  property var spec: null
  property real pad: 4
  property real radius: 0
  property real tube: 2
  property real sweep: 0
  property real amount: 0

  readonly property var f: spec && spec.frame ? spec.frame : ({})
  readonly property bool light: !!spec && spec.light === true

  readonly property vector2d size: Qt.vector2d(width, height)
  readonly property vector4d rect: Qt.vector4d(pad, pad, Math.max(1, width - 2 * pad), Math.max(1, height - 2 * pad))
  readonly property real band: Number(f.band) > 0 ? Number(f.band) : 0.07
  readonly property real shadeAmt: f.shadeAmt !== undefined ? Number(f.shadeAmt) : 0.3
  readonly property real bloom: f.bloom !== undefined ? Number(f.bloom) : 0.5
  readonly property color tint: f.tint ? f.tint : (light ? "#ffffff" : "#e6f0ff")
  readonly property color shade: f.shade ? f.shade : (light ? "#2d3d52" : "#04070b")

  blending: true
  fragmentShader: Qt.resolvedUrl("shaders/frameglass.frag.qsb")
}
