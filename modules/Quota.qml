import QtQuick
import "../bridge" as Bridge
import ".." as Root
import Quickshell
import Quickshell.Io
import qs.Commons
import qs.Commons as Commons
import qs.Ui

// AI quotas, compact. Custom QML module of the Tusche Bar:
//   { "id": "tusche.quota", "source": ".../modules/Quota.qml",
//     "variant": "gauge" | "vu" | "rings" | "ondemand" }
// Data: Omarchy's agent usage files (~/.local/state/omarchy/agents/usage)
// plus the DeepSeek balance; which limits are shown follows the existing
// AI-usage selection (~/.config/omarchy/ai-usage-deepseek.json "tracked").
// Left click: a card per agent (limits with reset times, today's use, the
// last seven days, all-time figures); ←/→, the scroll wheel or a click on the
// row of agents switches between them. Middle click: refresh now.
Item {
  id: root
  Component.onCompleted: Bridge.ModuleBus.register("quota", root)
  Component.onDestruction: Bridge.ModuleBus.unregister("quota", root)

  property var bar: null
  property string moduleName: "tusche.quota"
  property var settings: ({})
  function setting(key, fallback) { var v = settings ? settings[key] : undefined; return v === undefined || v === null ? fallback : v }

  readonly property string variant: String(Bridge.ModuleBus.optionFor(root, "ai", setting("variant", "gauge")))
  readonly property int barSize: bar && bar.barSize ? bar.barSize : Style.bar.sizeHorizontal
  readonly property color fg: bar && bar.barForeground ? bar.barForeground : Commons.Color.bar.text
  readonly property string home: Quickshell.env("HOME")
  readonly property string usageDir: (Quickshell.env("XDG_STATE_HOME") || home + "/.local/state") + "/omarchy/agents/usage"

  // ---------------------------------------------------------------- theme tones
  property var pal: ({})
  // `omarchy theme set` replaces the theme folder, which ends a watch on the
  // file inside it after the first switch (the rings kept the start theme's
  // green: black from Papier on Tusche's black bar). The name file is
  // rewritten in place each time, so it triggers the reload.
  FileView {
    id: palFile
    path: Commons.Color.currentThemePath + "/colors.toml"
    printErrors: false
    onLoaded: {
      var out = {}, re = /^\s*([A-Za-z0-9_]+)\s*=\s*"(#[0-9A-Fa-f]{6,8})"/gm, m
      var t = text()
      while ((m = re.exec(t)) !== null) out[m[1]] = m[2]
      root.pal = out
    }
  }
  FileView {
    path: root.home + "/.local/state/omarchy/current/theme.name"
    watchChanges: true
    printErrors: false
    onFileChanged: reload()
    onLoaded: palFile.reload()
  }
  function tone(p) {
    if (p >= 0.9) return Commons.Color.urgent
    if (p >= 0.75) return Commons.Color.accent
    if (p >= 0.5) return pal.yellow || Commons.Color.accent
    return pal.green || fg
  }

  // ---------------------------------------------------------------- data
  property var tracked: ["claude:session-5-hour", "codex:weekly-7-day", "deepseek:balance-usd", "antigravity:gemini-weekly"]
  FileView {
    path: root.home + "/.config/omarchy/ai-usage-deepseek.json"
    printErrors: false
    watchChanges: true
    onFileChanged: reload()
    onLoaded: { try { var t = JSON.parse(text()).tracked; if (Array.isArray(t) && t.length) root.tracked = t } catch (e) {} }
  }

  // Whole usage records (the agents panel's contract), id -> record.
  property var providers: ({})
  function setProvider(id, text) {
    var d
    try { d = JSON.parse(text) } catch (e) { return }
    if (!d || typeof d !== "object") return
    d.name = String(d.name || d.id || id)
    d.limits = Array.isArray(d.limits) ? d.limits : []
    var next = {}
    for (var k in providers) next[k] = providers[k]
    next[id] = d
    providers = next
  }
  readonly property var recordIds: ["claude", "codex", "antigravity", "grok", "fireworks"]
  Instantiator {
    model: root.recordIds
    delegate: FileView {
      required property string modelData
      path: root.usageDir + "/" + modelData + ".json"
      printErrors: false
      watchChanges: true
      onFileChanged: reload()
      onLoaded: root.setProvider(modelData, text())
    }
  }
  FileView {
    path: root.home + "/.local/state/deepseek-usage/display.json"
    printErrors: false
    watchChanges: true
    onFileChanged: reload()
    onLoaded: root.setProvider("deepseek", text())
  }

  function slug(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") }
  readonly property var names: ({ claude: "Claude", codex: "Codex", deepseek: "DeepSeek", antigravity: "Antigravity", grok: "Grok", fireworks: "Fireworks" })
  readonly property var letters: ({ claude: "C", codex: "X", deepseek: "D", antigravity: "G", grok: "K", fireworks: "F" })

  // A limit whose reset time has passed is back at 0 %, whatever the record
  // still says: records only change when a collector runs. Such a limit is
  // marked expired and asks the engine for fresh limits.
  property double now: Date.now()
  Timer { interval: 30000; running: true; repeat: true; onTriggered: root.now = Date.now() }

  // Tracked limits in order: { key, provider, name, label, percent (-1 = no quota), value, resetsAt, expired }
  readonly property var items: {
    var out = []
    for (var i = 0; i < tracked.length; i++) {
      var parts = String(tracked[i]).split(":")
      var p = providers[parts[0]]
      if (!p) continue
      for (var j = 0; j < p.limits.length; j++) {
        var l = p.limits[j]
        if (slug(l.title || l.label) !== parts[1]) continue   // the AI usage widget's ids: title first
        var resets = Date.parse(String(l.resetsAt || ""))
        var expired = !l.noQuota && resets > 0 && resets <= now
        out.push({ key: tracked[i], provider: parts[0], name: names[parts[0]] || p.name, label: String(l.title || l.label || ""),
                   percent: l.noQuota ? -1 : expired ? 0 : Math.max(0, Number(l.percent) || 0), value: String(l.valueText || ""),
                   resetsAt: String(l.resetsAt || ""), expired: expired })
      }
    }
    return out
  }
  readonly property var quotaItems: items.filter(function(x) { return x.percent >= 0 })
  // The rings: every tracked quota, and a quiet empty ring for a tracked agent
  // that has a record but no numbers right now (Antigravity while the app is
  // closed), so it does not silently drop out of the bar.
  readonly property var ringItems: {
    var out = [], seen = {}
    for (var i = 0; i < tracked.length; i++) {
      var key = String(tracked[i]), id = key.split(":")[0]
      var hit = items.filter(function(x) { return x.key === key })
      if (hit.length) { hit.forEach(function(x) { if (x.percent >= 0) out.push(x) }); seen[id] = true; continue }
      if (seen[id] || !providers[id]) continue
      seen[id] = true
      out.push({ key: key, provider: id, name: names[id] || providers[id].name, label: "", percent: 0, value: "", resetsAt: "", expired: false, missing: true })
    }
    return out
  }
  readonly property bool anyExpired: items.some(function(x) { return x.expired })
  onAnyExpiredChanged: if (anyExpired) Bridge.ModuleBus.requestUsageRefresh("limits")
  readonly property var tightest: {
    var best = null
    for (var i = 0; i < quotaItems.length; i++) if (!best || quotaItems[i].percent > best.percent) best = quotaItems[i]
    return best
  }
  readonly property var balance: { for (var i = 0; i < items.length; i++) if (items[i].percent < 0) return items[i]; return null }

  function shortLabel(l) {
    if (/session|5.hour/i.test(l)) return "5h"
    if (/week/i.test(l)) return "week"
    return l
  }
  function resetText(iso) {
    if (!iso) return ""
    var ms = Date.parse(iso) - now
    if (!(ms > 0)) return ""
    var m = Math.round(ms / 60000)
    if (m < 60) return m + " min"
    var h = Math.floor(m / 60)
    if (h < 48) return h + " h " + (m % 60) + " min"
    return Math.floor(h / 24) + " d " + (h % 24) + " h"
  }

  // ---------------------------------------------------------------- agents (popup)
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0 }
  // An agent earns a card like in Omarchy's agents panel (numbers, limits or a
  // plan); a tracked one always does while it has a record.
  function hasData(r) {
    return !!r && (num(r.totalPrompts) > 0 || num(r.totalSessions) > 0 || num(r.activeDays) > 0
      || num(r.todayPrompts) > 0 || r.limits.length > 0 || (r.ready === true && String(r.tierLabel || "") !== ""))
  }
  readonly property var agentIds: {
    var out = []
    for (var i = 0; i < tracked.length; i++) {
      var id = String(tracked[i]).split(":")[0]
      if (out.indexOf(id) < 0 && providers[id]) out.push(id)
    }
    var rest = recordIds.concat(["deepseek"])
    for (var j = 0; j < rest.length; j++)
      if (out.indexOf(rest[j]) < 0 && hasData(providers[rest[j]])) out.push(rest[j])
    return out
  }
  property string selectedId: ""
  readonly property string shownId: agentIds.indexOf(selectedId) >= 0 ? selectedId : (agentIds.length ? agentIds[0] : "")
  readonly property var shown: shownId ? providers[shownId] : null
  function select(id) { if (agentIds.indexOf(String(id)) >= 0) { selectedId = String(id); return "ok" } return "agents: " + agentIds.join(" ") }
  function step(d) {
    var n = agentIds.length
    if (!n) return
    var i = agentIds.indexOf(shownId)
    selectedId = agentIds[((i < 0 ? 0 : i) + d + n) % n]
  }

  // A record's limits as the popup draws them; a window past its reset is 0 %.
  function limitsOf(r) {
    if (!r) return []
    return r.limits.map(function(l) {
      var resets = Date.parse(String(l.resetsAt || ""))
      var expired = !l.noQuota && resets > 0 && resets <= now
      return { label: String(l.title || l.label || ""), noQuota: !!l.noQuota, expired: expired,
               percent: l.noQuota ? -1 : expired ? 0 : Math.max(0, num(l.percent)),
               resetsAt: String(l.resetsAt || ""), value: String(l.valueText || ""), detail: String(l.detailText || "") }
    })
  }
  // The fullest window: the ring on the agent's tab.
  function peakOf(r) {
    var best = -1
    limitsOf(r).forEach(function(l) { if (l.percent > best) best = l.percent })
    return best
  }
  function balanceOf(r) { var b = limitsOf(r).filter(function(l) { return l.noQuota && l.value }); return b.length ? b[0] : null }

  function tokens(n) {
    n = num(n)
    if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + "B"
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + "M"
    if (n >= 1e3) return (n / 1e3).toFixed(n >= 1e4 ? 0 : 1) + "k"
    return String(Math.round(n))
  }
  function count(n) { return Math.round(num(n)).toLocaleString(Qt.locale("en_US"), "f", 0) }
  // claude-opus-5-5 → Opus 5.5, claude-haiku-4-5-20251001 → Haiku 4.5; others as they are.
  function modelName(id) {
    var s = String(id || "").replace(/^claude-/, "").replace(/-\d{8}$/, "")
    var m = /^([a-z]+)-(\d+)(?:-(\d+))?$/.exec(s)
    if (!m || String(id).indexOf("claude-") !== 0) return String(id)
    return m[1].charAt(0).toUpperCase() + m[1].slice(1) + " " + m[2] + (m[3] !== undefined ? "." + m[3] : "")
  }
  function topModels(map, n) {
    var out = []
    for (var k in (map || {})) out.push({ name: modelName(k), tokens: num(map[k]) })
    out.sort(function(a, b) { return b.tokens - a.tokens })
    return out.filter(function(x) { return x.tokens > 0 }).slice(0, n)
  }
  // All-time favourite by tokens written (cache reads would crown whatever runs longest).
  function favourite(r) {
    var best = "", most = 0, usage = r && r.modelUsage ? r.modelUsage : {}
    for (var k in usage) { var o = num(usage[k].outputTokens); if (o > most) { most = o; best = k } }
    return best ? modelName(best) : ""
  }
  function lastDays(r) {
    var days = r && Array.isArray(r.recentDays) ? r.recentDays.slice(-7) : []
    return days.map(function(d) {
      var t = new Date(String(d.date) + "T12:00:00")
      return { day: isNaN(t.getTime()) ? "" : t.toLocaleString(Qt.locale("en_US"), "ddd"), tokens: num(d.messageCount) }
    })
  }
  function resetLine(l) {
    if (l.expired) return "reset · refreshing"
    var left = resetText(l.resetsAt)
    if (!left) return ""
    var at = new Date(Date.parse(l.resetsAt))
    return "resets in " + left + " · " + at.toLocaleString(Qt.locale("en_US"), Date.parse(l.resetsAt) - now < 20 * 3600000 ? "HH:mm" : "ddd HH:mm")
  }
  function agoText(iso) {
    var t = Date.parse(String(iso || ""))
    if (!(t > 0)) return ""
    var m = Math.max(0, Math.round((now - t) / 60000))
    return m < 1 ? "updated just now" : m < 60 ? "updated " + m + " min ago" : "updated " + Math.floor(m / 60) + " h ago"
  }
  // What the agent says about itself: sign-in trouble, a closed app, a cache.
  function statusOf(r) {
    if (!r) return { text: "", urgent: false }
    var status = String(r.usageStatusText || ""), help = String(r.authHelpText || "")
    if (r.ready === false) return { text: [status, help].filter(Boolean).join(" · "), urgent: true }
    if (!r.limits.length && status) return { text: status + (help ? " · " + help : ""), urgent: false }
    if (r.limitsStale === true) return { text: "Limits from an earlier check", urgent: false }
    return { text: status, urgent: false }
  }

  // ---------------------------------------------------------------- layout
  function previewData() { return { items: items, ringItems: ringItems, pal: pal } }
  readonly property bool hidden: variant === "ondemand" && !(tightest && tightest.percent >= 0.75)
  visible: !hidden
  implicitHeight: barSize
  implicitWidth: hidden ? 0 : quotaFace.implicitWidth + Style.space(8)

  QuotaFace {
    id: quotaFace
    x: Style.space(4)
    height: root.barSize
    variant: root.variant
    barSize: root.barSize
    fg: root.fg
    pal: root.pal
    metal: Bridge.ModuleBus.metal
    items: root.items
    ringItems: root.ringItems
    hoverBoost: area.containsMouse ? 0.35 : 0
    Connections { target: Bridge.ModuleBus; function onMetalPulse() { quotaFace.play() } }
  }

  MouseArea {
    id: area
    anchors.fill: parent
    hoverEnabled: true
    acceptedButtons: Qt.LeftButton | Qt.MiddleButton
    cursorShape: Qt.PointingHandCursor
    onClicked: function(m) {
      if (m.button === Qt.MiddleButton) { if (root.bar) root.bar.run("omarchy-agent-usage-update --force"); return }
      root.togglePopup()
    }
  }

  // A quota ring with the agent's initial: the bar's rings and the popup's tabs.
  // percent < 0 (no numbers): only the track, the initial dimmed.
  // Metal family (material.metal.rings): a chrome ring whose bright arc is
  // the quota, the rest of it dark chrome; from 90 % the metal turns the
  // signal colour. It glints with the bar's pulse and brightens on hover.
  component Ring: Item {
    id: ring
    property real percent: -1
    property string letter: "?"
    property color ink: root.fg
    property int letterPx: Style.font.caption - 1
    property real boost: 0
    readonly property var metal: Bridge.ModuleBus.metal && Bridge.ModuleBus.metal.rings !== false ? Bridge.ModuleBus.metal : null
    function play() { metalRing.play() }
    Canvas {
      id: cv
      anchors.fill: parent
      visible: !ring.metal
      onPaint: {
        var c = getContext("2d"); c.reset()
        var r = width / 2 - 2
        c.lineWidth = Math.max(2, width * 0.13)
        c.strokeStyle = Util.alpha(ring.ink, ring.percent < 0 ? 0.22 : 0.15)
        c.beginPath(); c.arc(width / 2, height / 2, r, 0, Math.PI * 2); c.stroke()
        if (ring.percent < 0) return
        c.strokeStyle = root.tone(ring.percent)
        c.beginPath(); c.arc(width / 2, height / 2, r, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0.03, Math.min(1, ring.percent))); c.stroke()
      }
    }
    onPercentChanged: cv.requestPaint()
    onInkChanged: cv.requestPaint()
    Connections { target: root; function onPalChanged() { cv.requestPaint() } }
    Root.MetalShape {
      id: metalRing
      visible: !!ring.metal
      spec: ring.metal
      kind: "ring"
      pad: 2
      x: -1; y: -1
      width: ring.width + 2; height: ring.height + 2
      tube: ring.metal ? Number(ring.metal.ring || 2.6) : 2.6
      arc: ring.percent < 0 ? 0 : Math.max(0.03, Math.min(1, ring.percent))
      dim: ring.percent < 0 ? 0.32 : 0.2
      boost: ring.boost
      tint: ring.percent >= 0.9 ? Commons.Color.urgent : (ring.metal && ring.metal.tint ? ring.metal.tint : "#f2f3f7")
      // material.metal.ringStyle 2 (readable at bar size): a solid arc in the ink with a chrome
      // head on a flat track; 1: chrome arc on a flat track; 0: chrome all round
      ringStyle: ring.metal && ring.metal.ringStyle !== undefined ? Number(ring.metal.ringStyle) : 0
      track: Util.alpha(ring.ink, ring.metal && ring.metal.light ? (ring.percent < 0 ? 0.22 : 0.16) : (ring.percent < 0 ? 0.3 : 0.26))
      ink: ring.percent >= 0.9 ? Commons.Color.urgent : (ring.metal && ring.metal.light ? "#1d1e21" : "#e6e7eb")
    }
    Text { renderType: Text.NativeRendering; anchors.centerIn: parent; text: ring.letter; font.family: Style.font.family; font.bold: true; font.pixelSize: ring.letterPx; color: Util.alpha(ring.ink, ring.percent < 0 ? 0.45 : 1) }
  }

  // ---------------------------------------------------------------- popup
  property bool popupOpen: false
  readonly property bool opened: popupOpen
  property bool popoutSwitchClosing: false
  function open() { popupOpen = true }
  onPopupOpenChanged: if (popupOpen) Bridge.ModuleBus.requestUsageRefresh("limits")
  function close() { popupOpen = false }
  function togglePopup() { popupOpen = !popupOpen }
  function closeForPopoutSwitch() { popoutSwitchClosing = true; popupOpen = false; Qt.callLater(function() { root.popoutSwitchClosing = false }) }


  // Popup text pieces.
  readonly property color popInk: Commons.Color.popups.text
  component Caption: Text { renderType: Text.NativeRendering; textFormat: Text.PlainText; font.family: Style.font.family; font.pixelSize: Style.font.caption; color: Util.alpha(root.popInk, 0.55) }
  component Section: Text { renderType: Text.NativeRendering; textFormat: Text.PlainText; font.family: Style.font.family; font.pixelSize: Math.max(10, Style.font.body - 3); font.letterSpacing: Style.space(2.5); color: Util.alpha(root.popInk, 0.6); topPadding: Style.space(4) }
  // Metal family (material.metal.meters): a chrome cylinder filled up to the
  // value, the rest the material's track; 0 % shows the track only.
  component Meter: Item {
    id: meter
    property real value: 0
    property color fill: root.popInk
    // a quota (the signal colour from 90 %) or just a share (the models of the day)
    property bool alarm: true
    height: Style.space(6)
    readonly property var metal: Bridge.ModuleBus.metal && Bridge.ModuleBus.metal.meters !== false ? Bridge.ModuleBus.metal : null
    Rectangle {
      visible: !meter.metal
      anchors.fill: parent
      color: Util.alpha(root.popInk, 0.12)
      Rectangle { width: meter.width * Math.min(1, Math.max(0, meter.value)); height: meter.height; color: meter.fill }
    }
    Root.MetalShape {
      visible: !!meter.metal
      spec: meter.metal
      kind: "pill"
      pad: 2
      x: -2; y: -2
      width: meter.width + 4; height: meter.height + 4
      arc: Math.min(1, Math.max(0, meter.value))
      track: meter.metal && meter.metal.track ? meter.metal.track : Util.alpha(root.popInk, 0.12)
      tint: meter.alarm && meter.value >= 0.9 ? Commons.Color.urgent : (meter.metal && meter.metal.tint ? meter.metal.tint : "#f2f3f7")
    }
  }

  KeyboardPanel {
    id: popup
    anchorItem: root
    owner: root
    bar: root.bar
    open: root.popupOpen
    focusTarget: popupKeys
    contentWidth: Style.space(440)
    contentHeight: popup.fittedContentHeight(list.implicitHeight)

    // Theme material: the popup rolls out of the bar as a card.
    Root.BarMaterialCard { panel: popup; material: Bridge.ModuleBus.material }

    Item {
      id: popupKeys
      anchors.fill: parent
      focus: true
      readonly property color ink: root.popInk
      readonly property var rec: root.shown
      readonly property var lims: root.limitsOf(rec)
      readonly property var status: root.statusOf(rec)
      readonly property var today: rec ? root.topModels(rec.todayTokensByModel, 3) : []
      readonly property var days: root.lastDays(rec)
      readonly property real dayMax: Math.max(1, Math.max.apply(null, days.map(function(d) { return d.tokens }).concat([0])))
      readonly property bool localStats: !!rec && rec.hasLocalStats !== false && (root.num(rec.totalPrompts) > 0 || root.num(rec.todayTotalTokens) > 0 || days.length > 0)

      Keys.onPressed: function(e) {
        if (e.key === Qt.Key_Escape) root.close()
        else if (e.key === Qt.Key_Left || e.key === Qt.Key_H || e.key === Qt.Key_Backtab) root.step(-1)
        else if (e.key === Qt.Key_Right || e.key === Qt.Key_L || e.key === Qt.Key_Tab) root.step(1)
        else if (e.key === Qt.Key_R) { if (root.bar) root.bar.run("omarchy-agent-usage-update --force") }
        else if (e.key >= Qt.Key_1 && e.key <= Qt.Key_9 && e.key - Qt.Key_1 < root.agentIds.length) root.selectedId = root.agentIds[e.key - Qt.Key_1]
        else return
        e.accepted = true
      }
      WheelHandler { onWheel: function(e) { root.step(e.angleDelta.y > 0 ? -1 : 1) } }

      Column {
        id: list
        width: parent.width
        spacing: Style.space(8)

        // The agents: a ring each (its fullest window), the shown one named.
        Row {
          id: tabs
          spacing: Style.space(4)
          Repeater {
            model: root.agentIds
            Rectangle {
              id: tab
              required property string modelData
              required property int index
              readonly property bool current: modelData === root.shownId
              readonly property var r: root.providers[modelData]
              width: tabRow.implicitWidth + Style.space(14)
              height: Style.space(30)
              radius: Math.min(Style.cornerRadius, 3)
              color: current ? Util.alpha(popupKeys.ink, 0.1) : tabMouse.containsMouse ? Util.alpha(popupKeys.ink, 0.05) : "transparent"
              Row {
                id: tabRow
                anchors.centerIn: parent
                spacing: Style.space(6)
                Ring {
                  anchors.verticalCenter: parent.verticalCenter
                  width: Style.space(20); height: width
                  ink: popupKeys.ink
                  letterPx: Math.max(8, Style.font.caption - 2)
                  percent: root.peakOf(tab.r)
                  letter: root.letters[tab.modelData] || "?"
                }
                Text { renderType: Text.NativeRendering; textFormat: Text.PlainText; anchors.verticalCenter: parent.verticalCenter
                  text: root.names[tab.modelData] || (tab.r ? tab.r.name : tab.modelData)
                  font.family: Style.font.family; font.bold: tab.current; font.pixelSize: Style.font.bodySmall
                  color: Util.alpha(popupKeys.ink, tab.current ? 1 : 0.6) }
              }
              Rectangle { visible: tab.current; anchors.bottom: parent.bottom; x: Style.space(7); width: parent.width - Style.space(14); height: 2; color: popupKeys.ink }
              MouseArea { id: tabMouse; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: root.selectedId = tab.modelData }
            }
          }
        }

        Text { renderType: Text.NativeRendering; textFormat: Text.PlainText; visible: !popupKeys.rec; width: list.width; wrapMode: Text.WordWrap
          text: "No AI usage records yet. They appear in ~/.local/state/omarchy/agents/usage once an agent has run."
          font.family: Style.font.family; font.pixelSize: Style.font.body; color: popupKeys.ink }

        // Name, plan, freshness.
        Item {
          visible: !!popupKeys.rec
          width: list.width
          height: Math.max(nameRow.implicitHeight, ago.implicitHeight)
          Row {
            id: nameRow
            spacing: Style.space(8)
            width: parent.width - ago.implicitWidth - Style.space(8)
            Text { id: agentName; renderType: Text.NativeRendering; textFormat: Text.PlainText; text: popupKeys.rec ? popupKeys.rec.name : ""; font.family: Style.font.family; font.bold: true; font.pixelSize: Style.font.title; color: popupKeys.ink }
            Text { renderType: Text.NativeRendering; textFormat: Text.PlainText; anchors.baseline: agentName.baseline
              text: popupKeys.rec ? String(popupKeys.rec.tierLabel || "") : ""; font.family: Style.font.family; font.pixelSize: Style.font.body; color: Util.alpha(popupKeys.ink, 0.6) }
          }
          Caption { id: ago; anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter; text: popupKeys.rec ? root.agoText(popupKeys.rec.updatedAt) : "" }
        }
        Text { renderType: Text.NativeRendering; textFormat: Text.PlainText
          visible: popupKeys.status.text !== ""
          width: list.width; wrapMode: Text.WordWrap
          text: popupKeys.status.text
          font.family: Style.font.family; font.pixelSize: Style.font.bodySmall
          color: popupKeys.status.urgent ? Commons.Color.urgent : Util.alpha(popupKeys.ink, 0.7) }

        // Limits: label and reset on one line, the meter and the level under it;
        // a prepaid balance shows its value and the ledger note instead.
        Section { visible: popupKeys.lims.length > 0; text: popupKeys.lims.some(function(l) { return !l.noQuota }) ? "LIMITS" : "BALANCE" }
        Repeater {
          model: popupKeys.lims
          Column {
            required property var modelData
            width: list.width
            spacing: Style.space(3)
            Item {
              width: parent.width
              height: Math.max(limLabel.implicitHeight, limReset.implicitHeight)
              Text { id: limLabel; renderType: Text.NativeRendering; textFormat: Text.PlainText; width: parent.width - limReset.implicitWidth - Style.space(8); elide: Text.ElideRight
                text: modelData.label; font.family: Style.font.family; font.pixelSize: Style.font.body; color: popupKeys.ink }
              Caption { id: limReset; anchors.right: parent.right; anchors.verticalCenter: parent.verticalCenter; text: modelData.noQuota ? "" : root.resetLine(modelData) }
            }
            Row {
              visible: !modelData.noQuota
              width: parent.width
              spacing: Style.space(8)
              Meter { anchors.verticalCenter: parent.verticalCenter; width: parent.width - limPct.width - Style.space(8); value: modelData.percent; fill: root.tone(modelData.percent) }
              Text { id: limPct; renderType: Text.NativeRendering; textFormat: Text.PlainText; width: Style.space(40); horizontalAlignment: Text.AlignRight
                text: Math.round(modelData.percent * 100) + "%"; font.family: Style.font.family; font.bold: true; font.pixelSize: Style.font.body; color: popupKeys.ink }
            }
            Text { renderType: Text.NativeRendering; textFormat: Text.PlainText; visible: modelData.noQuota && modelData.value !== ""
              text: modelData.value.replace(/^USD\s*/, "$"); font.family: Style.font.family; font.bold: true; font.pixelSize: Style.font.title; color: popupKeys.ink }
            Caption { visible: modelData.noQuota && modelData.detail !== ""; width: parent.width; wrapMode: Text.WordWrap; text: modelData.detail }
          }
        }

        // Today: prompts, sessions, tokens, and the models that used them.
        Section { visible: popupKeys.localStats && root.num(popupKeys.rec.todayTotalTokens) + root.num(popupKeys.rec.todayPrompts) > 0; text: "TODAY" }
        Text { renderType: Text.NativeRendering; textFormat: Text.PlainText
          visible: popupKeys.localStats && root.num(popupKeys.rec.todayTotalTokens) + root.num(popupKeys.rec.todayPrompts) > 0
          width: list.width; wrapMode: Text.WordWrap
          text: popupKeys.rec ? [root.count(popupKeys.rec.todayPrompts) + " prompts", root.count(popupKeys.rec.todaySessions) + " sessions",
                                 root.tokens(popupKeys.rec.todayTotalTokens) + " tokens"].join("  ·  ") : ""
          font.family: Style.font.family; font.pixelSize: Style.font.body; color: popupKeys.ink }
        Repeater {
          model: popupKeys.localStats ? popupKeys.today : []
          Row {
            required property var modelData
            width: list.width
            spacing: Style.space(8)
            Text { renderType: Text.NativeRendering; textFormat: Text.PlainText; width: Style.space(120); elide: Text.ElideRight; anchors.verticalCenter: parent.verticalCenter
              text: modelData.name; font.family: Style.font.family; font.pixelSize: Style.font.bodySmall; color: Util.alpha(popupKeys.ink, 0.8) }
            Meter { anchors.verticalCenter: parent.verticalCenter; height: Style.space(4); width: parent.width - Style.space(120) - todayTok.width - Style.space(16)
              value: modelData.tokens / Math.max(1, popupKeys.today[0].tokens); fill: Util.alpha(popupKeys.ink, 0.6); alarm: false }
            Caption { id: todayTok; width: Style.space(48); horizontalAlignment: Text.AlignRight; anchors.verticalCenter: parent.verticalCenter; text: root.tokens(modelData.tokens) }
          }
        }

        // The last seven days: tokens per day.
        Item {
          visible: popupKeys.localStats && popupKeys.days.length > 1
          width: list.width
          height: weekTitle.implicitHeight
          Section { id: weekTitle; text: "LAST 7 DAYS" }
          Caption { anchors.right: parent.right; anchors.bottom: parent.bottom
            text: root.tokens(popupKeys.days.reduce(function(a, d) { return a + d.tokens }, 0)) + " tokens" }
        }
        Row {
          visible: popupKeys.localStats && popupKeys.days.length > 1
          width: list.width
          spacing: Style.space(6)
          Repeater {
            model: popupKeys.localStats ? popupKeys.days : []
            Column {
              required property var modelData
              required property int index
              width: (list.width - Style.space(6) * (popupKeys.days.length - 1)) / Math.max(1, popupKeys.days.length)
              spacing: Style.space(3)
              Item {
                width: parent.width; height: Style.space(30)
                Rectangle {
                  anchors.bottom: parent.bottom
                  width: parent.width; height: Math.max(1, parent.height * modelData.tokens / popupKeys.dayMax)
                  color: Util.alpha(popupKeys.ink, index === popupKeys.days.length - 1 ? 0.85 : 0.35)
                }
              }
              Caption { width: parent.width; horizontalAlignment: Text.AlignHCenter; text: modelData.day }
            }
          }
        }

        // All time.
        Section { visible: popupKeys.localStats && root.num(popupKeys.rec.totalPrompts) + root.num(popupKeys.rec.activeDays) > 0; text: "ALL TIME" }
        Text { renderType: Text.NativeRendering; textFormat: Text.PlainText
          visible: popupKeys.localStats && root.num(popupKeys.rec.totalPrompts) + root.num(popupKeys.rec.activeDays) > 0
          width: list.width; wrapMode: Text.WordWrap
          text: popupKeys.rec ? [root.count(popupKeys.rec.totalPrompts) + " prompts", root.count(popupKeys.rec.totalSessions) + " sessions",
                                 root.count(popupKeys.rec.activeDays) + " active days"].join("  ·  ") : ""
          font.family: Style.font.family; font.pixelSize: Style.font.bodySmall; color: Util.alpha(popupKeys.ink, 0.8) }
        Caption { visible: popupKeys.localStats && root.favourite(popupKeys.rec) !== ""; text: "Most used model: " + root.favourite(popupKeys.rec) }

        Caption { topPadding: Style.space(2); width: list.width; wrapMode: Text.WordWrap
          text: (root.agentIds.length > 1 ? "← → or scroll: agents  ·  " : "") + "r: refresh" }
      }
    }
  }
}
