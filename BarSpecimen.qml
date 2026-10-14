import QtQuick
import qs.Commons
import qs.Commons as Commons
import "modules" as Modules
import "Presets.js" as Presets
import "VisualEditor.js" as Visual

// Selectable real bar faces, separated into a proof so every part stays at
// readable, native scale. Never instantiate the service-owning bar modules.
Item {
  id: root
  property var options: ({})
  property var snapshot: ({})
  property var material: null
  property string part: ""              // empty: the complete four-part proof
  property string selectedPart: ""
  property bool interactive: false
  property int barSize: Style.bar.sizeHorizontal
  property color foreground: Commons.Color.bar.text
  property color background: Qt.rgba(Commons.Color.bar.background.r, Commons.Color.bar.background.g, Commons.Color.bar.background.b, 1)
  readonly property color strong: material && material.tones && material.tones.strong ? material.tones.strong : foreground
  readonly property color accent: Commons.Color.accent
  readonly property color urgent: Commons.Color.urgent
  readonly property var opts: Presets.normalizeOptions(options)
  readonly property bool hasWorkspaces: !!snapshot && !!snapshot.workspaces
  readonly property bool hasQuota: !!snapshot && !!snapshot.quota
  readonly property bool hasStatus: !!snapshot && !!snapshot.status
  // Keep the data shape safe while a Loader tears down its previous face.
  readonly property var ws: hasWorkspaces ? snapshot.workspaces : ({})
  readonly property var quota: hasQuota ? snapshot.quota : ({})
  readonly property var status: hasStatus ? snapshot.status : ({})
  readonly property var quiet: Visual.quietMaterial(material)
  readonly property var metal: quiet && quiet.metal ? quiet.metal : null
  readonly property var parts: part ? [part] : Visual.PARTS
  readonly property int columns: part ? 1 : width >= Style.space(760) ? 4 : 2
  readonly property real cellHeight: barSize + Style.space(43)
  implicitHeight: Math.ceil(parts.length / columns) * cellHeight + (part ? 0 : Style.space(8))
  signal partPicked(string key)

  component Label: Text {
    textFormat: Text.PlainText
    renderType: Text.NativeRendering
    font.family: Style.font.family
    font.pixelSize: Style.font.caption
    color: Commons.Color.popups.text
  }
  component Missing: Label {
    anchors.centerIn: parent
    opacity: 0.65
    color: root.foreground
  }
  Repeater {
    model: root.parts
    delegate: FocusScope {
      id: cell
      required property string modelData
      required property int index
      readonly property bool selected: root.interactive && root.selectedPart === modelData
      x: (index % root.columns) * (root.width / root.columns)
      y: Math.floor(index / root.columns) * root.cellHeight
      width: root.width / root.columns - (root.part ? 0 : Style.space(6))
      height: root.cellHeight - Style.space(6)
      activeFocusOnTab: root.interactive
      Accessible.role: Accessible.Button
      Accessible.name: Presets.ELEMENTS[modelData].label
      Accessible.description: "Select this part to see its variants"
      Accessible.onPressAction: if (root.interactive) root.partPicked(modelData)
      Keys.onReturnPressed: if (root.interactive) root.partPicked(modelData)
      Keys.onEnterPressed: if (root.interactive) root.partPicked(modelData)
      Keys.onSpacePressed: if (root.interactive) root.partPicked(modelData)
      Label {
        x: Style.space(8)
        text: Presets.ELEMENTS[cell.modelData].label
        color: cell.selected ? root.accent : Commons.Color.popups.text
      }
      Rectangle {
        y: Style.space(22)
        width: parent.width
        height: root.barSize + Style.space(12)
        color: root.background
        border.width: cell.selected || cell.activeFocus ? 2 : 1
        border.color: cell.selected || cell.activeFocus ? root.accent : Util.alpha(Commons.Color.popups.text, 0.16)
        clip: true
        Loader {
          id: face
          anchors.centerIn: parent
          height: root.barSize
          width: item ? Math.min(parent.width - Style.space(12), item.implicitWidth || item.width) : 0
          sourceComponent: cell.modelData === "logo" ? logoFace
            : cell.modelData === "workspaces" ? workspaceFace
            : cell.modelData === "ai" ? quotaFace : statusFace
        }
      }
      MouseArea {
        anchors.fill: parent
        enabled: root.interactive
        cursorShape: Qt.PointingHandCursor
        onClicked: { cell.forceActiveFocus(); root.partPicked(cell.modelData) }
      }
    }
  }

  Component {
    id: logoFace
    Item {
      implicitWidth: Style.space(44)
      height: root.barSize
      readonly property bool numbered: root.opts.workspaces === "logo" && root.part !== "logo"
      Text {
        visible: !parent.numbered && root.opts.logo === "omarchy"
        textFormat: Text.PlainText
        renderType: Text.NativeRendering
        anchors.centerIn: parent
        text: ""
        font.family: "omarchy"
        font.pixelSize: Style.font.icon + 2
        color: root.strong
      }
      Loader {
        active: !parent.numbered && root.opts.logo === "arch"
        anchors.centerIn: parent
        sourceComponent: Component { Modules.ArchLogo { size: 18 * 1.18; color: root.strong } }
      }
      Loader {
        active: !parent.numbered && root.opts.logo === "nerdibeard"
        anchors.horizontalCenter: parent.horizontalCenter
        y: Math.round((root.barSize - 16) / 2) + 1
        sourceComponent: Component { Modules.SealLogo { ink: root.strong } }
      }
      MetalShape {
        visible: !!root.metal && root.metal.logo === true && !parent.numbered
        spec: root.metal
        pad: 2; tube: 1.4; radius: 3
        width: 26; height: 26
        anchors.centerIn: parent
        anchors.verticalCenterOffset: 1
      }
      Rectangle {
        visible: parent.numbered
        anchors.centerIn: parent
        width: Math.round(root.barSize * 0.68); height: width
        color: "transparent"
        border.width: Math.max(1, Style.space(1.5)); border.color: root.strong
        radius: Math.min(Style.cornerRadius, 3)
        Text {
          textFormat: Text.PlainText; renderType: Text.NativeRendering
          anchors.centerIn: parent
          text: root.hasWorkspaces ? (root.ws.active === 10 ? "0" : String(root.ws.active)) : "–"
          font.family: Style.font.family; font.bold: true; font.pixelSize: Style.font.body + 1
          color: root.accent
        }
      }
    }
  }
  Component {
    id: workspaceFace
    Item {
      implicitWidth: loader.item ? loader.item.implicitWidth : 0
      Loader {
        id: loader
        height: root.barSize
        sourceComponent: root.opts.workspaces === "today" || !root.hasWorkspaces ? noWorkspaces
          : root.part === "workspaces" && root.opts.workspaces === "logo" ? numberedWorkspaces : realWorkspaces
      }
    }
  }
  Component {
    id: numberedWorkspaces
    Row {
      height: root.barSize
      spacing: Style.space(4)
      Loader { height: root.barSize; sourceComponent: logoFace }
      Loader { height: root.barSize; sourceComponent: realWorkspaces }
    }
  }
  Component {
    id: noWorkspaces
    Item { implicitWidth: Style.space(142); height: root.barSize; Missing { text: root.opts.workspaces === "today" ? "Native workspaces" : "No live workspaces" } }
  }
  Component {
    id: realWorkspaces
    Modules.WorkspacesFace {
      variant: root.opts.workspaces
      ids: root.ws.ids || []
      occupiedIds: root.ws.occupiedIds || []
      active: root.ws.active || 1
      windowCounts: root.ws.windowCounts || ({})
      urgentIds: root.ws.urgentIds || []
      geometry: root.ws.geometry || ({})
      workspaceLabels: root.ws.workspaceLabels || ({})
      barSize: root.barSize
      fg: root.foreground; accent: root.accent; strong: root.strong; urgentColor: root.urgent
      barColor: root.background
      barLight: 0.2126 * root.background.r + 0.7152 * root.background.g + 0.0722 * root.background.b > 0.55
      interactive: false
    }
  }
  Component {
    id: quotaFace
    Item {
      implicitWidth: loader.item ? loader.item.implicitWidth : 0
      Loader { id: loader; height: root.barSize; sourceComponent: root.opts.ai === "today" || !root.hasQuota ? noQuota : realQuota }
    }
  }
  Component {
    id: noQuota
    Item { implicitWidth: Style.space(145); height: root.barSize; Missing { text: root.opts.ai === "today" ? "Native AI widgets" : "No live quota data" } }
  }
  Component {
    id: realQuota
    Item {
      implicitWidth: face.hidden ? Style.space(145) : face.implicitWidth
      height: root.barSize
      Modules.QuotaFace {
        id: face
        variant: root.opts.ai; barSize: root.barSize
        fg: root.foreground; accent: root.accent; urgent: root.urgent
        pal: root.quota.pal || ({})
        metal: root.metal
        items: root.quota.items || []
        ringItems: root.quota.ringItems || []
      }
      Missing { visible: face.hidden; text: "Quiet · below 75%" }
    }
  }
  Component {
    id: statusFace
    Item {
      implicitWidth: loader.item ? loader.item.implicitWidth : 0
      Loader { id: loader; height: root.barSize; sourceComponent: root.opts.right === "today" || !root.hasStatus ? noStatus : realStatus }
    }
  }
  Component {
    id: noStatus
    Item { implicitWidth: Style.space(145); height: root.barSize; Missing { text: root.opts.right === "today" ? "Native status widgets" : "No live status data" } }
  }
  Component {
    id: realStatus
    Row {
      height: root.barSize
      spacing: Style.space(2)
      readonly property var faces: root.opts.right === "groups"
        ? (root.status.groups || ["net", "phone", "system"]).map(function(group) { return {group:group} })
        : (root.status.deviations || []).map(function(d) { return {glyph:d.glyph || "", chip:!!d.chip, tone:d.color || root.foreground} })
          .concat([{glyph:"\u{f01d8}", tone:Util.alpha(root.foreground,0.7)}])
      Repeater {
        model: parent.faces
        Modules.StatusFace {
          required property var modelData
          width: modelData.group === "phone" ? Style.space(58) : root.barSize + Style.space(2)
          height: root.barSize
          group: modelData.group || ""
          glyph: modelData.glyph || ""
          chip: !!modelData.chip
          ink: root.foreground
          glyphInk: modelData.tone || root.foreground
          accent: root.accent; urgent: root.urgent
          linkInk: Commons.Color.popups.border || root.foreground
          barSize: root.barSize
          wifiUp: !!root.status.wifiUp; vpnUp: !!root.status.vpnUp
          tailscaleUp: !!root.status.tailscaleUp
          bluetoothConnected: !!root.status.bluetoothConnected
          phone: root.status.phone || null
          cpu: root.status.cpu || 0; sysHot: !!root.status.sysHot
        }
      }
    }
  }
}
