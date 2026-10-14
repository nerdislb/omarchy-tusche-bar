#!/usr/bin/env python3
"""Native isolated editor/material acceptance. No desktop or live data touched."""
import argparse
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import tempfile
import tomllib

ROOT = Path(__file__).resolve().parents[1]


def run(out):
    out.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='visual-editor-qt-') as scratch:
        tmp = Path(scratch)
        commons = tmp / 'Commons'
        commons.mkdir()
        source = Path(os.environ.get('OMARCHY_PATH', '/usr/share/omarchy')) / 'shell/Commons'
        for name in ['Border.qml', 'BorderGeometry.js', 'Util.qml']:
            shutil.copy2(source / name, commons / name)
        (commons / 'qmldir').write_text('module qs.Commons\nsingleton Border 1.0 Border.qml\nsingleton Util 1.0 Util.qml\nsingleton Color 1.0 Color.qml\nsingleton Style 1.0 Style.qml\n')
        (commons / 'Style.qml').write_text('''pragma Singleton
import QtQuick
QtObject {
 property bool reduceMotion: false
 property int cornerRadius: 0
 property var font: ({family:"JetBrainsMono Nerd Font",caption:11,bodySmall:12,body:14,icon:16})
 property var bar: ({sizeHorizontal:30})
 function space(n) { return n }
 function duration(n) { return reduceMotion ? 0 : n }
}
''')
        (commons / 'Color.qml').write_text('''pragma Singleton
import QtQuick
QtObject {
 property var shellValues: ({})
 property color foreground: "#171c24"
 property color accent: foreground
 property color urgent: "#b32525"
 property color background: "#e9edf0"
 property QtObject popups: QtObject { property color background: "#e9edf0"; property color text: "#171c24"; property color border: text }
 property QtObject bar: QtObject { property color background: "#e9edf0"; property color text: "#171c24" }
}
''')
        for name in ['VisualBarEditor.qml','BarSpecimen.qml','MotionPreview.qml','VisualEditor.js','Presets.js','MaterialCard.qml','InkSheet.qml','MetalShape.qml','GlassFrameGlint.qml','GlassMath.js','GlassBackdrop.qml','GlassSurface.qml']:
            shutil.copy2(ROOT / name, tmp / name)
        (tmp / 'modules').mkdir()
        for name in ['QuotaFace.qml','StatusFace.qml','WorkspacesFace.qml','WorkspaceMiniature.qml','ArchLogo.qml','SealLogo.qml']:
            shutil.copy2(ROOT / 'modules' / name, tmp / 'modules' / name)
        shutil.copytree(ROOT / 'shaders',tmp / 'shaders')
        themes = {}
        for theme in ['papier','tusche','frost','smoke','chrom','platin']:
            themes[theme] = {'material':json.loads((ROOT / 'themes' / theme / 'bar-material.json').read_text()), 'palette':tomllib.loads((ROOT / 'themes' / theme / 'colors.toml').read_text())}
        qml = r'''import QtQuick
import Quickshell
import qs.Commons
import qs.Commons as Commons
FloatingWindow {
 id: window
 visible: true; implicitWidth: 1000; implicitHeight: 1550
 property var themes: __THEMES__
 property int count: 0
 property int picks: 0
 property int step: 0
 property var opts: ({workspaces:"minimap",ai:"rings",right:"groups",logo:"nerdibeard",edge:"theme",frames:"glint",glass:"on",glassMotion:"on"})
 property var fixture: ({workspaces:{ids:[1,2,3,4,5],occupiedIds:[1,2,4],active:2,windowCounts:{1:1,2:2,4:1},urgentIds:[],geometry:{2:{rectangles:[{x:0,y:0,width:.5,height:1,focused:true},{x:.5,y:0,width:.5,height:1}],offscreen:{}}}},quota:{items:[{provider:"codex",name:"Test quota",label:"Weekly",percent:.46}],ringItems:[{provider:"codex",percent:.46},{provider:"claude",percent:.63}],pal:{}},status:{wifiUp:true,vpnUp:false,tailscaleUp:true,bluetoothConnected:false,phone:{online:true,charge:74},cpu:.4,sysHot:false,deviations:[]}})
 Item {
  id: canvas; anchors.fill: parent
  Rectangle { anchors.fill: parent; color: Commons.Color.popups.background }
  Text { x:20;y:8;text:"Isolated test fixture · production faces";textFormat:Text.PlainText;color:Commons.Color.popups.text;font.pixelSize:12 }
  VisualBarEditor { id: editor; x:20;y:40;width:960;height:implicitHeight;options:window.opts;liveOptions:window.opts;snapshot:window.fixture;showPresets:false;showMotion:false;material:window.themes.papier.material; onPicked: window.picks++ }
  MotionPreview { id: motion; x:20;y:1100;width:960;height:implicitHeight;options:window.opts;material:editor.material }
 }
 Timer { id: later; property var action; onTriggered: action() }
 function schedule(ms, fn) { later.interval=ms;later.action=fn;later.restart() }
 function check(ok, label) { if(!ok) {console.error("FAIL "+label);Qt.exit(1);throw new Error(label)} count++;console.log("PASS "+label) }
 function shot(name,fn) { canvas.grabToImage(function(r) {check(r.saveToFile("__OUT__/"+name+".png"),"saved "+name);fn()}) }
 function setTheme(name) {
  var p=themes[name].palette
  Commons.Color.background=p.background;Commons.Color.foreground=p.foreground;Commons.Color.accent=p.accent;Commons.Color.urgent=p.red
  Commons.Color.bar.background=p.background;Commons.Color.bar.text=p.foreground
  Commons.Color.popups.background=p.background;Commons.Color.popups.text=p.foreground
  editor.material=themes[name].material
 }
 function begin() {
  setTheme("papier")
  var before=JSON.stringify(opts)
  editor.preview("ai","vu")
  check(editor.proofOptions.ai==="vu"&&JSON.stringify(opts)===before&&picks===0,"hover previews without staging or mutation")
  editor.clearPreview();check(editor.proofOptions.ai==="rings","leaving hover restores staged view")
  editor.stage("ai","vu");check(picks===1&&JSON.stringify(opts)===before,"explicit selection emits only a staged choice")
  editor.stage("ai","not-a-variant");check(picks===1,"invalid choice rejected")
  editor.selectedPart="workspaces"
  schedule(800,function(){shot("papier-workspaces",next)})
 }
 function next() {
  var cases=[{t:"tusche",p:"ai"},{t:"frost",p:"logo"},{t:"smoke",p:"right"},{t:"chrom",p:"ai"},{t:"platin",p:"workspaces"}]
  if(step<cases.length) {var c=cases[step++];setTheme(c.t);editor.selectedPart=c.p;schedule(500,function(){shot(c.t+"-"+c.p,next)});return}
  editor.snapshot={};schedule(100,function(){check(editor.snapshot.workspaces===undefined,"missing snapshot stays missing");editor.snapshot=fixture;testMotion()})
 }
 function testMotion() {
  setTheme("smoke")
  check(!motion.popupRunning&&!motion.frameRunning,"motion idle initially")
  motion.playPopup();motion.playFrame()
  schedule(180,function(){
   check(motion.popupRunning&&motion.frameRunning,"production popup and frame are playing")
   shot("smoke-motion",function(){
    schedule(3100,function(){
     check(!motion.popupRunning&&!motion.frameRunning&&motion.amount===0,"playback returns to idle")
     motion.playPopup();motion.stop()
     schedule(50,function(){
      check(!motion.popupRunning,"stop cancels queued popup playback")
      Style.reduceMotion=true;motion.playPopup();motion.playFrame()
      schedule(50,function(){
       check(motion.popupRunning&&!motion.frameRunning&&motion.amount===0,"reduced motion keeps information without glints")
       motion.stop();Style.reduceMotion=false;motion.playFrame();motion.visible=false
       check(!motion.popupRunning&&!motion.frameRunning&&motion.amount===0,"hiding cancels all motion")
       console.log("VISUAL_RESULT "+JSON.stringify({checks:count,picks:picks}));Qt.quit()
      })
     })
    })
   })
  })
 }
 Timer { interval:200;running:true;onTriggered:window.begin() }
}
'''
        qml=qml.replace('__THEMES__',json.dumps(themes)).replace('__OUT__',str(out))
        (tmp / 'shell.qml').write_text(qml)
        env={**os.environ,'QT_QPA_PLATFORM':'xcb','QSG_RHI_BACKEND':'opengl','LIBGL_ALWAYS_SOFTWARE':'1','QT_LOGGING_RULES':'quickshell.dbus*:false'}
        with (out / 'runtime.log').open('w') as log:
            proc=subprocess.Popen(['xvfb-run','-a','-s','-screen 0 1100x1650x24','quickshell','-n','-p',str(tmp)],env=env,stdout=log,stderr=subprocess.STDOUT,text=True,start_new_session=True)
            try: proc.wait(timeout=35)
            except subprocess.TimeoutExpired:
                os.killpg(proc.pid,signal.SIGTERM);proc.wait(timeout=5)
        log=(out / 'runtime.log').read_text()
        print(log)
        assert proc.returncode==0 and 'VISUAL_RESULT ' in log, f'native acceptance failed ({proc.returncode})'
        for message in ['ReferenceError','TypeError','Unable to assign','QQmlListReference','Passing incompatible arguments','Binding loop','Cannot assign','is not a type','is not defined']:
            assert message not in log, f'QML runtime issue: {message}'
        result=next(line.split('VISUAL_RESULT ',1)[1] for line in log.splitlines() if 'VISUAL_RESULT ' in line)
        (out / 'runtime.json').write_text(json.dumps(json.loads(result),indent=2)+'\n')

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    run(parser.parse_args().output.resolve())
