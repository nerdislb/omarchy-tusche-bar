import QtQuick
import Quickshell.Io
import "FocusSeal.js" as Model

// Where Omi is installed: the directory that setup/omi-fetch.sh names in `<dir>/current`.
// Quickshell keeps loaded files per URL, so every install lives in a directory of its own and
// this follows the pointer (a changed file is picked up at once); `url` is Omi.qml in it, or
// empty while there is no valid install.
Item {
  id: kit
  visible: false
  width: 0; height: 0

  // The data directory of the plugin (…/tusche-bar).
  property string dir: ""
  property string name: ""
  readonly property url url: name !== "" && dir !== "" ? "file://" + dir + "/" + name + "/Omi.qml" : ""

  function read() { kit.name = Model.kitDirName(pointer.text()) }

  FileView {
    id: pointer
    path: kit.dir !== "" ? kit.dir + "/current" : ""
    blockLoading: true
    watchChanges: true
    onFileChanged: { reload(); kit.read() }
    onLoadFailed: kit.name = ""
  }
  Component.onCompleted: read()
  onDirChanged: read()
}
