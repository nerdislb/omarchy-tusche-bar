#!/usr/bin/env python3
"""Black-box checks for immutable code installation and scoped config merge."""
import importlib.util
import json
from pathlib import Path
import tempfile

spec=importlib.util.spec_from_file_location('generation', Path(__file__).resolve().parents[1]/'bin/install-generation.py')
mod=importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
with tempfile.TemporaryDirectory(prefix='generation-test-') as tmp:
    root=Path(tmp)
    source=root/'source'; source.mkdir()
    target=root/'plugins/nerdibeard.tusche-bar'
    source.joinpath('modules').mkdir()
    (source/'modules/Workspaces.qml').write_text('import QtQuick\nItem {}\n')
    (source/'Engine.qml').write_text('import QtQuick\nItem {}\n')
    manifest={'schemaVersion':1,'id':target.name,'kinds':['panel'],'entryPoints':{'panel':'Engine.qml'}}
    (source/'manifest.json').write_text(json.dumps(manifest))
    config=root/'shell.json'
    before={'bar':{'layout':{'left':[{'id':'tusche.workspaces','source':str(target/'modules/Workspaces.qml'),'logo':'seal','unknown':{'keep':True}}], 'center':[{'id':'other','source':'/other/Widget.qml'}], 'right':[]},'position':'top'},'plugins':[{'id':'some-plugin','tokenRef':'do-not-touch','options':{'x':42}}],'unknown':[1,2,3]}
    config.write_text(json.dumps(before));config.chmod(0o600)
    first=mod.install(source,target,config)
    after=json.loads(config.read_text())
    assert after['bar']['layout']['left'][0]['source']==str(target/'generations'/first/'modules/Workspaces.qml')
    normalized=json.loads(json.dumps(after));normalized['bar']['layout']['left'][0]['source']=before['bar']['layout']['left'][0]['source']
    assert normalized==before, 'all unrelated options and entries preserved'
    assert config.stat().st_mode & 0o777 == 0o600
    raw=config.read_bytes()
    assert mod.install(source,target,config)==first and config.read_bytes()==raw, 'idempotent'
    (source/'Engine.qml').write_text('import QtQuick\nItem { property bool updated: true }\n')
    second=mod.install(source,target,config)
    assert second!=first
    assert (target/'generations'/first/'Engine.qml').is_file(), 'old generation retained'
    assert json.loads((target/'manifest.json').read_text())['entryPoints']['panel']==f'generations/{second}/Engine.qml'
    after=json.loads(config.read_text())
    assert after['bar']['layout']['left'][0]['source']==str(target/'generations'/second/'modules/Workspaces.qml')
    normalized=json.loads(json.dumps(after));normalized['bar']['layout']['left'][0]['source']=before['bar']['layout']['left'][0]['source']
    assert normalized==before
    (target/'generations'/second/'Engine.qml').write_text('local edit')
    try: mod.install(source,target,config)
    except AssertionError: pass
    else: raise AssertionError('must preserve/reject a modified installed generation')
print('PASS generation installation: complete payload, scoped merge, mode, idempotence, update, retained rollback, local-edit rejection')
