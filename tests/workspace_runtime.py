#!/usr/bin/env python3
"""Run real workspace QML with inert IPC/palette fixtures, off the desktop."""
import os
import argparse
import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import tomllib

ROOT = Path(__file__).resolve().parents[1]


def run(output=None):
    with tempfile.TemporaryDirectory(prefix='tusche-workspace-') as folder:
        tmp = Path(folder)
        modules = tmp / 'modules'
        modules.mkdir()
        for name in ['Workspaces.qml', 'WorkspacesFace.qml', 'WorkspaceMiniature.qml', 'ArchLogo.qml', 'SealLogo.qml']:
            shutil.copy2(ROOT / 'modules' / name, modules / name)
        import re
        popout_src = (ROOT / 'modules' / 'WorkspacePopout.qml').read_text()
        popout_src = re.sub(r'anchors\s*\{\s*top:\s*true[\s\S]*?\}', '', popout_src, count=1)
        (modules / 'WorkspacePopout.qml').write_text(
            '\n'.join(l for l in popout_src.splitlines() if not l.strip().startswith('WlrLayershell.')) + '\n'
        )
        shutil.copy2(ROOT / 'WorkspaceGeometry.js', tmp / 'WorkspaceGeometry.js')
        shutil.copy2(ROOT / 'WorkspaceLayout.js', tmp / 'WorkspaceLayout.js')
        shutil.copy2(ROOT / 'LayoutFeedback.qml', tmp / 'LayoutFeedback.qml')
        shutil.copy2(ROOT / 'EdgeSpring.qml', tmp / 'EdgeSpring.qml')
        shutil.copy2(ROOT / 'GlassMath.js', tmp / 'GlassMath.js')

        def write(name, text):
            dest = tmp / name
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_text(text)

        write('imports/qs/Commons/qmldir', 'module qs.Commons\nsingleton Style 1.0 Style.qml\nsingleton Util 1.0 Util.qml\nsingleton Color 1.0 Color.qml\nsingleton Border 1.0 Border.qml\nsingleton Compositor 1.0 Compositor.qml\nTransformWatcher 1.0 TransformWatcher.qml\n')
        # The shell's compositor service as Umbriel feeds it.
        write('imports/qs/Commons/Compositor.qml', '''pragma Singleton
import QtQuick
QtObject {
 property int focusedWorkspaceId: 3
 property string activeMode: "dwindle"
 property string outputName: "mock"
 function workspaceLayout(id) { return activeMode }
 function outputList() { return [{name:"mock",x:0,y:0,width:1200,height:900,reserved:[0,30,0,0],powered:true}] }
 function workspaceList() { return [{id:3,name:"3",output:outputName,shown:true,focused:true,windows:2,urgent:false,layout:activeMode},{id:5,name:"5",output:outputName,shown:false,focused:false,windows:1,urgent:true,layout:activeMode}] }
 function windowList() { return [] }
}''')
        write('imports/qs/Commons/Style.qml', '''pragma Singleton
import QtQuick
QtObject {
 property bool reduceMotion: false
 property real cornerRadius: 2
 property int gapsOut: 6
 property var bar: ({sizeHorizontal:30})
 property var font: ({family:"monospace",body:12,bodySmall:10,caption:9,icon:14})
 function barToken(key,fallback) { return fallback }
 function space(n) { return n }
 function duration(n) { return reduceMotion ? 0 : n }
}''')
        write('imports/qs/Commons/Util.qml', '''pragma Singleton
import QtQuick
QtObject {
 function alpha(c,a) { return Qt.rgba(c.r,c.g,c.b,a) }
 function shellQuote(s) { return "'" + s.replace(/'/g, "'\\\"'\\\"'") + "'" }
}''')
        write('imports/qs/Commons/Color.qml', '''pragma Singleton
import QtQuick
QtObject {
 property var bar: ({text:"#222222",background:"#eee9df"})
 property var popups: ({text:"#222222",background:"#f5f0e6",border:"#888888"})
 property color accent: "#813629"
 property color urgent: "#990000"
}''')
        write('imports/qs/Commons/Border.qml', '''pragma Singleton
import QtQuick
QtObject {
 function surfaceSpec(a,b,c,w) { return {width:w||1,color:c} }
 function left(s) { return s && s.width ? s.width : 1 }
 function right(s) { return s && s.width ? s.width : 1 }
 function top(s) { return s && s.width ? s.width : 1 }
 function bottom(s) { return s && s.width ? s.width : 1 }
}''')
        write('imports/qs/Commons/TransformWatcher.qml', '''import QtQuick
QtObject { property var a: null; property var b: null; property int transform: 0 }''')
        write('imports/qs/Ui/qmldir', 'module qs.Ui\nPlaceholder 1.0 Placeholder.qml\nBorderSurface 1.0 BorderSurface.qml\n')
        write('imports/qs/Ui/Placeholder.qml', 'import QtQuick\nItem {}\n')
        write('imports/qs/Ui/BorderSurface.qml', '''import QtQuick
Rectangle {
 property var borderSpec: null
 property int padding: 8
 readonly property int contentTopInset: padding
 readonly property int contentRightInset: padding
 readonly property int contentBottomInset: padding
 readonly property int contentLeftInset: padding
}''')
        write('imports/Quickshell/qmldir', 'module Quickshell\nsingleton Quickshell 1.0 Quickshell.qml\nPanelWindow 1.0 PanelWindow.qml\nRegion 1.0 Region.qml\nExclusionMode 1.0 ExclusionMode.qml\n')
        write('imports/Quickshell/Quickshell.qml', '''pragma Singleton
import QtQuick
QtObject { property var screens: [({name:"mock",width:1200,height:900})] }''')
        write('imports/Quickshell/ExclusionMode.qml', '''import QtQuick
QtObject { enum Mode { Ignore = 0 } }''')
        write('imports/Quickshell/Region.qml', '''import QtQuick
QtObject { property var item: null }''')
        write('imports/Quickshell/PanelWindow.qml', '''import QtQuick
Item {
 property var screen: null
 property color color: "transparent"
 property int exclusionMode: 0
 property var mask: null
}''')
        write('imports/Quickshell/Wayland/qmldir', 'module Quickshell.Wayland\nScreencopyView 1.0 ScreencopyView.qml\n')
        write('imports/Quickshell/Wayland/ScreencopyView.qml', '''import QtQuick
Item {
 property var captureSource: null
 property bool live: false
 property bool paintCursor: false
 property bool hasContent: true
 property size constraintSize: Qt.size(0, 0)
 signal stopped()
}''')
        write('imports/Quickshell/Hyprland/qmldir', 'module Quickshell.Hyprland\nsingleton Hyprland 1.0 Hyprland.qml\n')
        write('imports/Quickshell/Hyprland/Hyprland.qml', '''pragma Singleton
import QtQuick
QtObject {
 property var focusedWorkspace: ({id:27})
 property var activeToplevel: ({address:"abc"})
 property var monitors: ({values:[{lastIpcObject:{id:1,name:"mock",width:1200,height:900,x:0,y:0,scale:1,reserved:[0,30,0,0]}}]})
 property var toplevels: ({values:[{address:"abc",title:"Terminal",wayland:({appId:"Alacritty",title:"Terminal"}),lastIpcObject:{address:"0xabc",class:"Alacritty",monitor:1,workspace:{id:27},at:[0,30],size:[400,870]}}]})
 property var workspaces: ({values:[
  {id:27,name:"27",urgent:false,toplevels:{values:[1]},lastIpcObject:{id:27,name:"27",monitorID:1}},
  {id:120,name:"120",urgent:false,toplevels:{values:[2]},lastIpcObject:{id:120,name:"120",monitorID:1}}
 ]})
 property int clientRefreshes: 0
 property int monitorRefreshes: 0
 property int workspaceRefreshes: 0
 signal rawEvent(var event)
 function monitorFor(s) { return monitors.values.length ? monitors.values[0] : null }
 function refreshToplevels() { clientRefreshes++ }
 function refreshMonitors() { monitorRefreshes++ }
 function refreshWorkspaces() { workspaceRefreshes++ }
}''')
        write('imports/Quickshell/Io/qmldir', 'module Quickshell.Io\nProcess 1.0 Process.qml\nStdioCollector 1.0 StdioCollector.qml\nsingleton IoProbe 1.0 IoProbe.qml\n')
        write('imports/Quickshell/Io/IoProbe.qml', '''pragma Singleton
import QtQuick
QtObject { property int starts: 0; property string batch: "" }''')
        write('imports/Quickshell/Io/StdioCollector.qml', '''import QtQuick
QtObject { property string text: ""; signal streamFinished() }''')
        write('imports/Quickshell/Io/Process.qml', '''import QtQuick
Item {
 id: proc
 property var command: []
 property var stdout: null
 property bool running: false
 signal exited(int exitCode,int exitStatus)
 onRunningChanged: { if(running) { IoProbe.starts++; done.start() } else done.stop() }
 Timer { id:done; interval:20; onTriggered: { proc.stdout.text=IoProbe.batch; proc.stdout.streamFinished(); proc.running=false; proc.exited(0,0) } }
}''')
        write('bridge/qmldir', 'singleton ModuleBus 1.0 ModuleBus.qml\n')
        write('bridge/ModuleBus.qml', '''pragma Singleton
import QtQuick
QtObject {
 property var instances: ({})
 property var material: null
 property var metal: null
 property var engine: null
 property color barColor: "#eee9df"
 property bool barLight: true
 property string profile: ""
 property bool pixel: false
 property bool umbriel: false
 signal metalPulse()
 function register(kind,item) { var n=Object.assign({},instances); n[kind]=(n[kind]||[]).concat([item]); instances=n }
 function unregister(kind,item) { var n=Object.assign({},instances); n[kind]=(n[kind]||[]).filter(function(x){return x!==item}); instances=n }
 function optionFor(item,key,fallback) { return profile || fallback }
}''')
        write('DropMenu.qml', '''import QtQuick
Item { property var anchorItem; property var owner; property var bar; property bool open: false; property real cardPresence: 0 }''')
        write('BarMaterialCard.qml', '''import QtQuick
Item { property var panel; property var material; property real presence: panel && panel.open ? 1 : 0 }''')
        write('MetalShape.qml', '''import QtQuick
Item { property var spec; property real pad; property real tube; property real radius; function play() {} }''')
        qml = '''import QtQuick
import QtTest
import Quickshell.Hyprland
import Quickshell.Io
import qs.Commons
import "modules"
import "bridge" as Bridge

Item {
 id: canvas
 width: 600; height: 360
 property var commands: []
 property var layoutLines: []
 Component { id: feedback; LayoutFeedback { active:true; emit:function(argv) { canvas.layoutLines=canvas.layoutLines.concat([argv]) } } }
 QtObject { id: fakeBar; property int barSize:30; property color barForeground:"#222222"; function run(command) { canvas.commands=canvas.commands.concat([command]) } }
 Component { id: live; Workspaces { bar: fakeBar; settings: ({variant:"minimap",menu:false}) } }
 Component { id: face; WorkspacesFace { ids:[1,2,3,4,5]; occupiedIds:[1,2]; active:1; windowCounts:({1:3,2:1}); fg:"#222222"; strong:fg; barColor:"#eee9df"; barLight:true } }
 Component { id: gallery; Item {
  width:600; height:340
  property var palettes: PALETTES
  Repeater { model: parent.palettes; delegate: Rectangle {
   required property var modelData; required property int index
   x:0; y:index*85; width:600; height:85
   color:modelData.background
   Text { x:12; y:10; text:parent.modelData.name; color:parent.modelData.foreground; font.family:"monospace"; font.pixelSize:12 }
   Row { x:12; y:40; spacing:55
    Repeater { model:["pips","stack","logo","minimap"]; delegate: WorkspacesFace {
     required property string modelData
     variant:modelData
     barSize:30
     ids:[1,2,3,4,5]; occupiedIds:[1,2,3]; active:1
     windowCounts:({1:3,2:3,3:1})
     geometry:({1:{rectangles:[{x:0,y:0,width:.3,height:1,focused:true},{x:.3,y:0,width:.7,height:.5},{x:.3,y:.5,width:.7,height:.5}],offscreen:{right:2}},2:{rectangles:[{x:0,y:0,width:.5,height:.5},{x:.5,y:0,width:.5,height:.5},{x:0,y:.5,width:1,height:.5}]},3:{rectangles:[{x:0,y:0,width:1,height:1},{x:.3,y:.3,width:.5,height:.5,floating:true}]}})
     fg:parent.parent.modelData.foreground; strong:parent.parent.modelData.accent; accent:parent.parent.modelData.accent
     barColor:parent.parent.modelData.background; barLight:parent.parent.modelData.mode==="light"
    } }
   }
  } }
 } }
 TestCase {
  name: "WorkspaceRendering"
  when: windowShown
  function test_00_workspace_ping_is_bounded_and_optional() {
   var item=createTemporaryObject(face,canvas,{workspacePing:true})
   compare(item.pingOpacity,0)
   item.active=2
   wait(40)
   verify(item.pingOpacity>0)
   if(OUTPUT) grabImage(item).save(OUTPUT+"/ping-active.png")
   wait(110)
   compare(item.pingOpacity,0)
   if(OUTPUT) grabImage(item).save(OUTPUT+"/ping-rest.png")
   item.workspacePing=false
   item.active=3
   wait(40)
   compare(item.pingOpacity,0)
   item.workspacePing=true
   Style.reduceMotion=true
   item.active=4
   wait(40)
   compare(item.pingOpacity,0)
   Style.reduceMotion=false
  }
  function test_01_shared_geometry_owner_and_idle() {
   var first=createTemporaryObject(live,canvas,{x:10,y:10})
   var second=createTemporaryObject(live,canvas,{x:10,y:70})
   verify(first && second)
   tryCompare(Hyprland,"clientRefreshes",1)
   compare(Hyprland.monitorRefreshes,1)
   compare(Hyprland.workspaceRefreshes,1)
   verify(first.geometryOwner && !second.geometryOwner)
   compare(first.ids, [27,120])
   compare(first.geometry[27].rectangles.length,1)
   compare(first.geometry[27].rectangles[0].width,1/3)
   for(var i=0;i<20;i++) Hyprland.rawEvent({name:"openwindow"})
   tryCompare(Hyprland,"clientRefreshes",2)
   compare(Hyprland.monitorRefreshes,1)
   wait(350)
   compare(Hyprland.clientRefreshes,2)
   Hyprland.rawEvent({name:"windowtitle"})
   wait(180)
   compare(Hyprland.clientRefreshes,2)
   first.settings={variant:"pips",menu:false}
   tryVerify(function(){return second.geometryOwner})
   tryCompare(Hyprland,"clientRefreshes",3)
   second.settings={variant:"stack",menu:false}
   verify(!second.geometryOwner)
   var snapshot=first.previewData()
   compare(snapshot.geometry[27].rectangles[0].width,1/3)
   compare(snapshot.occupiedIds,[27,120])
   wait(180)
   compare(Hyprland.clientRefreshes,3)
  }
  function test_02_real_mouse_target_and_profile() {
   var item=createTemporaryObject(live,canvas,{x:10,y:10})
   verify(item)
   wait(180)
   mouseClick(item,40,15)
   compare(canvas.commands.length,1)
   verify(canvas.commands[0].indexOf('workspace = "120"')>=0)
   Bridge.ModuleBus.profile="stack"
   compare(item.variant,"stack")
   item.settings={variant:"none",menu:false}
   compare(item.variant,"none")
   compare(item.implicitWidth,6)
   Bridge.ModuleBus.profile=""
  }
  function test_03_all_shared_variants_are_inert_by_default() {
   var before=Hyprland.clientRefreshes
   var variants=["pips","stack","logo","minimap","none"]
   for(var i=0;i<variants.length;i++) {
    var item=createTemporaryObject(face,canvas,{variant:variants[i],x:10,y:10+i*40})
    verify(item)
    compare(item.interactive,false)
    verify(item.implicitWidth>=0)
    if(variants[i]!=="none") verify(item.implicitWidth>0)
   }
   wait(220)
   compare(Hyprland.clientRefreshes,before)
   var moving=createTemporaryObject(face,canvas,{x:150,y:50})
   moving.active=5
   wait(80)
   verify(moving.activeF>0 && moving.activeF<4)
   tryCompare(moving,"activeF",4)
   Style.reduceMotion=true
   var reduced=createTemporaryObject(face,canvas,{x:150,y:10})
   reduced.active=5
   tryCompare(reduced,"activeF",4)
   Style.reduceMotion=false
  }
  function test_04_native_metadata_fallback_is_shared_and_idle() {
   var monitors=Hyprland.monitors
   var workspaces=Hyprland.workspaces
   IoProbe.batch=JSON.stringify(monitors.values.map(function(m){return m.lastIpcObject}))+"\\n"+
    JSON.stringify(workspaces.values.map(function(w){return Object.assign({windows:1},w.lastIpcObject)}))+"\\n"+
    JSON.stringify(Hyprland.toplevels.values.map(function(w){return w.lastIpcObject}))+"\\n"+JSON.stringify({id:27,name:"27"})
   Hyprland.monitors={values:[]}
   Hyprland.workspaces={values:[{id:-1,name:"27",lastIpcObject:{},toplevels:{values:[]}}]}
   var first=createTemporaryObject(live,canvas,{x:10,y:10})
   var second=createTemporaryObject(live,canvas,{x:10,y:70})
   verify(first && second)
   tryCompare(IoProbe,"starts",1)
   tryVerify(function(){return !!first.snapshot})
   compare(first.snapshot,second.snapshot)
   compare(first.ids,[27,120])
   compare(first.active,27)
   compare(first.geometry[27].rectangles.length,1)
   compare(second.geometry[27].rectangles[0].width,1/3)
   var saved=first.snapshot
   IoProbe.batch="invalid snapshot"
   Hyprland.rawEvent({name:"openwindow"})
   tryCompare(IoProbe,"starts",2)
   wait(350)
   compare(first.snapshot,saved)
   compare(IoProbe.starts,2)
   first.previewData()
   wait(180)
   compare(IoProbe.starts,2)
   Hyprland.monitors=monitors
   Hyprland.workspaces=workspaces
  }
  function test_04b_leading_edge_refresh_collapses_bursts() {
   var item=createTemporaryObject(live,canvas,{x:10,y:10})
   verify(item && item.geometryOwner)
   wait(420)
   var before=Hyprland.clientRefreshes
   // the first event of a burst refreshes at once, not after the coalescing wait
   Hyprland.rawEvent({name:"workspacev2"})
   compare(Hyprland.clientRefreshes,before+1)
   // the rest of the burst collapses into exactly one trailing refresh
   for(var i=0;i<12;i++) Hyprland.rawEvent({name:"openwindow"})
   compare(Hyprland.clientRefreshes,before+1)
   tryCompare(Hyprland,"clientRefreshes",before+2)
   wait(420)
   compare(Hyprland.clientRefreshes,before+2)
   // events that cannot change geometry never refresh
   Hyprland.rawEvent({name:"windowtitle"})
   wait(200)
   compare(Hyprland.clientRefreshes,before+2)
   // a quiet gap re-arms the leading edge
   Hyprland.rawEvent({name:"closewindow"})
   compare(Hyprland.clientRefreshes,before+3)
  }
  function test_04c_hover_popout_and_window_focus() {
   mouseMove(canvas,580,350)
   var item=createTemporaryObject(live,canvas,{x:10,y:10,settings:({variant:"pips",menu:false})})
   verify(item)
   compare(item.variant,"pips")
   verify(!item.hoverPopoutOpen)
   verify(!item.needsGeometry)
   compare(Object.keys(item.geometry).length,0)
   mouseMove(item,20,15)
   tryVerify(function(){return item.hoverPopoutOpen})
   verify(item.popoutRequested)
   verify(item.needsGeometry)
   tryVerify(function(){return item.geometryOwner})
   compare(item.popoutIds,[27,120])
   compare(item.geometry[27].rectangles.length,1)
   verify(item.popoutItem)
   // Move pointer off the bar indicator and onto the first workspace tile's window thumbnail
   var tx=item.popoutItem.cardOrigin.x+35
   var ty=item.popoutItem.cardOrigin.y+55
   mouseMove(item.popoutItem,tx,ty)
   verify(item.popoutHovered)
   verify(item.popoutItem.anyTileHovered)
   wait(320)
   verify(item.hoverPopoutOpen)
   var beforeCmds=canvas.commands.length
   mouseClick(item.popoutItem,tx,ty)
   compare(canvas.commands.length,beforeCmds+1)
   verify(canvas.commands[beforeCmds].indexOf('window = "address:0xabc"')>=0)
   item.dropOpen=true
   verify(!item.hoverPopoutOpen)
   item.dropOpen=false
   mouseMove(canvas,580,350)
   tryVerify(function(){return !item.hoverPopoutOpen})
  }
  // On Umbriel the workspaces are Umbriel's even when Quickshell's Hyprland
  // model holds a monitor, as Hyprland.monitorFor() leaves one behind.
  function test_04d_umbriel_ignores_hyprland_model() {
   verify(Hyprland.monitors.values.length>0)
   Bridge.ModuleBus.umbriel=true
   var module=createTemporaryObject(live,canvas,{x:10,y:10})
   verify(module)
   compare(module.active,3)
   compare(module.windowCounts[3],2)
   compare(module.urgentIds,[5])
   compare(module.layoutLabel,"Dwindle")
   var reserved=module.implicitWidth
   Compositor.activeMode="scrolling"
   compare(module.layoutLabel,"Scrolling")
   compare(module.implicitWidth,reserved)
   Compositor.activeMode="pages"
   compare(module.layoutLabel,"Pages")
   compare(module.implicitWidth,reserved)
   Compositor.activeMode="<img src='https://example.invalid'>"
   compare(module.layoutLabel,"")
   Compositor.activeMode="dwindle"
   Bridge.ModuleBus.umbriel=false
  }
  function test_04e_layout_feedback_tracks_changes_without_startup_or_focus_noise() {
   canvas.layoutLines=[]
   var watcher=createTemporaryObject(feedback,canvas)
   verify(watcher)
   wait(20)
   compare(canvas.layoutLines.length,0)
   Compositor.activeMode="scrolling"
   tryCompare(watcher,"announced",1)
   compare(canvas.layoutLines[0][4],"Layout: Scrolling")
   Compositor.focusedWorkspaceId=5
   Compositor.activeMode="pages"
   wait(20)
   compare(canvas.layoutLines.length,1)
   Compositor.activeMode="dwindle"
   tryCompare(watcher,"announced",2)
   compare(canvas.layoutLines[1][4],"Layout: Dwindle")
   Compositor.outputName="another-output"
   Compositor.activeMode="pages"
   wait(20)
   compare(canvas.layoutLines.length,2)
   Compositor.activeMode="<img src='https://example.invalid'>"
   wait(20)
   compare(canvas.layoutLines.length,2)
   Compositor.activeMode="pages"
   wait(20)
   compare(canvas.layoutLines.length,2)
   watcher.active=false
   Compositor.focusedWorkspaceId=3
   Compositor.activeMode="dwindle"
   Compositor.outputName="mock"
  }
  function test_05_optional_theme_gallery() {
   if(!OUTPUT) return
   var sample=createTemporaryObject(gallery,canvas)
   verify(sample)
   wait(250)
   var saved=false
   verify(sample.grabToImage(function(image){saved=image.saveToFile(OUTPUT+"/workspace-themes.png")}))
   tryVerify(function(){return saved})
  }
 }
}'''
        palettes=[]
        for theme in ['papier', 'tusche', 'frost', 'smoke']:
            colors=tomllib.loads((ROOT / 'themes' / theme / 'colors.toml').read_text())
            palettes.append({key:colors[key] for key in ['background','foreground','accent','mode']} | {'name':theme})
        if output:
            output.mkdir(parents=True,exist_ok=True)
        write('tst_workspace.qml', qml.replace('PALETTES',json.dumps(palettes)).replace('OUTPUT',json.dumps(str(output) if output else '')))
        env = {**os.environ, 'QT_QPA_PLATFORM': 'offscreen', 'QT_QUICK_BACKEND': 'software'}
        result = subprocess.run(['/usr/lib/qt6/bin/qmltestrunner', '-input', str(tmp / 'tst_workspace.qml'), '-import', str(tmp / 'imports')],
                                env=env, text=True, capture_output=True, timeout=20)
        print(result.stdout + result.stderr)
        if result.returncode:
            raise SystemExit(result.returncode)
        errors = ['ReferenceError:', 'TypeError:', 'Binding loop', 'Unable to assign', 'Cannot assign', 'is not a type']
        assert not any(error in result.stdout + result.stderr for error in errors), 'runtime QML diagnostics'


if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path)
    args=parser.parse_args()
    run(args.output.resolve() if args.output else None)
