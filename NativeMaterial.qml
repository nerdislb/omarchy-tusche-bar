import QtQuick
import "bridge" as Bridge

// The theme material for Omarchy's own popups – the KeyboardPanels of the
// native widgets the Tusche Bar hosts (folded into the status groups) and of
// those that stay in Omarchy's bar. It finds each widget's KeyboardPanel and
// hangs a MaterialCard into its content, exactly as
// our own popups declare one, so the native network or audio popup rolls,
// casts the theme's shadow or blooms like ours. Omarchy's code stays as it
// is: a popup this search does not recognise keeps Omarchy's own look.
// Without a material nothing changes (edge: false – no extra line or shadow
// on Omarchy's popups).
QtObject {
  id: dress

  property bool enabled: true
  // panels that already carry a MaterialCard
  property var dressed: []
  property var decorations: []
  readonly property Component cardComponent: Component { MaterialCard {} }

  // A KeyboardPanel (Omarchy's Ui/KeyboardPanel.qml), recognised by its API.
  function isPanel(o) {
    return !!o && o.borderSpec !== undefined && o.anchorItem !== undefined && o.contentItem !== undefined
      && typeof o.fittedContentHeight === "function" && o.barPos !== undefined
  }
  function panelsIn(o, depth, out) {
    if (!o || depth > 3) return out
    if (isPanel(o)) { out.push(o); return out }
    var kids = o.data || []
    for (var i = 0; i < kids.length; i++) panelsIn(kids[i], depth + 1, out)
    return out
  }
  // the panel's content holder: the parent of its content (the card is the holder's parent)
  function holderOf(panel) {
    var c = panel.contentItem
    var first = c && c.length > 0 ? c[0] : null
    var h = first ? first.parent : null
    return h && h.parent && h.parent.borderSpec !== undefined ? h : null
  }
  // Dress every KeyboardPanel inside `item` (a hosted native widget); returns how many were new.
  function attach(item) {
    if (!enabled || !item) return 0
    var panels = panelsIn(item, 0, []), added = []
    for (var i = 0; i < panels.length; i++) {
      var p = panels[i]
      if (dressed.indexOf(p) !== -1) continue
      var holder = holderOf(p)
      if (!holder) continue
      var mc = cardComponent.createObject(holder, {
        panel: p,
        edge: false,
        material: Qt.binding(function() { return Bridge.ModuleBus.material })
      })
      if (mc) { added.push(p); decorations = decorations.concat([{ panel: p, card: mc }]) }
    }
    if (added.length) dressed = dressed.concat(added)
    return added.length
  }
  // Omarchy's widgets that stay in its own bar (audio, power, weather, world
  // clock …): their slots share the bar's scene with our modules, so walk up
  // from one of ours and dress the KeyboardPanels of Omarchy's panel widgets.
  // They stay Omarchy's (trusted bar, all their services); only the popup's
  // look changes. Returns how many popups were new.
  readonly property var nativeIds: ["omarchy.audio", "omarchy.power", "omarchy.weather", "omarchy.elsewhen", "omarchy.clock",
    "omarchy.network", "omarchy.bluetooth", "omarchy.tailscale", "omarchy.monitor", "omarchy.dropbox"]
  function isSlot(o) {
    return !!o && o.entry !== undefined && o.moduleName !== undefined && o.activeItem !== undefined && o.region !== undefined
  }
  function slotsIn(o, depth, out) {
    if (!o || depth > 14) return out
    if (isSlot(o)) { out.push(o); return out }
    var kids = o.children || []
    for (var i = 0; i < kids.length; i++) slotsIn(kids[i], depth + 1, out)
    return out
  }
  function dressBar(from) {
    if (!enabled || !from) return 0
    var top = from
    for (var i = 0; i < 24 && top.parent; i++) top = top.parent
    var slots = slotsIn(top, 0, []), n = 0
    for (var j = 0; j < slots.length; j++)
      if (nativeIds.indexOf(String(slots[j].moduleName)) !== -1 && slots[j].activeItem) n += attach(slots[j].activeItem)
    return n
  }
  // What the search sees, for `tusche-bar state` (natives): each Omarchy slot
  // it found, whether it has a widget, the KeyboardPanels in it, whether their
  // content holder was recognised and whether they carry a MaterialCard.
  function report(from) {
    if (!from) return null
    var top = from
    for (var i = 0; i < 24 && top.parent; i++) top = top.parent
    var slots = slotsIn(top, 0, []), out = []
    for (var j = 0; j < slots.length; j++) {
      var id = String(slots[j].moduleName)
      if (nativeIds.indexOf(id) === -1) continue
      var item = slots[j].activeItem, panels = item ? panelsIn(item, 0, []) : []
      out.push({ id: id, widget: !!item, panels: panels.length,
                 holders: panels.filter(function(p) { return !!holderOf(p) }).length,
                 dressed: panels.filter(function(p) { return dressed.indexOf(p) !== -1 }).length })
    }
    return { slots: slots.length, natives: out, dressedTotal: dressed.length,
             cards: decorations.filter(alive).map(function(d) { return d.card.stateObject() }) }
  }
  // A decoration is alive while both its panel and its card still are objects. A
  // destroyed QML object leaves a truthy JS wrapper behind whose properties throw,
  // so `!!d.card` is not enough (a plugin reload destroys cards and left the
  // status report throwing for good).
  function alive(d) {
    try { return !!d && !!d.panel && !!d.card && d.panel.borderSpec !== undefined && typeof d.card.stateObject === "function" } catch (e) { return false }
  }
  // a destroyed widget takes its panels (and their MaterialCards) along: forget them
  function forget() {
    dressed = dressed.filter(function(p) { return !!p && p.borderSpec !== undefined })
    decorations = decorations.filter(alive)
  }
}
