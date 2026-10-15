#!/usr/bin/env python3
"""Run the real NativeMaterial.qml with stub MaterialCard and ModuleBus, off the desktop.

A destroyed QML object leaves a truthy JS wrapper whose properties throw. After a
plugin reload the status report (`tusche-bar state`) kept throwing because
decorations holding destroyed cards were never forgotten. This checks that
report() and forget() cope with destroyed panels and cards.
"""
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]

QML = r'''import QtQuick
import QtTest

Item {
 id: root
 width: 10; height: 10
 Component { id: makeMaterial; NativeMaterial {} }
 Component { id: makeCard; QtObject { property var panel; property bool edge; property var material; function stateObject() { return {ok: true} } } }
 Component { id: makePanel; QtObject { property var borderSpec: 1 } }
 TestCase {
  name: "NativeMaterial"
  when: windowShown
  function cleanly(object) { object.destroy(); wait(60); gc(); wait(30) }

  function test_01_report_and_forget_survive_destroyed_cards_and_panels() {
   var m = createTemporaryObject(makeMaterial, root)
   var goodPanel = makePanel.createObject(root), goodCard = makeCard.createObject(root)
   var deadCard = makeCard.createObject(root), deadPanel = makePanel.createObject(root)
   var cardOfDeadPanel = makeCard.createObject(root)
   m.decorations = [{panel: goodPanel, card: goodCard}, {panel: goodPanel, card: deadCard},
                    {panel: deadPanel, card: cardOfDeadPanel}, {panel: goodPanel, card: null}, null, {}]
   cleanly(deadCard); cleanly(deadPanel)
   var anchor = createTemporaryObject(makePanel, root)
   var report = null
   try { report = m.report(anchor) } catch (e) { fail("report threw: " + e) }
   verify(report !== null)
   compare(report.cards.length, 1)                       // only the live card is reported
   compare(report.cards[0].ok, true)
   try { m.forget() } catch (e) { fail("forget threw: " + e) }
   compare(m.decorations.length, 1)                      // the dead ones are gone
   compare(m.decorations[0].card, goodCard)
   report = m.report(anchor)
   compare(report.cards.length, 1)
  }

  function test_02_nothing_to_report_is_fine() {
   var m = createTemporaryObject(makeMaterial, root)
   var report = m.report(createTemporaryObject(makePanel, root))
   compare(report.cards.length, 0)
   compare(m.report(null), null)
   m.forget()
   compare(m.decorations.length, 0)
  }
 }
}
'''


def run():
    with tempfile.TemporaryDirectory(prefix='tusche-native-material-') as folder:
        tmp = Path(folder)
        shutil.copy2(ROOT / 'NativeMaterial.qml', tmp / 'NativeMaterial.qml')
        (tmp / 'MaterialCard.qml').write_text('import QtQuick\nQtObject { property var panel; property bool edge; property var material; function stateObject() { return {ok: true} } }\n')
        (tmp / 'bridge').mkdir()
        (tmp / 'bridge/qmldir').write_text('singleton ModuleBus 1.0 ModuleBus.qml\n')
        (tmp / 'bridge/ModuleBus.qml').write_text('pragma Singleton\nimport QtQuick\nQtObject { property var material: null }\n')
        (tmp / 'tst_native_material.qml').write_text(QML)
        env = {**os.environ, 'QT_QPA_PLATFORM': 'offscreen', 'QT_QUICK_BACKEND': 'software'}
        result = subprocess.run(['/usr/lib/qt6/bin/qmltestrunner', '-input', str(tmp / 'tst_native_material.qml'), '-import', str(tmp)],
                                env=env, text=True, capture_output=True, timeout=90)
        print(result.stdout + result.stderr)
        if result.returncode:
            raise SystemExit(result.returncode)
        errors = ['ReferenceError:', 'Binding loop', 'Unable to assign', 'Cannot assign', 'is not a type', 'is not defined']
        assert not any(error in result.stdout + result.stderr for error in errors), 'runtime QML diagnostics'


if __name__ == '__main__':
    run()
