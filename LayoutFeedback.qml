import QtQuick
import qs.Commons as Commons
import "WorkspaceLayout.js" as WorkspaceLayout

// One instance in the engine, independent of the number of bars/outputs.
// Observe the shell's pushed snapshot; startup and workspace focus stay quiet.
Item {
  id: root
  visible: false
  width: 0; height: 0
  property bool active: false
  property var emit: null
  property var previous: null
  property int announced: 0
  property bool ready: false
  readonly property var sample: {
    if (!active) return null
    var id = Commons.Compositor.focusedWorkspaceId
    var workspaces = Commons.Compositor.workspaceList()
    for (var i = 0; i < workspaces.length; i++) {
      var workspace = workspaces[i]
      if (workspace.id === id) return { id: id, output: workspace.output, mode: workspace.layout }
    }
    return null
  }
  onSampleChanged: if (ready) sampleLater.restart()
  onActiveChanged: previous = null
  Component.onCompleted: { ready = true; sampleLater.start() }

  Timer {
    id: sampleLater
    interval: 0
    onTriggered: {
      var next = root.sample
      var label = next ? WorkspaceLayout.label(next.mode) : ""
      if (label && next.id !== -1 && root.previous && next.id === root.previous.id
          && next.output === root.previous.output
          && next.mode !== root.previous.mode && WorkspaceLayout.label(root.previous.mode)) {
        if (typeof root.emit === "function") {
          root.emit(["omarchy-osd", "-i", "󱓻", "-m", "Layout: " + label, "-d", "1800"])
          root.announced++
        }
      }
      root.previous = label && next.id !== -1 ? next : null
    }
  }
  function stateObject() {
    return { workspace: sample ? sample.id : -1, output: sample ? sample.output : "", layout: sample ? WorkspaceLayout.label(sample.mode) : "", announced: announced }
  }
}
