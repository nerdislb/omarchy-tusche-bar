import QtQuick
import Quickshell
import Quickshell.Bluetooth
import Quickshell.Networking
import Quickshell.Services.Pipewire

// What the Control Center's Sound & network area shows as live, read from
// the shell's own audio, network and Bluetooth services (the ones Omarchy's
// panels use). Read-only: nothing here changes a device, the panels do that.
// Loaded while the Control Center is open.
Item {
  id: facts

  // ---- sound: the default output and input as Pipewire names them (an
  // effects chain such as EasyEffects is the default then, under its name)
  readonly property var sink: Pipewire.defaultAudioSink
  readonly property var source: Pipewire.defaultAudioSource
  function nodeName(n) { return n ? String(n.description || n.nickname || n.name || "").trim() : "" }
  readonly property string soundLine: {
    var out = nodeName(sink), inp = nodeName(source)
    if (!out && !inp) return ""
    return (out ? "Output: " + out : "No output") + (inp ? " · Input: " + inp : "")
  }

  // ---- network: wired first, as Omarchy's panel does, then Wi-Fi
  readonly property var netDevices: Networking.devices ? Networking.devices.values : []
  function device(type) {
    var fallback = null
    for (var i = 0; i < netDevices.length; i++) {
      var d = netDevices[i]
      if (!d || d.type !== type) continue
      if (d.connected) return d
      if (!fallback) fallback = d
    }
    return fallback
  }
  readonly property var wired: device(DeviceType.Wired)
  readonly property var wifi: device(DeviceType.Wifi)
  readonly property var wifiNetwork: {
    var nets = wifi && wifi.networks ? wifi.networks.values : []
    for (var i = 0; i < nets.length; i++) if (nets[i] && nets[i].connected) return nets[i]
    return null
  }
  readonly property string wifiName: wifiNetwork ? String(wifiNetwork.name || "").trim() : ""
  readonly property string networkName: wired && wired.connected ? "Ethernet" : wifiName !== "" ? wifiName : wifi && wifi.connected ? "Wi-Fi" : ""
  readonly property string networkLine: {
    if (wired && wired.connected) return "Ethernet connected" + (wifiName ? " · Wi-Fi: " + wifiName : "")
    if (wifiName) return "Wi-Fi: " + wifiName
    if (wifi && wifi.connected) return "Wi-Fi connected"
    if (wifi && !Networking.wifiEnabled) return "Wi-Fi is off"
    return netDevices.length ? "Not connected" : ""
  }

  // ---- Bluetooth: the radio and what is connected
  readonly property var adapter: Bluetooth.defaultAdapter
  readonly property var btDevices: Bluetooth.devices ? Bluetooth.devices.values : []
  readonly property string bluetoothLine: {
    if (!adapter) return "No Bluetooth adapter"
    if (!adapter.enabled) return "Off"
    var names = []
    for (var i = 0; i < btDevices.length; i++) {
      var d = btDevices[i]
      if (!d || !d.connected) continue
      var n = String(d.deviceName || d.name || "").trim()
      if (n) names.push(n)
    }
    return names.length ? "On · connected: " + names.join(", ") : "On · nothing connected"
  }
}
