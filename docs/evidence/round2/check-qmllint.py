#!/usr/bin/env python3
"""Compare changed QML files with the supplied source generation's baseline."""
import json
import os
from pathlib import Path
import re
import subprocess as sp
import tempfile

ROOT = Path(__file__).resolve().parents[3]
OUT = ROOT / 'docs/evidence/round2'
FILES = ['BarSpecimen.qml', 'modules/Workspaces.qml', 'modules/WorkspacesFace.qml',
         'modules/WorkspacePopout.qml', 'modules/Quota.qml', 'modules/QuotaFace.qml',
         'modules/Status.qml', 'modules/StatusFace.qml', 'modules/Centre.qml', 'bridge/ModuleBus.qml']
with tempfile.TemporaryDirectory(prefix='strand-f-check-', dir=Path.home() / 'Data/Work') as folder:
    tmp = Path(folder)
    (tmp / 'imports').mkdir()
    (tmp / 'imports/qs').symlink_to(Path(os.environ.get('SHELL_SRC', '/home/nerdi/src/omarchy-umbriel')) / 'shell')
    baseline = tmp / 'baseline'
    baseline.mkdir()
    archive = sp.Popen(['git', 'archive', 'a2f15c0'], cwd=ROOT, stdout=sp.PIPE)
    sp.run(['tar', '-x', '-C', str(baseline)], stdin=archive.stdout, check=True)
    archive.stdout.close()
    assert archive.wait() == 0
    results = {}
    for name, cwd in [('baseline', baseline), ('candidate', ROOT)]:
        result = sp.run(['/usr/lib/qt6/bin/qmllint', '-I', str(tmp / 'imports'), '-I', '/usr/lib/qt6/qml', *FILES],
                        cwd=cwd, text=True, capture_output=True)
        log = result.stdout + result.stderr
        (OUT / f'qmllint-{name}.log').write_text(log)
        results[name] = [re.sub(r':\d+:\d+:', ':LINE:', line) for line in log.splitlines()
                         if line.startswith(('Warning:', 'Error:'))]
    added = sorted(set(results['candidate']) - set(results['baseline']))
    data = {'baseline': len(results['baseline']), 'candidate': len(results['candidate']), 'added': added}
    (OUT / 'qmllint.json').write_text(json.dumps(data, indent=2))
    print(json.dumps(data, indent=2))
    assert not added, 'new qmllint diagnostics'
    # An unrelated pre-existing editor fixture warning must be demonstrated
    # against the baseline, using its original test driver and source files.
    result = sp.run(['python3', baseline / 'tests/visual_editor_runtime.py', '--output', OUT / 'baseline-editor'],
                    env={**os.environ, 'QT_QPA_PLATFORMTHEME':'', 'QT_STYLE_OVERRIDE':'',
                         'OMARCHY_PATH':str((tmp / 'imports/qs').resolve().parent)}, text=True, capture_output=True, timeout=35)
    (OUT / 'visual-editor-baseline.log').write_text(result.stdout + result.stderr)
    print(f'Baseline visual editor exit: {result.returncode}')
