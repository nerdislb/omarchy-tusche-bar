import QtQuick
import Quickshell
import qs.Ui

// Presentation-only adapter for a folded widget. It deliberately cannot
// obtain another plugin's background service or widen shell capabilities.
PluginBarApi {
  id: api
  required property var host
  required property string memberId
  readonly property var realBar: host ? host.bar : null
  pluginId: memberId
  moduleName: memberId
  foreground: realBar ? realBar.foreground : "transparent"
  barForeground: realBar ? realBar.barForeground : "transparent"
  background: realBar ? realBar.background : "transparent"
  urgent: realBar ? realBar.urgent : "transparent"
  fontFamily: realBar ? realBar.fontFamily : ""
  position: realBar ? realBar.position : "top"
  vertical: realBar ? realBar.vertical : false
  barSize: realBar ? realBar.barSize : 30
  transparent: realBar ? realBar.transparent : false
  foregroundAnimationEnabled: realBar ? realBar.foregroundAnimationEnabled : false
  // Omarchy 2026-11-12 dropped the bar-wide center hover peek (and its
  // centerSectionRevealHeld / centerHoverRevealSuppressed knobs), so nothing
  // here needs to mirror them.
  activePopout: realBar ? realBar.activePopout : null
  clickTargets: realBar ? realBar.clickTargets : []
  layoutConfig: realBar ? realBar.layoutConfig : ({})
  _showTooltip: function(item, text) { if (realBar) realBar.showTooltip(item, text) }
  _hideTooltip: function(item) { if (realBar) realBar.hideTooltip(item) }
  _registerClickTarget: function(item) { if (realBar) realBar.registerClickTarget(item) }
  _unregisterClickTarget: function(item) { if (realBar) realBar.unregisterClickTarget(item) }
  _requestPopout: function(item) { if (realBar) realBar.requestPopout(item) }
  _releasePopout: function(item) { if (realBar) realBar.releasePopout(item) }
  _switchPanelFrom: function(item, direction) { return realBar ? realBar.switchPanelFrom(item, direction) : false }
  _targetBelongsToWindow: function(item, window) { return realBar ? realBar.targetBelongsToWindow(item, window) : false }
  _moduleWidgets: function(id) { return id === memberId && host.mounted[id] ? [host.mounted[id]] : [] }
  _run: function(command) { if (realBar) realBar.run(command) }
  shell: QtObject {
    function serviceFor(id) { return null }
    function updateEntryInline(id, value) {
      if (id !== api.memberId || !api.realBar || !api.realBar.shell) return false
      var next = Object.assign({}, api.host.settings), members = Object.assign({}, api.host.embeds)
      members[id] = Object.assign({}, value)
      delete members[id].id
      next.embeds = members; next.id = api.host.moduleName
      return api.realBar.shell.updateEntryInline(api.host.moduleName, next)
    }
    function summon(target, payload) {
      var allowed = api.memberId === "omarchy.network" ? ["omarchy.wifiqr", "omarchy.speedtest"]
        : api.memberId === "nerdibeard.monitor" ? ["omarchy.osd"] : []
      if (allowed.indexOf(target) < 0) return false
      Quickshell.execDetached(["omarchy-shell", "shell", "summon", target, String(payload || "{}")])
      return true
    }
  }
}
