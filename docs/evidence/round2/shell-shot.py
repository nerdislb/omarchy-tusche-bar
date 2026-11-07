#!/usr/bin/env python3
"""Real bar, private HOME/runtime, empty environment; no live IPC or writes."""
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess as sp
import sys
import tempfile
import time

HERE = Path(__file__).resolve().parent
BAR = Path(os.environ.get('BAR_SRC', HERE.parents[2]))
SHELL = Path(os.environ.get('SHELL_SRC', '/home/nerdi/src/omarchy-umbriel'))
OWNER = Path.home()
theme = sys.argv[1]
assert theme in ['look-funk', 'look-tusche']
out = Path(sys.argv[2]).resolve()
out.mkdir(parents=True, exist_ok=True)
root = Path(tempfile.mkdtemp(prefix='strand-f-'))
home, run = root / 'home', root / 'run'
for path in [home / '.config/omarchy/plugins', home / '.config/umbriel',
             home / '.local/state/omarchy/current/theme', home / '.local/share', home / '.cache', run]:
    path.mkdir(parents=True, exist_ok=True)
run.chmod(0o700)
processes, handles = [], []
env = dict(HOME=str(home), USER='nerdi', LOGNAME='nerdi', LANG='C.UTF-8',
           PATH=f'{SHELL}/bin:/usr/local/bin:/usr/bin:/bin',
           XDG_CONFIG_HOME=str(home / '.config'), XDG_STATE_HOME=str(home / '.local/state'),
           XDG_DATA_HOME=str(home / '.local/share'), XDG_CACHE_HOME=str(home / '.cache'),
           XDG_RUNTIME_DIR=str(run), XDG_CURRENT_DESKTOP='umbriel', OMARCHY_PATH=str(SHELL),
           DBUS_SYSTEM_BUS_ADDRESS=f'unix:path={root}/no-system-bus',
           QT_QPA_PLATFORMTHEME='', QT_STYLE_OVERRIDE='')


def command(args, extra=None):
    values = env | (extra or {})
    for key in ['XDG_RUNTIME_DIR', 'UMBRIEL_SOCKET', 'WAYLAND_DISPLAY', 'DBUS_SESSION_BUS_ADDRESS']:
        assert '/run/user/' not in values.get(key, '')
    return ['/usr/bin/env', '-i', *[f'{k}={v}' for k, v in values.items()], *map(str, args)]


def call(args, extra=None):
    result = sp.run(command(args, extra), capture_output=True, text=True, timeout=25)
    if result.returncode:
        raise RuntimeError(f'{args}: {result.stdout}\n{result.stderr}')
    return result.stdout.strip()


def launch(args, log, extra=None):
    handle = open(root / log, 'w')
    handles.append(handle)
    process = sp.Popen(command(args, extra), stdout=handle, stderr=sp.STDOUT, start_new_session=True)
    processes.append(process)
    return process


def ipc(*args):
    return call(['quickshell', 'ipc', '-p', SHELL / 'shell', 'call', *args])


def shot(name):
    call(['grim', '-g', '0,0 1920x220', out / f'{name}.png'])


def cleanup():
    for process in reversed(processes):
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=5)
            except sp.TimeoutExpired:
                process.kill()
                process.wait(timeout=5)
    for handle in handles:
        handle.close()
    for name in ['shell.log', 'umbriel.log']:
        if (root / name).exists():
            shutil.copy2(root / name, out / name)
    shutil.rmtree(root)
    (out / 'cleanup.json').write_text(json.dumps(dict(root=str(root), removed=not root.exists(),
        pids=[p.pid for p in processes], reaped=all(p.poll() is not None for p in processes)), indent=2))


try:
    # Copy only presentation settings; no credentials, user units or live includes.
    cfg = json.loads((OWNER / '.config/omarchy/shell.json').read_text().replace(str(OWNER / '.config/omarchy/plugins'), str(home / '.config/omarchy/plugins')))
    bar_entry = next(p for p in cfg['plugins'] if p['id'] == 'nerdibeard.tusche-bar')
    bar_entry['options'].update(channels='on', dayline='on', daylineNow='on', workspacePing='on',
                              logoImage=str(OWNER / '.local/share/omarchy-looks/logos/funk.svg'))
    bar_entry.update(codexCredits=True, codexCreditsInBar=True)
    cfg = {'version': 1, 'bar': cfg['bar'], 'plugins': [bar_entry], 'idle': {'enabled': False}}
    # Real workspace/credit plates, native time and audio, no external services.
    cfg['bar']['background'] = 'opaque'
    layout = cfg['bar']['layout']
    layout['left'] = [e for e in layout['left'] if isinstance(e, dict) and e['id'] in ['tusche.workspaces', 'omarchy.spacer', 'tusche.quota']]
    for e in layout['left']:
        e.pop('externalOnly', None)
    layout['center'] = ['omarchy.clock']
    layout['centerBegin'] = []
    layout['centerEnd'] = []
    layout['right'] = ['omarchy.audio', 'omarchy.power']
    layout['tray'] = []
    for path in [home / '.config/omarchy/shell.json']:
        path.write_text(json.dumps(cfg))
    (home / '.config/omarchy/shell.toml').write_text((OWNER / '.config/omarchy/shell.toml').read_text())
    for name in ['colors.toml', 'shell.toml']:
        source = OWNER / '.config/omarchy/themes' / theme / name
        if source.exists():
            shutil.copyfile(source, home / '.local/state/omarchy/current/theme' / name)
    (home / '.local/state/omarchy/current/theme.name').write_text(theme)
    (home / '.local/share/fonts').symlink_to(OWNER / '.local/share/fonts')
    if (OWNER / '.config/fontconfig').exists():
        shutil.copytree(OWNER / '.config/fontconfig', home / '.config/fontconfig', symlinks=False)
    credits = home / '.local/state/tusche-bar/codex-credits.json'
    credits.parent.mkdir(parents=True)
    import datetime
    credits.write_text(json.dumps(dict(status='ok', balance='67500',
        updatedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())))
    generation = call(['python3', '-I', BAR / 'bin/install-generation.py', BAR,
                      home / '.config/omarchy/plugins/nerdibeard.tusche-bar', '--config', home / '.config/omarchy/shell.json'])
    # Test-only probe imports the private production generation's singleton.
    probe = home / '.config/omarchy/plugins/round2.probe'
    probe.mkdir()
    (probe / 'manifest.json').write_text(json.dumps(dict(schemaVersion=1, id='round2.probe', name='Private capture probe',
        version='1', kinds=['panel'], entryPoints={'panel':'Probe.qml'}, keepLoaded=True)))
    bridge = home / '.config/omarchy/plugins/nerdibeard.tusche-bar/generations' / generation / 'bridge'
    (probe / 'Probe.qml').write_text('''import QtQuick
import Quickshell
import Quickshell.Io
import "BRIDGE" as Bridge
Item {
 id: root
 property var shell: null
 property string path: ""
 function workspaces() { return Bridge.ModuleBus.instances.workspaces[0] }
 function texts(item) {
   var result=[]
   if ("text" in item && "color" in item) result.push({text:String(item.text),color:String(item.color)})
   for (var i=0;i<item.children.length;i++) result=result.concat(texts(item.children[i]))
   return result
 }
 IpcHandler {
  target: "round2-probe"
  function state(): string {
    var ws=root.workspaces(), quota=Bridge.ModuleBus.instances.quota[0]
    return JSON.stringify({workspace:ws.previewData(),popout:ws.popoutItem ? {open:ws.hoverPopoutOpen,x:ws.popoutItem.cardOrigin.x,y:ws.popoutItem.cardOrigin.y}:null,texts:root.texts(ws).concat(quota?root.texts(quota):[])})
  }
  function capture(path: string): void {root.path=path; timer.restart()}
 }
 Timer {id:timer; interval:35; onTriggered:capture.running=true}
 Process {id:capture; command:["grim","-g","0,0 1920x220",root.path]}
}
'''.replace('BRIDGE', f'../nerdibeard.tusche-bar/generations/{generation}/bridge'))
    cfg = json.loads((home / '.config/omarchy/shell.json').read_text())
    cfg['plugins'].append({'id':'round2.probe'})
    (home / '.config/omarchy/shell.json').write_text(json.dumps(cfg))
    # Fresh compositor configuration, no copied autostarts/includes/effects.
    config = home / '.config/umbriel/shot.toml'
    config.write_text('''[general]
autostart = []
show_cheatsheet = false
[output.HEADLESS-1]
mode = "1920x1080@60"
scale = 1.0
workspaces = 5
[layout]
mode = "scrolling"
gap = 6
[colors]
background = "#110e18"
[appearance]
corner_radius = 0
[animation]
enabled = true
duration_ms = 1
''')
    for node in ['/dev/dri/renderD129', '/dev/dri/renderD128']:
        um = launch(['umbriel', '-c', config], 'umbriel.log', dict(WLR_BACKENDS='headless', WLR_LIBINPUT_NO_DEVICES='1',
            WLR_HEADLESS_OUTPUTS='1', WAYLAND_DISPLAY='umbriel-headless-guard', WLR_RENDERER='gles2', WLR_RENDER_DRM_DEVICE=node))
        for _ in range(150):
            if (run / 'umbriel-wayland-0.sock').is_socket() or um.poll() is not None:
                break
            time.sleep(.05)
        if (run / 'umbriel-wayland-0.sock').is_socket():
            break
        um.wait(timeout=5)
    assert (run / 'umbriel-wayland-0.sock').is_socket(), (root / 'umbriel.log').read_text()
    env.update(WAYLAND_DISPLAY=next(p.name for p in run.glob('wayland-*') if p.is_socket()),
               UMBRIEL_SOCKET=str(run / 'umbriel-wayland-0.sock'))
    # Bus has an explicit private address, is foreground, and its PID is ours.
    bus_address = f'unix:path={run}/bus'
    launch(['dbus-daemon', '--session', '--nofork', f'--address={bus_address}'], 'bus.log')
    for _ in range(50):
        if (run / 'bus').is_socket():
            break
        time.sleep(.05)
    env['DBUS_SESSION_BUS_ADDRESS'] = bus_address
    qs = launch(['quickshell', '-n', '-p', SHELL / 'shell'], 'shell.log', dict(QS_DISABLE_FILE_WATCHER='1', QS_NO_RELOAD_POPUP='1', QT_QPA_PLATFORM='wayland'))
    time.sleep(12)
    assert qs.poll() is None, (root / 'shell.log').read_text()[-5000:]
    # The opt-in refresh correctly writes unavailable without account credentials.
    # Replace that result with synthetic credit data for the visual fixture.
    credits.write_text(json.dumps(dict(status='ok', balance='67500',
        updatedAt=datetime.datetime.now(datetime.timezone.utc).isoformat())))
    time.sleep(.3)
    log = []
    for args in [('channels','off'),('channels','on'),('channelNames','MAIN,BUILD,WEB,CHAT,MEDIA,STUDIO,NOTES,PLAY,AUX,NIGHT')]:
        result = ipc('tusche-bar','set',*args)
        assert result == 'ok', result
        log.append([*args,result])
        time.sleep(.5)
        if args == ('channels','off'):
            shot('channels-off')
    call(['umbriel', 'msg', 'workspace-switch', '2'])
    time.sleep(.4)
    shot('channels-on')
    (out / 'state.json').write_text(ipc('tusche-bar','state'))
    snapshot = json.loads(ipc('round2-probe','state'))
    assert snapshot['workspace']['channel'] == '02 BUILD', snapshot
    assert any(t['text'] == 'X 67.5k cr' for t in snapshot['texts']), snapshot
    (out / 'probe.json').write_text(json.dumps(snapshot, indent=2))
    # Capture a real 100 ms ping, without changing its production timing.
    ipc('round2-probe', 'capture', str(out / 'ping.png'))
    call(['umbriel', 'msg', 'workspace-switch', '3'])
    time.sleep(.4)
    # Return to channel two for the popout and fallback-name checks.
    call(['umbriel', 'msg', 'workspace-switch', '2'])
    time.sleep(.3)
    for mode, names in [('fallback', 'MAIN,,WEB'), ('custom', 'MAIN,BUILD STUDIO,WEB')]:
        assert ipc('tusche-bar', 'set', 'channelNames', names) == 'ok'
        time.sleep(.3)
        shot(mode)
    assert ipc('tusche-bar', 'set', 'channelNames', 'MAIN,BUILD,WEB,CHAT,MEDIA,STUDIO,NOTES,PLAY,AUX,NIGHT') == 'ok'
    time.sleep(.3)
    # Real pointer entry opens the real popout through its production handler.
    protocol = OWNER / 'Data/Development/projects/umbriel-upstream/protocols/wlr-virtual-pointer-unstable-v1.xml'
    call(['wayland-scanner', 'client-header', protocol, root / 'pointer.h'])
    call(['wayland-scanner', 'private-code', protocol, root / 'pointer-protocol.c'])
    call(['gcc', '-I', root, HERE / 'pointer.c', root / 'pointer-protocol.c', '-lwayland-client', '-o', root / 'pointer'])
    launch([root / 'pointer', '65', '15'], 'pointer.log')
    time.sleep(1)
    shot('popout')
    snapshot = json.loads(ipc('round2-probe','state'))
    assert snapshot['popout']['open'] and snapshot['popout']['y'] < 100, snapshot
    (out / 'probe-popout.json').write_text(json.dumps(snapshot, indent=2))
    (out / 'ipc.json').write_text(json.dumps(log, indent=2))
    (out / 'fixture.json').write_text(json.dumps(dict(theme=theme,generation=generation,shell=str(SHELL),renderNode=node,
        options=bar_entry['options'],privateEnvironment=env),indent=2))
    print(f'PASS {theme}: channels off/on/names via IPC, real workspace switch and popout; {out}')
finally:
    cleanup()
