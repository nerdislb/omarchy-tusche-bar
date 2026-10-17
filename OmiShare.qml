import QtQuick
import Quickshell
import Quickshell.Io
import "OmiShare.js" as Proto

// One Omi for the whole machine: the Omi state protocol (tahayvr/omi, protocol/README.md), as a service
// in the shell. Any script or app sets what Omi is doing over a Unix socket, and the seal shows it:
//
//     echo '{"type":"set","mode":"thinking"}' | nc -U "$XDG_RUNTIME_DIR/omi.sock"
//     echo '{"type":"set","mode":"success","for":2,"then":"idle"}' | socat - UNIX-CONNECT:$XDG_RUNTIME_DIR/omi.sock
//
// Only the user's own runtime directory is used (private to them), $OMI_SOCKET overrides it. The decisions
// are OmiShare.js's; this owns the sockets and the one timer.
//
// Like the reference service it never takes over from another one: when something already answers on the
// socket (the reference Node service, say) this follows its state as a client instead, and takes over
// when it stops. A socket file nobody answers on is left over and is removed by the listening.
//
// Known limit: the socket is the user's own (their runtime directory is private), but Quickshell's line
// parser has no maximum length, so a local process of theirs that streams endless bytes without a newline
// can make the shell hold them all.
Item {
  id: share
  visible: false
  width: 0; height: 0

  property bool active: false
  // The mode ids of the kit (anything else is refused with an error), or null to accept any.
  property var modes: null
  property string name: "tusche-bar"
  readonly property string path: Proto.socketPath(Quickshell.env("OMI_SOCKET"), Quickshell.env("XDG_RUNTIME_DIR"))

  // "off", "probing" (is another service there?), "serving" (we are the service), "following" (another is).
  property string role: "off"
  property var model: ({ state: Proto.initial(Date.now()) })
  readonly property var state: model.state
  property var clients: []
  readonly property int clientCount: clients.length

  function stateObject() {
    return { role: role, path: path, mode: state.mode, from: state.from, since: state.since, clients: clientCount }
  }

  // ------------------------------------------------------------------ lifecycle

  onActiveChanged: if (active) begin(); else end()
  Component.onCompleted: if (active) begin()

  function begin() {
    if (path === "" || role !== "off") return          // (a start while one is under way is none)
    role = "probing"
    probe.connected = false
    probe.connected = true
    probeTimeout.restart()
  }
  function end() {
    role = "off"                                        // (first: closing the probe must not look like a service going away)
    probeTimeout.stop(); retry.stop(); ttl.stop()
    probe.connected = false
    clients = []
    model = { state: Proto.initial(Date.now()) }
  }
  function serve() {
    probeTimeout.stop()
    probe.connected = false
    role = "serving"
  }

  // Is anything answering? Then we follow it; else (no file, or one nobody answers on) we serve.
  Socket {
    id: probe
    path: share.path
    parser: SplitParser { onRead: data => share.upstream(data) }
    onConnectedChanged: {
      if (connected && share.role === "probing") {
        share.role = "following"
        probeTimeout.stop()
        write(JSON.stringify({ type: "hello", name: share.name }) + "\n")
        flush()
      } else if (!connected && share.role === "following") {
        share.role = "off"
        retry.restart()
      }
    }
    onError: if (share.role === "probing") share.serve()
  }
  Timer { id: probeTimeout; interval: 800; onTriggered: if (share.role === "probing" && !probe.connected) share.serve() }
  // The service we followed went away: look again, we may be the service now.
  Timer { id: retry; interval: 2000; onTriggered: if (share.active) share.begin() }

  function upstream(line) {
    var msg
    try { msg = JSON.parse(line) } catch (e) { return }
    var next = Proto.follow(model, msg, modes)
    if (next) model = next
  }

  // ------------------------------------------------------------------ serving

  SocketServer {
    id: server
    active: share.role === "serving"
    path: share.path
    handler: Socket {
      id: client
      parser: SplitParser { onRead: data => share.line(client, data) }
      // (the connection may be announced after the object exists, or already be there)
      Component.onCompleted: if (connected) share.attach(client)
      Component.onDestruction: share.detach(client)
      onConnectedChanged: if (connected) share.attach(client); else share.detach(client)
    }
  }

  function send(socket, msg) {
    if (!socket || !socket.connected) return
    socket.write(JSON.stringify(msg) + "\n")
    socket.flush()
  }
  function attach(socket) {
    if (clients.indexOf(socket) >= 0) return
    clients = clients.concat([socket])
    send(socket, Proto.stateMessage(state))
  }
  function detach(socket) {
    if (clients.indexOf(socket) >= 0) clients = clients.filter(function(c) { return c !== socket })
  }
  function tell(messages) {
    for (var i = 0; i < messages.length; i++)
      for (var c = 0; c < clients.length; c++) send(clients[c], messages[i])
  }

  function line(socket, text) {
    var msg
    try { msg = JSON.parse(text) } catch (e) { return }
    var out = Proto.handle(model, msg, Date.now(), modes)
    model = out.model
    for (var i = 0; i < out.send.length; i++) send(socket, out.send[i])
    tell(out.broadcast)
    if (out.timer) {
      ttl.stop()
      if (out.timer.seconds) {
        ttl.thenMode = out.timer.then
        ttl.interval = Math.max(1, Math.round(out.timer.seconds * 1000))
        ttl.restart()
      }
    }
  }

  // The one timer of a for/then pair: it belongs to the change that started it.
  Timer {
    id: ttl
    property string thenMode: ""
    onTriggered: {
      var out = Proto.expire(share.model, thenMode, Date.now(), share.modes)
      share.model = out.model
      share.tell(out.broadcast)
    }
  }
}
