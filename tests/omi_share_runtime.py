#!/usr/bin/env python3
"""Run the real OmiShare.qml in an isolated, offscreen Quickshell and talk to it over a real socket.

Three runs, each with its own socket in a temporary directory (nothing of the desktop is touched):
  1. we are the service: clients get the state on connect, a set is broadcast (the sender included),
     for/then runs out, bad input is answered with an error, a set of the same mode changes nothing;
  2. a stale socket file nobody answers on is taken over;
  3. another service answers on the socket: we follow its state as a client, and take over when it stops.
"""
import json
import os
from pathlib import Path
import select
import shutil
import socket
import subprocess
import tempfile
import threading
import time

ROOT = Path(__file__).resolve().parents[1]
MODES = ['logo', 'idle', 'thinking', 'success', 'sad']

SHELL = r'''import QtQuick
import Quickshell
import Quickshell.Io

ShellRoot {
  OmiShare { id: share; active: true; modes: ["logo", "idle", "thinking", "success", "sad"] }
  property string last: ""
  Process { id: writer }
  Timer {
    interval: 100; repeat: true; running: true
    onTriggered: {
      var text = JSON.stringify(share.stateObject())
      if (text === last || writer.running) return
      last = text
      writer.command = ["sh", "-c", "printf '%s' \"$1\" > \"$2.tmp\" && mv \"$2.tmp\" \"$2\"", "sh", text, Quickshell.env("OMI_TEST_OUT")]
      writer.running = true
    }
  }
}
'''


class Client:
    def __init__(self, path, timeout=5):
        deadline = time.time() + timeout
        while True:
            try:
                self.sock = socket.socket(socket.AF_UNIX)
                self.sock.connect(str(path))
                break
            except OSError:
                self.sock.close()
                if time.time() > deadline:
                    raise
                time.sleep(0.1)
        self.buffer = b''

    def send(self, message):
        self.sock.sendall((json.dumps(message) + '\n').encode())

    def read(self, count=1, timeout=3):
        messages = []
        deadline = time.time() + timeout
        while len(messages) < count and time.time() < deadline:
            while b'\n' in self.buffer and len(messages) < count:
                line, self.buffer = self.buffer.split(b'\n', 1)
                messages.append(json.loads(line))
            if len(messages) >= count:
                break
            ready, _, _ = select.select([self.sock], [], [], max(0, deadline - time.time()))
            if ready:
                data = self.sock.recv(65536)
                if not data:
                    break
                self.buffer += data
        return messages

    def quiet(self, seconds=0.4):
        return self.read(1, seconds) == []

    def close(self):
        self.sock.close()


class Shell:
    def __init__(self, folder):
        self.folder = Path(folder)
        self.sock = self.folder / 'omi.sock'
        self.out = self.folder / 'state.json'
        config = self.folder / 'config'
        config.mkdir()
        for name in ('OmiShare.qml', 'OmiShare.js'):
            shutil.copy2(ROOT / name, config / name)
        (config / 'shell.qml').write_text(SHELL)
        env = {**os.environ, 'QT_QPA_PLATFORM': 'offscreen', 'OMI_SOCKET': str(self.sock), 'OMI_TEST_OUT': str(self.out)}
        self.log = open(self.folder / 'shell.log', 'w')
        self.process = subprocess.Popen(['quickshell', '-p', str(config), '--no-duplicate'], env=env, stdout=self.log, stderr=subprocess.STDOUT)

    def dump(self, wanted=None, timeout=6):
        deadline = time.time() + timeout
        last = None
        while time.time() < deadline:
            try:
                last = json.loads(self.out.read_text())
                if wanted is None or wanted(last):
                    return last
            except (OSError, ValueError):
                pass
            time.sleep(0.1)
        raise AssertionError(f'the shell did not reach the wanted state; last dump: {last}\n' + (self.folder / 'shell.log').read_text()[-1500:])

    def stop(self):
        self.process.terminate()
        try:
            self.process.wait(5)
        except subprocess.TimeoutExpired:
            self.process.kill()
        self.log.close()


def check_serving(folder):
    shell = Shell(folder)
    try:
        shell.dump(lambda d: d['role'] == 'serving')
        a = Client(shell.sock)
        first = a.read()[0]
        assert first['type'] == 'state' and first['protocol'] == 1 and first['mode'] == 'logo' and first['instant'] is True, first
        a.send({'type': 'hello', 'name': 'test-a'})
        a.send({'type': 'set', 'mode': 'thinking'})
        got = a.read()[0]
        assert got['mode'] == 'thinking' and got['from'] == 'logo' and got['instant'] is False, got
        since = got['since']
        b = Client(shell.sock)
        late = b.read()[0]
        assert late['mode'] == 'thinking' and late['since'] == since, ('a late app gets the state on connect', late)
        # the shell's own view
        dump = shell.dump(lambda d: d['mode'] == 'thinking' and d['clients'] == 2)
        assert dump['role'] == 'serving'
        # a set of the same mode: only the sender hears, since stays
        a.send({'type': 'set', 'mode': 'thinking'})
        same = a.read()[0]
        assert same['mode'] == 'thinking' and same['since'] == since, same
        assert b.quiet(), 'nobody else hears about no change'
        # a change reaches everyone, the sender included
        b.send({'type': 'set', 'mode': 'sad', 'instant': True})
        assert a.read()[0]['mode'] == 'sad'
        got = b.read()[0]
        assert got['mode'] == 'sad' and got['instant'] is True, got
        # for / then
        a.send({'type': 'set', 'mode': 'success', 'for': 0.5, 'then': 'idle'})
        assert a.read()[0]['mode'] == 'success' and b.read()[0]['mode'] == 'success'
        t0 = time.time()
        assert a.read()[0]['mode'] == 'idle' and b.read()[0]['mode'] == 'idle'
        assert 0.3 < time.time() - t0 < 1.5, time.time() - t0
        # a later change cancels the timer
        a.send({'type': 'set', 'mode': 'success', 'for': 0.6, 'then': 'idle'})
        a.read(); b.read()
        b.send({'type': 'set', 'mode': 'thinking'})
        assert a.read()[0]['mode'] == 'thinking'
        b.read()
        assert a.quiet(1.0) and b.quiet(0.1), 'the cancelled timer never fires'
        # errors and get
        a.send({'type': 'set', 'mode': 'thinkng'})
        assert a.read()[0] == {'type': 'error', 'message': 'no mode "thinkng"'}
        a.send({'type': 'set', 'mode': 'idle', 'for': 'x', 'then': 'idle'})
        assert a.read()[0]['type'] == 'error'
        a.sock.sendall(b'not json at all\n{"type":"get"}\n')
        assert a.read()[0]['type'] == 'state', 'junk is ignored, the next line still works'
        assert b.quiet(0.2)
        # a client going away does not disturb the others
        a.close()
        shell.dump(lambda d: d['clients'] == 1)
        b.send({'type': 'get'})
        assert b.read()[0]['mode'] == 'thinking'
        b.close()
        print('PASS: serving (state on connect, broadcast, no-change, for/then, cancel, errors, junk, disconnect)')
    finally:
        shell.stop()


def check_stale(folder):
    shell_dir = Path(folder)
    stale = socket.socket(socket.AF_UNIX)
    stale.bind(str(shell_dir / 'omi.sock'))
    stale.close()
    assert (shell_dir / 'omi.sock').exists(), 'a stale socket file is left behind'
    shell = Shell(folder)
    try:
        shell.dump(lambda d: d['role'] == 'serving', timeout=8)
        client = Client(shell.sock)
        assert client.read()[0]['type'] == 'state'
        client.close()
        print('PASS: a stale socket file is taken over')
    finally:
        shell.stop()


class Fake:
    """Another Omi service, as the reference one: state on connect, sets broadcast."""

    def __init__(self, path):
        self.path = path
        self.state = {'type': 'state', 'protocol': 1, 'mode': 'logo', 'from': None, 'since': 1, 'instant': True}
        self.server = socket.socket(socket.AF_UNIX)
        self.server.bind(path)
        self.server.listen(4)
        self.clients = []
        self.hellos = []
        self.alive = True
        threading.Thread(target=self.accept, daemon=True).start()

    def accept(self):
        while self.alive:
            try:
                conn, _ = self.server.accept()
            except OSError:
                return
            self.clients.append(conn)
            conn.sendall((json.dumps(self.state) + '\n').encode())
            threading.Thread(target=self.listen, args=(conn,), daemon=True).start()

    def listen(self, conn):
        buffer = b''
        while self.alive:
            try:
                data = conn.recv(4096)
            except OSError:
                return
            if not data:
                return
            buffer += data
            while b'\n' in buffer:
                line, buffer = buffer.split(b'\n', 1)
                try:
                    msg = json.loads(line)
                except ValueError:
                    continue
                if msg.get('type') == 'hello':
                    self.hellos.append(msg.get('name'))

    def set(self, mode):
        self.state = {'type': 'state', 'protocol': 1, 'mode': mode, 'from': self.state['mode'], 'since': int(time.time() * 1000), 'instant': False}
        for conn in self.clients:
            try:
                conn.sendall((json.dumps(self.state) + '\n').encode())
            except OSError:
                pass

    def stop(self):
        self.alive = False
        for conn in self.clients:
            try:
                conn.shutdown(socket.SHUT_RDWR)      # (close alone does not end a connection another thread is reading)
                conn.close()
            except OSError:
                pass
        self.server.close()
        try:
            os.unlink(self.path)
        except OSError:
            pass


def check_following(folder):
    fake = Fake(str(Path(folder) / 'omi.sock'))
    fake.set('thinking')
    shell = Shell(folder)
    try:
        dump = shell.dump(lambda d: d['role'] == 'following' and d['mode'] == 'thinking', timeout=8)
        assert dump['clients'] == 0, 'we do not serve while another does'
        deadline = time.time() + 3
        while not fake.hellos and time.time() < deadline:
            time.sleep(0.1)
        assert fake.hellos == ['tusche-bar'], fake.hellos
        fake.set('success')
        shell.dump(lambda d: d['mode'] == 'success')
        fake.stop()
        dump = shell.dump(lambda d: d['role'] == 'serving', timeout=10)
        client = Client(shell.sock)
        assert client.read()[0]['type'] == 'state'
        client.close()
        print('PASS: follows another service, says hello, and takes over when it stops')
    finally:
        fake.stop()
        shell.stop()


def run():
    if not shutil.which('quickshell'):
        print('SKIP: quickshell is not installed')
        return
    for check in (check_serving, check_stale, check_following):
        with tempfile.TemporaryDirectory(prefix='tusche-omi-share-') as folder:
            os.chmod(folder, 0o700)
            check(folder)


if __name__ == '__main__':
    run()
