import QtQuick

// Pure, normalized geometry renderer. Safe for settings previews: no compositor,
// capture, popup, IPC, service registration or device actions.
Item {
    id: root
    property var layout: null
    property color ink: "white"
    property color accent: ink
    property color background: "black"
    property bool active: false
    property real padding: 3
    readonly property var rectangles: layout && layout.rectangles ? layout.rectangles : []
    readonly property var parked: layout && layout.offscreen ? layout.offscreen : ({})

    Item {
        id: plane
        anchors.fill: parent
        anchors.margins: root.padding
        clip: true
        Repeater {
            model: root.rectangles
            Rectangle {
                required property var modelData
                x: modelData.x * plane.width
                y: modelData.y * plane.height
                // Half a pixel of breathing space keeps adjoining tile edges
                // recognizable without replacing the compositor's proportions.
                width: Math.max(0.5, modelData.width * plane.width - 0.5)
                height: Math.max(0.5, modelData.height * plane.height - 0.5)
                color: modelData.floating ? root.background : modelData.focused ? root.accent : root.ink
                opacity: modelData.focused ? 0.95 : root.active ? 0.7 : 0.4
                border.width: modelData.floating ? 1 : 0
                border.color: modelData.focused ? root.accent : root.ink
            }
        }
    }
    // Tiny edge ticks disclose fully parked pages. The full unbounded tape
    // remains in Overview; this bar map never pretends they are on-screen.
    Rectangle { visible: Number(root.parked.left || 0) > 0; x: 1; y: parent.height / 2 - 2; width: 1; height: 4; color: root.ink }
    Rectangle { visible: Number(root.parked.right || 0) > 0; x: parent.width - 2; y: parent.height / 2 - 2; width: 1; height: 4; color: root.ink }
    Rectangle { visible: Number(root.parked.top || 0) > 0; x: parent.width / 2 - 2; y: 1; width: 4; height: 1; color: root.ink }
    Rectangle { visible: Number(root.parked.bottom || 0) > 0; x: parent.width / 2 - 2; y: parent.height - 2; width: 4; height: 1; color: root.ink }
}
