pragma Singleton
import QtQuick
import Quickshell
import Quickshell.Hyprland
import qs.Commons
import qs.Commons as Commons
import "../Presets.js" as Presets

QtObject {
  property var instances: ({})
  // The bar colour as an opaque ink/fill (Commons.Color.bar.background has alpha 0
  // while Omarchy's bar is transparent).
  readonly property color barColor: Qt.rgba(Commons.Color.bar.background.r, Commons.Color.bar.background.g, Commons.Color.bar.background.b, 1)
  // Light themes (Papier …): Qt.lighter() runs into white there, so raised
  // and sunken parts are drawn the other way round.
  function isLight(c) { return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b > 0.55 }
  readonly property bool barLight: isLight(barColor)
  // The engine, for modules that show its menus (set by the engine).
  property var engine: null
  function optionFor(item, key, fallback) {
    var name = item && item.QsWindow && item.QsWindow.window && item.QsWindow.window.screen
      ? String(item.QsWindow.window.screen.name) : ""
    // Live-only look toggles must not rebuild the native bar or its popups.
    if (key === "dayline" || key === "seal")
      return engine && engine.options ? engine.options[key] : fallback
    return Presets.screenValue(engine ? engine.screenProfiles : null, name, key, fallback)
  }
  // the current theme's bar material (bar-material.json) while the edge option
  // is "theme"; null otherwise. MaterialCard styles cards with it.
  property var material: null
  // the metal family (Chrom & Platin): material.metal, null for other themes.
  // pulse(): the workspace changed – the metal shows it once with a glint on
  // the rings and the logo (the bar's edge only with `edgeGlint`).
  readonly property var metal: material && material.metal ? material.metal : null
  signal metalPulse()
  function pulse() { if (metal) metalPulse() }
  // the current theme folder and a counter bumped on every theme switch (reload images
  // that keep their file name, e.g. the Lavur menu brush)
  property string themeDir: ""
  property int themeStamp: 0
  function register(kind, item) {
    var next = Object.assign({}, instances)
    next[kind] = (next[kind] || []).filter(function(i) { return i !== item }).concat([item])
    instances = next
  }
  function unregister(kind, item) {
    var next = Object.assign({}, instances)
    next[kind] = (next[kind] || []).filter(function(i) { return i !== item })
    instances = next
  }
  function focusedScreenName() {
    if (Hyprland.focusedMonitor && Hyprland.focusedMonitor.name) return String(Hyprland.focusedMonitor.name)
    // Reuse the sanitized workspace fallback on Lua Hyprland builds whose
    // native monitor model is empty. Never launch another query here.
    var workspaces = instances.workspaces || []
    var snapshot = workspaces.length ? workspaces[0].snapshot : null
    if (snapshot && snapshot.active && snapshot.workspaces) {
      for (var i = 0; i < snapshot.workspaces.length; i++) {
        var workspace = snapshot.workspaces[i]
        if (workspace.id === snapshot.active.id && workspace.monitor) return String(workspace.monitor)
      }
    }
    return ""
  }
  function pick(kind) {
    var candidates = (instances[kind] || []).filter(function(i) { return i && i.QsWindow.window && i.QsWindow.window.visible })
    var focus = focusedScreenName()
    for (var i = 0; i < candidates.length; i++) {
      var screen = candidates[i].QsWindow.window.screen
      if (screen && screen.name === focus) return candidates[i]
    }
    return candidates.length ? candidates[0] : null
  }

  // ---- AI usage records: modules ask, the engine runs the collectors
  // ("normal" · "limits" = limits only, cheap · "force").
  signal usageRefreshRequested(string kind)
  function requestUsageRefresh(kind) { usageRefreshRequested(String(kind || "normal")) }
}
