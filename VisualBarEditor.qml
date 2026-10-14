import QtQuick
import qs.Commons
import qs.Commons as Commons
import "Presets.js" as Presets
import "VisualEditor.js" as Visual

// Parent owns staging and Use / Save / Cancel. This component emits choices,
// but hover/focus only changes its private proof. No engine or ModuleBus.
Item {
  id: root
  property var options: ({})
  property var liveOptions: ({})
  property var snapshot: ({})
  property var material: null
  property string selectedPart: "workspaces"
  property bool showPresets: true
  property bool showMotion: true
  property string hoverKey: ""
  property string hoverValue: ""
  readonly property var staged: Presets.normalizeOptions(options)
  readonly property var proofOptions: Visual.previewOptions(staged, hoverKey, hoverValue)
  readonly property bool previewing: hoverKey !== "" && staged[hoverKey] !== hoverValue
  readonly property var currentElement: Presets.ELEMENTS[selectedPart] || Presets.ELEMENTS.workspaces
  readonly property var variants: currentElement.variants
  signal picked(string key, string value)
  signal presetPicked(string id)
  implicitHeight: body.implicitHeight
  onSelectedPartChanged: clearPreview()
  onVisibleChanged: if (!visible) clearPreview()
  function clearPreview() { hoverKey = ""; hoverValue = "" }
  function preview(key, value) { hoverKey = key; hoverValue = value }
  function stage(key, value) { if (Visual.valid(key, value)) picked(key, value) }

  component Label: Text {
    textFormat: Text.PlainText
    renderType: Text.NativeRendering
    font.family: Style.font.family
    font.pixelSize: Style.font.bodySmall
    color: Commons.Color.popups.text
    wrapMode: Text.Wrap
  }
  component Heading: Label { font.pixelSize: Style.font.body; font.bold: true }
  component Note: Label { font.pixelSize: Style.font.caption; opacity: 0.65 }

  Column {
    id: body
    width: root.width
    spacing: Style.space(12)
    Heading { width: parent.width; text: "Your bar · preview" }
    Note {
      width: parent.width
      text: "Select a part to see its variants. Hover or keyboard focus previews; click, Enter or Space stages a choice. Use / Save applies it."
    }
    BarSpecimen {
      width: parent.width
      height: implicitHeight
      options: root.proofOptions
      snapshot: root.snapshot
      material: root.staged.edge === "theme" ? root.material : null
      selectedPart: root.selectedPart
      interactive: true
      onPartPicked: function(key) { root.selectedPart = key }
    }
    Label {
      width: parent.width
      text: root.previewing
        ? "Preview only · " + Presets.ELEMENTS[root.hoverKey].label + ": " + Visual.valueLabel(root.hoverKey, root.hoverValue)
        : "Staged view · the live bar stays unchanged until Use or Save"
      color: root.previewing ? Commons.Color.accent : Commons.Color.popups.text
      font.pixelSize: Style.font.caption
    }
    Rectangle { width: parent.width; height: 1; color: Util.alpha(Commons.Color.popups.text, 0.12) }
    Heading { width: parent.width; text: root.currentElement.label + " variants" }
    Item {
      id: cards
      width: parent.width
      readonly property int columns: width >= Style.space(470) ? 2 : 1
      readonly property real gap: Style.space(8)
      readonly property real cardWidth: (width - gap * (columns - 1)) / columns
      readonly property real cardHeight: Style.space(176)
      height: Math.ceil(root.variants.length / columns) * (cardHeight + gap) - gap
      Repeater {
        model: root.variants
        delegate: FocusScope {
          id: variantCard
          required property var modelData
          required property int index
          readonly property bool selected: root.staged[root.selectedPart] === modelData.id
          readonly property bool live: Presets.normalizeOptions(root.liveOptions)[root.selectedPart] === modelData.id
          readonly property bool hovered: pointer.containsMouse
          x: (index % cards.columns) * (cards.cardWidth + cards.gap)
          y: Math.floor(index / cards.columns) * (cards.cardHeight + cards.gap)
          width: cards.cardWidth; height: cards.cardHeight
          activeFocusOnTab: true
          Accessible.role: Accessible.Button
          Accessible.name: modelData.label + (selected ? ", staged" : "") + (live ? ", live" : "")
          Accessible.description: Visual.help(root.selectedPart, modelData.id)
          Accessible.onPressAction: root.stage(root.selectedPart, modelData.id)
          Keys.onReturnPressed: root.stage(root.selectedPart, modelData.id)
          Keys.onEnterPressed: root.stage(root.selectedPart, modelData.id)
          Keys.onSpacePressed: root.stage(root.selectedPart, modelData.id)
          onActiveFocusChanged: {
            if (activeFocus) root.preview(root.selectedPart, modelData.id)
            else if (!hovered && root.hoverValue === modelData.id) root.clearPreview()
          }
          Rectangle {
            anchors.fill: parent
            color: Util.alpha(Commons.Color.popups.text, variantCard.selected ? 0.05 : variantCard.hovered ? 0.025 : 0)
            border.width: variantCard.selected || variantCard.activeFocus ? 2 : 1
            border.color: variantCard.selected || variantCard.activeFocus ? Commons.Color.accent : Util.alpha(Commons.Color.popups.text, 0.15)
          }
          Column {
            anchors.fill: parent
            anchors.margins: Style.space(10)
            spacing: Style.space(6)
            Label {
              width: parent.width
              text: variantCard.modelData.label
              font.bold: variantCard.selected
              maximumLineCount: 1; elide: Text.ElideRight
            }
            BarSpecimen {
              width: parent.width
              height: implicitHeight
              part: root.selectedPart
              options: Visual.previewOptions(root.staged, root.selectedPart, variantCard.modelData.id)
              snapshot: root.snapshot
              material: root.staged.edge === "theme" ? root.material : null
            }
            Note {
              width: parent.width
              text: (variantCard.selected ? "Staged" : "Choose") + (variantCard.live ? " · Live" : "")
              color: variantCard.selected ? Commons.Color.accent : Commons.Color.popups.text
            }
            Note {
              width: parent.width
              text: Visual.help(root.selectedPart, variantCard.modelData.id)
              maximumLineCount: 2; elide: Text.ElideRight
            }
          }
          MouseArea {
            id: pointer
            anchors.fill: parent
            hoverEnabled: true
            cursorShape: Qt.PointingHandCursor
            onEntered: root.preview(root.selectedPart, variantCard.modelData.id)
            onExited: if (!variantCard.activeFocus && root.hoverValue === variantCard.modelData.id) root.clearPreview()
            onClicked: { variantCard.forceActiveFocus(); root.stage(root.selectedPart, variantCard.modelData.id) }
          }
        }
      }
    }
    Note {
      width: parent.width
      text: "Current values are shown where available. Original widgets are labelled; quiet and unavailable states are kept as they are."
    }
    Column {
      width: parent.width
      spacing: Style.space(8)
      visible: root.showPresets
      Heading { width: parent.width; text: "What a preset changes" }
      Note { width: parent.width; text: "Compared with the staged view. Your material and other look settings are preserved." }
      Repeater {
        model: root.showPresets ? Presets.PRESETS : []
        delegate: FocusScope {
          id: presetCard
          required property var modelData
          width: parent.width
          height: presetContent.implicitHeight + Style.space(20)
          activeFocusOnTab: true
          Accessible.role: Accessible.Button
          Accessible.name: "Stage preset " + modelData.label
          Accessible.description: Visual.presetDifference(root.staged, modelData)
          Accessible.onPressAction: root.presetPicked(modelData.id)
          Keys.onReturnPressed: root.presetPicked(modelData.id)
          Keys.onEnterPressed: root.presetPicked(modelData.id)
          Keys.onSpacePressed: root.presetPicked(modelData.id)
          Rectangle {
            anchors.fill: parent
            color: presetPointer.containsMouse ? Util.alpha(Commons.Color.popups.text, 0.04) : "transparent"
            border.width: presetCard.activeFocus ? 2 : 1
            border.color: presetCard.activeFocus ? Commons.Color.accent : Util.alpha(Commons.Color.popups.text, 0.15)
          }
          Column {
            id: presetContent
            x: Style.space(10); y: Style.space(10)
            width: parent.width - Style.space(20)
            spacing: Style.space(4)
            Label { width: parent.width; font.bold: true; text: presetCard.modelData.label + " · " + presetCard.modelData.note }
            Note { width: parent.width; text: Visual.presetDifference(root.staged, presetCard.modelData) }
          }
          MouseArea { id: presetPointer; anchors.fill: parent; hoverEnabled: true; cursorShape: Qt.PointingHandCursor; onClicked: { presetCard.forceActiveFocus(); root.presetPicked(presetCard.modelData.id) } }
        }
      }
    }
    MotionPreview {
      visible: root.showMotion
      width: parent.width
      height: visible ? implicitHeight : 0
      material: root.material
      options: root.staged
    }
  }
}
