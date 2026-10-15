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
        for name in ['VisualBarEditor.qml','BarSpecimen.qml','MotionPreview.qml','VisualEditor.js','Presets.js','BarMaterialCard.qml','MaterialCard.qml','InkSheet.qml','MetalShape.qml','GlassFrameGlint.qml','GlassMath.js','GlassBackdrop.qml','GlassSurface.qml']:
            shutil.copy2(ROOT / name, tmp / name)
        (tmp / 'modules').mkdir()
        for name in ['QuotaFace.qml','StatusFace.qml','WorkspacesFace.qml','WorkspaceMiniature.qml','ArchLogo.qml','SealLogo.qml']:
            shutil.copy2(ROOT / 'modules' / name, tmp / 'modules' / name)
        shutil.copytree(ROOT / 'shaders',tmp / 'shaders')
        themes = {}
        for theme in ['papier','tusche','frost','smoke','chrom','platin']:
            themes[theme] = {'material':json.loads((ROOT / 'themes' / theme / 'bar-material.json').read_text()), 'palette':tomllib.loads((ROOT / 'themes' / theme / 'colors.toml').read_text())}
        qml = r'''import QtQuick
import QtTest 1.2
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
  TestEvent { id: keyDriver }
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
  editor.snapshot={};schedule(100,function(){check(editor.snapshot.workspaces===undefined,"missing snapshot stays missing");editor.snapshot=fixture;testStrip()})
 }
 function findItem(item,pred) {
  if(!item) return null
  if(pred(item)) return item
  var kids=item.children||[]
  for(var i=0;i<kids.length;i++){var f=findItem(kids[i],pred);if(f) return f}
  return null
 }
 function testStrip() {
  setTheme("papier");editor.selectedPart="workspaces"
  schedule(350,function(){
   var strip=findItem(editor,function(i){return i.strip===true&&typeof i.move==="function"})
   check(!!strip,"the complete proof is one strip")
   editor.width=960
   var row=findItem(strip,function(i){return i.spacing===-1&&i.children&&i.children.some(function(c){return c.modelData!==undefined})})
   var cells=row.children.filter(function(c){return c.modelData!==undefined})
   check(cells.length===4,"all four parts are in the strip")
   check(cells.every(function(c){return c.y===cells[0].y}),"every part sits on the same line")
   var ordered=true;for(var i=1;i<cells.length;i++) ordered=ordered&&cells[i].x>=cells[i-1].x+cells[i-1].width-1.5&&cells[i].x<=cells[i-1].x+cells[i-1].width
   check(ordered,"parts follow each other, sharing only their hairline")
   var last=cells[3];check(last.x+last.width<=strip.width+0.5,"the whole strip fits the editor width")
   check(cells.map(function(c){return c.numbered}).join("|")==="1  Logo|2  Workspaces|3  AI quotas|4  Right side","parts are numbered in the bar's order")
   check(Math.abs(strip.implicitHeight-(strip.labelHeight+strip.barSize+12+8))<0.5,"the strip is one row high")
   check(cells[1].selected&&!cells[0].selected,"the selected part is marked")
   // arrow keys walk along the strip and never stage a setting
   var before=JSON.stringify(opts),picked=picks
   cells[1].forceActiveFocus(Qt.TabFocusReason)
   schedule(80,function(){
    check(cells[1].activeFocus,"a part owns keyboard focus")
    check(keyDriver.keyClick(Qt.Key_Right,Qt.NoModifier,0),"Right was delivered")
    schedule(80,function(){
     check(editor.selectedPart==="ai"&&cells[2].activeFocus,"Right moves selection and focus to the next part")
     keyDriver.keyClick(Qt.Key_Left,Qt.NoModifier,0)
     schedule(80,function(){
      keyDriver.keyClick(Qt.Key_Left,Qt.NoModifier,0)
      schedule(80,function(){
       check(editor.selectedPart==="logo"&&cells[0].activeFocus,"Left walks back to the first part")
       keyDriver.keyClick(Qt.Key_Left,Qt.NoModifier,0)
       schedule(80,function(){
        check(editor.selectedPart==="logo","Left at the first part stays")
        editor.selectedPart="right";cells[3].forceActiveFocus(Qt.TabFocusReason)
        schedule(60,function(){
         keyDriver.keyClick(Qt.Key_Right,Qt.NoModifier,0)
         schedule(80,function(){
          check(editor.selectedPart==="right","Right at the last part stays")
          check(picks===picked&&JSON.stringify(opts)===before,"walking along the strip stages nothing")
          testNarrowStrip()
         })
        })
       })
      })
     })
    })
   })
  })
 }

 function testNarrowStrip() {
  // a narrow editor: the strip continues on the next line instead of cutting a part off
  editor.width=380
  schedule(300,function(){
   var strip=findItem(editor,function(i){return i.strip===true&&typeof i.move==="function"})
   var row=findItem(strip,function(i){return i.spacing===-1&&i.children&&i.children.some(function(c){return c.modelData!==undefined})})
   var cells=row.children.filter(function(c){return c.modelData!==undefined})
   var rows={};cells.forEach(function(c){rows[Math.round(c.y)]=true})
   check(Object.keys(rows).length>=2,"a narrow strip wraps onto further lines")
   check(cells.every(function(c){return c.x>=-0.5&&c.x+c.width<=editor.width+1.5}),"no part reaches past the editor edge")
   check(cells.every(function(c){return c.y+c.height<=strip.implicitHeight+0.5}),"the strip's height holds every line")
   check(strip.implicitHeight>strip.labelHeight+strip.barSize+12+8+1,"the strip grew to hold the wrapped lines")
   // arrow keys still reach the last part, wherever it sits
   editor.selectedPart="logo";cells[0].forceActiveFocus(Qt.TabFocusReason)
   schedule(60,function(){
    var steps=0
    function next() {
     if(steps<3){steps++;keyDriver.keyClick(Qt.Key_Right,Qt.NoModifier,0);schedule(70,next);return}
     check(editor.selectedPart==="right"&&cells[3].activeFocus,"Right reaches the last part on the wrapped strip")
     editor.width=960
     schedule(200,function(){
      var again=findItem(editor,function(i){return i.strip===true&&typeof i.move==="function"})
      check(Math.abs(again.implicitHeight-(again.labelHeight+again.barSize+12+8))<0.5,"the strip returns to one line when there is room")
      testDryFrames(0)
     })
    }
    next()
   })
  })
 }

 function testDryFrames(index) {
  var names=["papier","tusche"]
  if(index===names.length) {testMotion();return}
  var name=names[index]
  setTheme(name);motion.playPopup()
  schedule(600,function(){
   var renderer=motion.cardMaterial,frame=renderer.cardFrame
   check(!!frame&&frame.visible&&frame.parent===renderer.card,"motion preview uses the actual dry frame: "+name)
   check(frame.border.width===2&&String(frame.border.color)===String(themes[name].material.card.frame.color),"motion preview preserves the approved outline: "+name)
   check(renderer.roll===1,"dry popup finishes its slower opening: "+name)
   shot(name+"-motion-frame",function(){motion.stop();testDryFrames(index+1)})
  })
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
