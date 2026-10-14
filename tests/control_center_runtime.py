#!/usr/bin/env python3
"""Native CC controller, viewport and keyboard acceptance.

A FloatingWindow replaces the layer-shell host under Xvfb; Process fixtures
prevent desktop actions. Production content, staging, bindings and Qt keyboard
events are retained. Actual Wayland focus/layer behavior needs a live check.
"""
import argparse
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import tempfile
import tomllib

ROOT = Path(__file__).resolve().parents[1]


def run(out, simulate_stale_loader_visibility=False, simulate_missing_ancestor_keys=False):
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
 property int gapsOut: 10
 property var spacing: ({popupPadding:16})
 function hoverFillFor(a,b,c) { return Qt.rgba(a.r,a.g,a.b,.08) }
 property var font: ({family:"JetBrainsMono Nerd Font",caption:11,bodySmall:12,body:14,icon:16,title:18})
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
        for name in ['ControlCenter.qml','ControlCenter.js','ScreenProfiles.qml','VisualBarEditor.qml','BarSpecimen.qml','MotionPreview.qml','VisualEditor.js','Presets.js','MaterialCard.qml','InkSheet.qml','MetalShape.qml','GlassFrameGlint.qml','GlassMath.js','GlassBackdrop.qml','GlassSurface.qml']:
            shutil.copy2(ROOT / name, tmp / name)
        (tmp / 'modules').mkdir()
        for name in ['QuotaFace.qml','StatusFace.qml','WorkspacesFace.qml','WorkspaceMiniature.qml','ArchLogo.qml','SealLogo.qml']:
            shutil.copy2(ROOT / 'modules' / name, tmp / 'modules' / name)
        shutil.copytree(ROOT / 'shaders',tmp / 'shaders')
        shutil.copytree(ROOT / 'bridge',tmp / 'bridge')
        ui = tmp / 'Ui'
        ui.mkdir()
        for name in ['BorderSurface.qml','BorderOverlay.qml']:
            shutil.copy2(source.parent / 'Ui' / name,ui / name)
        (ui / 'qmldir').write_text('module qs.Ui\nBorderSurface 1.0 BorderSurface.qml\nBorderOverlay 1.0 BorderOverlay.qml\n')
        io = tmp / 'FixtureIo'
        io.mkdir()
        (io / 'Process.qml').write_text("""import QtQuick
QtObject {
 id: root
 property var command: []
 property bool running: false
 property var stdout: null
 property var stderr: null
 signal exited(int exitCode, int exitStatus)
 onRunningChanged: if (running) Qt.callLater(function() {
  if (root.stdout) root.stdout.text = root.command[0] === "python3" ? "disabled" : "0"
  if (root.stderr) root.stderr.text = ""
  root.running = false; root.exited(0,0)
 })
}
""")
        (io / 'StdioCollector.qml').write_text('import QtQuick\nQtObject { property string text: ""; signal streamFinished() }\n')
        cc = tmp / 'ControlCenter.qml'
        cc_source = cc.read_text().replace('import Quickshell.Io','import "FixtureIo"').replace('PanelWindow {','PanelHost {')
        # Mutate only the disposable fixture copy to prove the new checks catch
        # the two live regressions. Never touch the worktree or installed UI.
        if simulate_stale_loader_visibility:
            cc_source, changed = re.subn(r'(active: win.open && win.area === "(?:bar|screens|motion)"\n)[ \t]*visible: active\n',r'\1',cc_source)
            assert changed == 3, f'expected exactly three preview Loader guards, got {changed}'
        if simulate_missing_ancestor_keys:
            stage_start = cc_source.index('    id: stage\n')
            handler = '    Keys.onPressed: function(e) { win.keyPressed(e) }\n'
            handler_at = cc_source.index(handler,stage_start)
            assert handler_at < cc_source.index('    Ui.BorderSurface {',stage_start)
            cc_source = cc_source[:handler_at] + cc_source[handler_at:].replace(handler,'',1)
        cc.write_text('\n'.join(line for line in cc_source.splitlines() if 'WlrLayershell.' not in line and 'exclusionMode:' not in line and line.strip() != 'anchors { top: true; bottom: true; left: true; right: true }'))
        (tmp / 'PanelHost.qml').write_text("""import QtQuick
import Quickshell
FloatingWindow {
 implicitWidth:1100;implicitHeight:900
 property int exclusionMode:0
 property QtObject anchors: QtObject {property bool top:true;property bool left:true;property bool bottom:true;property bool right:true}
}
""")

        themes = {}
        for theme in ['papier','tusche','frost','smoke','chrom','platin']:
            themes[theme] = {'material':json.loads((ROOT / 'themes' / theme / 'bar-material.json').read_text()), 'palette':tomllib.loads((ROOT / 'themes' / theme / 'colors.toml').read_text())}
        qml = r'''import QtQuick
import QtTest 1.2
import Quickshell
import qs.Commons
import qs.Commons as Commons
import "Presets.js" as Presets
import "bridge" as Bridge
ShellRoot {
 id: root
 property var themes: __THEMES__
 property int count: 0
 property int closes: 0
 QtObject {
  id: fakeHost
  property var options: Presets.normalizeOptions({workspaces:"minimap",ai:"rings",right:"groups",logo:"nerdibeard",edge:"theme",frames:"glint"})
  property var screenProfiles: ({})
  property var config: ({plugins:[{id:"nerdibeard.tusche-bar",screenProfiles:screenProfiles}],bar:{layout:{left:[],center:[],right:[]}}})
  property var material: root.themes.smoke.material
  property bool writing: false
  property string lastResult: "ok"
  property string lastWritten: ""
  property var baseLayout: ({})
  property bool usageFolded: false
  property bool usageRunning: false
  property int usageIntervalSec: 900
  property bool savedReady: true
  property string saveResult: ""
  property var savedPresets: []
  property bool focusBusy: false
  property string focusResult: ""
  property var nextScreens: ({})
  property int applies: 0
  property Timer writeTimer: Timer { interval: 30;onTriggered:{fakeHost.screenProfiles=fakeHost.nextScreens;fakeHost.lastResult="ok";fakeHost.writing=false} }
  function applyScreens(value) { applies++;writing=true;nextScreens=value;writeTimer.restart();return "ok" }
  function apply(value) { return "not tested" }
  function saveCombination(a,b) { return "not tested" }
  function deleteCombination(a) { return "not tested" }
  function focusAction(a) { return "not tested" }
 }
 ControlCenter { id: cc;host:fakeHost;requestedArea:"bar";onCloseRequested:{root.closes++;cc.open=false} }
 Item {
  id: probe; parent: cc.contentItem
  readonly property string quotaFace: Bridge.ModuleBus.optionFor(probe,"ai","gauge")
  TestEvent { id: keyDriver }
 }
 Timer { id: later;property var action;onTriggered:action() }
 function schedule(ms,fn) { later.interval=ms;later.action=fn;later.restart() }
 function check(ok,label) {if(!ok){console.error("FAIL "+label);Qt.exit(1);throw new Error(label)}count++;console.log("PASS "+label)}
 function shot(name,fn) {var stage=cc.contentItem.children.filter(function(c){return c.reveal!==undefined})[0];check(!!stage,"declarative CC stage available");stage.grabToImage(function(r){check(r.saveToFile("__OUT__/"+name+".png"),"saved "+name);fn()})}
 function findMotion(item) {if(item&&item.visible&&typeof item.playPopup==="function")return item;var children=item&&item.children?item.children:[];for(var i=0;i<children.length;i++){var m=findMotion(children[i]);if(m)return m}return null}
 function findItem(item,predicate) {
  if (!item || !item.visible) return null
  if (predicate(item)) return item
  var children=item.children||[]
  for(var i=0;i<children.length;i++){var found=findItem(children[i],predicate);if(found)return found}
  return null
 }
 function button(label) {return findItem(cc.contentItem,function(item){return item.label===label && item.height>0})}
 function viewportOf(item) {
  for(var p=item&&item.parent;p;p=p.parent)
   if(p.clip && p.contentItem!==undefined && p.contentY!==undefined && p.contentHeight!==undefined) return p
  return null
 }
 function fullyInViewport(item,label) {
  check(!!item&&item.visible&&item.width>0&&item.height>0,label+" exists and is visible")
  var viewport=viewportOf(item)
  check(!!viewport&&viewport.width>0&&viewport.height>0,label+" belongs to a live clipped viewport")
  var a=item.mapToItem(viewport,0,0),b=item.mapToItem(viewport,item.width,item.height)
  console.log("VIEWPORT "+JSON.stringify({label:label,x:a.x,y:a.y,width:b.x-a.x,height:b.y-a.y,viewportWidth:viewport.width,viewportHeight:viewport.height,contentY:viewport.contentY}))
  check(isFinite(a.x)&&isFinite(a.y)&&b.x>a.x&&b.y>a.y&&a.x>=-1&&a.y>=-1&&b.x<=viewport.width+1&&b.y<=viewport.height+1,label+" is wholly inside the viewport")
 }
 function begin() {
  Bridge.ModuleBus.engine=fakeHost
  cc.open=true
  schedule(350,function(){
   check(cc.open&&cc.area==="bar"&&!cc.working,"native CC bar page opens")
   check(cc.screenChoices.length>0,"native screen list available")
   shot("cc-bar",function(){cc.showArea("screens");schedule(100,function(){shot("cc-screens",testGeometryTransitions)})})
  })
 }
 function testGeometryTransitions() {
  cc.showArea("motion")
  schedule(180,function(){
   fullyInViewport(button("Play popup"),"Screens to Motion popup control")
   fullyInViewport(button("Play frame"),"Screens to Motion frame control")
   shot("cc-motion-after-screens",function(){
    cc.showArea("screens")
    schedule(100,function(){
     cc.showArea("health")
     schedule(150,function(){
      fullyInViewport(button("Check again"),"Screens to Health refresh control")
      var firstId="health."+cc.healthList[0].id
      fullyInViewport(findItem(cc.contentItem,function(item){return item.settingId===firstId}),"Screens to Health first check")
      shot("cc-health-after-screens",function(){cc.showArea("screens");schedule(100,stageUse)})
     })
    })
   })
  })
 }
 function stageUse() {
  var name=cc.screen.name
  cc.pick("screens."+name,"compact")
  check(fakeHost.applies===0&&fakeHost.screenProfiles[name]===undefined&&cc.pending.screens[name]==="compact","screen choice stages without writes")
  cc.use()
  schedule(1250,function(){
   check(!cc.working&&cc.usedLive&&fakeHost.screenProfiles[name]==="compact","Use commits screen profile")
   check(cc.applied.screens[name]===true,"applied screen is recorded for Cancel")
   check(probe.quotaFace==="ondemand","ModuleBus follows actual window screen and profile binding")
   fakeHost.screenProfiles=Object.assign({},fakeHost.screenProfiles,{"DP-9":"detailed"})
   cc.cancel()
   schedule(1250,function(){
    check(!cc.open&&!cc.working&&fakeHost.screenProfiles[name]===undefined,"Cancel restores touched screen")
    check(fakeHost.screenProfiles["DP-9"]==="detailed","Cancel preserves external untouched screen change")
    check(probe.quotaFace==="gauge","ModuleBus restores inherited variant")
    testSave()
   })
  })
 }
 function testSave() {
  cc.requestedArea="screens";cc.open=true
  cc.pick("screens.DP-9","inherit");cc.save()
  schedule(1250,function(){
   check(!cc.open&&cc.committed&&!cc.working&&fakeHost.screenProfiles["DP-9"]===undefined,"Save removes override and closes")
   cc.requestedArea="motion";cc.open=true
   schedule(150,function(){
    var m=findMotion(cc.contentItem)
    check(!!m&&m.width>0&&m.implicitHeight>0,"motion component loads at usable size")
    m.playPopup();schedule(150,function(){
     check(m.popupRunning,"isolated motion plays inside actual CC")
     cc.showArea("bar")
     schedule(100,function(){check(findMotion(cc.contentItem)===null,"page switch destroys motion preview");testCloseDuringUse()})
    })
   })
  })
 }
 function testCloseDuringUse() {
  var name=cc.screen.name
  cc.pick("screens."+name,"detailed");cc.use();cc.open=false
  schedule(2600,function(){
   check(!cc.open&&!cc.working&&fakeHost.screenProfiles[name]===undefined,"close during Use completes and reverts screen change")
   testPreviewKeyboard()
  })
 }
 function testPreviewKeyboard() {
  cc.requestedArea="motion";cc.open=true
  schedule(180,function(){
   var play=button("Play popup")
   check(!!play,"Motion play button exists for native key test")
   play.forceActiveFocus(Qt.TabFocusReason)
   schedule(80,function(){
    check(play.activeFocus,"Motion play button owns native keyboard focus")
    check(keyDriver.keyClick(Qt.Key_K,Qt.ControlModifier,0),"native Ctrl+K was delivered")
    schedule(80,function(){
     var search=findItem(cc.contentItem,function(item){return item.placeholderText==="Search settings and values"})
     check(!!search&&search.activeFocus,"Ctrl+K from focused play button opens search")
     check(keyDriver.keyClick(Qt.Key_Escape,Qt.NoModifier,0),"native search Escape was delivered")
     schedule(80,function(){
      check(cc.open&&!search.activeFocus,"first Escape leaves search without closing CC")
      play.forceActiveFocus(Qt.TabFocusReason)
      schedule(80,function(){
       check(play.activeFocus,"Motion play button refocused for native Escape")
       var before=fakeHost.applies
       check(keyDriver.keyClick(Qt.Key_Escape,Qt.NoModifier,0),"native play-button Escape was delivered")
       schedule(200,function(){
        check(!cc.open&&!cc.working&&fakeHost.applies===before,"Escape from focused play button closes CC without writes")
        check(findMotion(cc.contentItem)===null,"keyboard close destroys motion preview")
        console.log("VISUAL_RESULT "+JSON.stringify({checks:count,applies:fakeHost.applies,closes:closes}));Qt.quit()
       })
      })
     })
    })
   })
  })
 }
 Component.onCompleted: { console.log("CC_REVIEW_BEGIN");begin() }
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
    parser.add_argument('--simulate-stale-loader-visibility',action='store_true',help='remove only Loader visibility guards in a disposable copy; expect viewport assertions to fail')
    parser.add_argument('--simulate-missing-ancestor-keys',action='store_true',help='remove only the stage key fallback in a disposable copy; expect native keyboard assertions to fail')
    args=parser.parse_args()
    run(args.output.resolve(),args.simulate_stale_loader_visibility,args.simulate_missing_ancestor_keys)
