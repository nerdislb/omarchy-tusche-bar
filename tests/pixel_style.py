#!/usr/bin/env python3
"""bin/pixel-style.py against a temporary HOME with fake Omarchy commands.

    python3 tests/pixel_style.py
"""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parent.parent
SCRIPT = ROOT / 'bin' / 'pixel-style.py'

FAKES = {
    'omarchy-hyprland-corners': '''#!/bin/bash
f=$HOME/.local/state/omarchy/toggles/hypr
if (( $# == 0 )); then
  if [[ -f $f/corners-sharp.lua ]]; then echo sharp; elif [[ -f $f/corners-rounded.lua ]]; then echo rounded; else echo theme; fi
  exit 0
fi
rm -f $f/corners-sharp.lua $f/corners-rounded.lua
[[ $1 == theme ]] || touch $f/corners-$1.lua
echo "corners $1" >> $HOME/calls.log
''',
    'omarchy-theme-bg-set': '''#!/bin/bash
ln -nsf "$(realpath "$1")" $HOME/.local/state/omarchy/current/background
echo "bg $(basename "$1")" >> $HOME/calls.log
''',
    'omarchy-restart-shell': '#!/bin/bash\necho restart >> $HOME/calls.log\n',
    'omarchy-notification-send': '#!/bin/bash\necho "notify $*" >> $HOME/calls.log\n',
    'umbriel': '#!/bin/bash\necho "    2560x1600 @ 60.000 Hz (preferred, current)"\n',
    'vectorcraft-cli': '#!/bin/bash\nexit 1\n',  # forces the PIL fallback: no app needed in tests
}
CURSOR = '''#!/bin/bash
cfg=$HOME/.config/tusche-cursor/config.json
fam=$(python3 -c "import json,sys; a=sys.argv; print(a[a.index('--family')+1])" "$@")
mkdir -p "$(dirname "$cfg")"; printf '{"family": "%s"}' "$fam" > "$cfg"; echo "cursor $fam" >> $HOME/calls.log
'''

USER_SHELL = '[font]\nbase-size = 14\n\n[bar]\nicon-slot = 24\n'
UMBRIEL = '[include]\nfiles = []\n\n[include.optional]\nfiles = ["omarchy-look.toml", "apple-motion.toml"]\n\n[general]\nmod_key = "Super"\n'
COLORS = {'abendrot': 'mode = "dark"\nbackground = "#110e18"\nforeground = "#efeaf6"\naccent = "#ffb27a"\n',
          'morgenrot': 'mode = "light"\nbackground = "#fdfafc"\nforeground = "#231a2b"\naccent = "#98401a"\n'}


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


class PixelStyle(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix='pixel-style-')
        t = Path(self.tmp.name)
        self.home = t / 'home'
        self.bin = t / 'bin'
        self.bin.mkdir()
        for name, body in FAKES.items():
            (self.bin / name).write_text(body)
            (self.bin / name).chmod(0o755)
        h = self.home
        for d in ('.config/omarchy/hooks/theme-set.d', '.config/umbriel', '.local/state/omarchy/current/theme',
                  '.local/state/omarchy/toggles/hypr'):
            (h / d).mkdir(parents=True)
        (h / '.config/omarchy/shell.toml').write_text(USER_SHELL)
        (h / '.config/umbriel/config.toml').write_text(UMBRIEL)
        (h / '.local/bin').mkdir(parents=True)
        (h / '.local/bin/tusche-cursor').write_text(CURSOR)
        (h / '.local/bin/tusche-cursor').chmod(0o755)
        (h / '.config/tusche-cursor').mkdir(parents=True)
        (h / '.config/tusche-cursor/config.json').write_text('{"family": "auto"}')
        (h / '.config/omarchy/shell.json').write_text(json.dumps({'bar': {'background': 'none', 'position': 'top'}, 'plugins': []}, indent=2) + '\n')
        self.theme('abendrot')

    def tearDown(self):
        self.tmp.cleanup()

    def theme(self, name):
        cur = self.home / '.local/state/omarchy/current'
        (cur / 'theme/colors.toml').write_text(COLORS[name])
        (cur / 'theme.name').write_text(name + '\n')
        bg = Path(self.tmp.name) / f'{name}-bg.png'
        bg.write_bytes(b'png ' + name.encode())
        link = cur / 'background'
        if link.is_symlink() or link.exists():
            link.unlink()
        link.symlink_to(bg)
        return bg

    def run_script(self, *args):
        env = {'HOME': str(self.home), 'PATH': f'{self.bin}:/usr/bin:/bin', 'LANG': 'C.UTF-8'}
        r = subprocess.run([sys.executable, '-I', str(SCRIPT), *args], env=env, capture_output=True, text=True, timeout=60)
        self.assertEqual(r.returncode, 0, r.stderr)
        return json.loads(r.stdout) if r.stdout.strip().startswith('{') else r.stdout

    def calls(self):
        log = self.home / 'calls.log'
        return log.read_text().split('\n')[:-1] if log.exists() else []

    def test_round_trip_restores_every_file(self):
        shell = self.home / '.config/omarchy/shell.toml'
        before = sha(shell)
        original_bg = os.path.realpath(self.home / '.local/state/omarchy/current/background')
        out = self.run_script('set', 'pixel')
        self.assertEqual(out['style'], 'pixel')
        self.assertTrue(out['shellBlock'] and out['umbrielInclude'] and out['nativeText'])
        self.assertEqual(out['corners'], 'sharp')
        self.assertIn('pixel-backgrounds', out['background'])
        # Departure unless another pixel font was chosen
        self.assertEqual(out['font'], 'departure')
        self.assertIn('family = "Tusche Departure"', shell.read_text())
        # base-size 14: the bar icon token that lands on 22 px
        self.assertIn('icon-font = 19', shell.read_text())
        self.assertEqual(json.loads((self.home / '.config/omarchy/shell.json').read_text())['bar']['background'], 'opaque')
        self.assertIn('"tusche-pixel.toml"', (self.home / '.config/umbriel/config.toml').read_text())
        self.assertTrue((self.home / '.config/omarchy/hooks/theme-set.d/80-tusche-pixel').exists())
        self.assertTrue((self.home / '.config/umbriel/tusche-pixel-dither.glsl').exists())
        umbriel_with_include = sha(self.home / '.config/umbriel/config.toml')
        # repeating repairs nothing and restarts nothing
        restarts = self.calls().count('restart')
        self.run_script('set', 'pixel')
        self.assertEqual(shell.read_text().count('>>> tusche pixel style'), 1)
        self.assertEqual(self.calls().count('restart'), restarts)
        out = self.run_script('set', 'tusche')
        self.assertEqual(out['style'], 'tusche')
        self.assertEqual(sha(shell), before)
        self.assertEqual(json.loads((self.home / '.config/omarchy/shell.json').read_text())['bar']['background'], 'none')
        self.assertEqual(out['corners'], 'theme')
        self.assertEqual(out['background'], original_bg)
        self.assertFalse(out['nativeText'] or out['umbrielInclude'])
        self.assertFalse((self.home / '.config/omarchy/hooks/theme-set.d/80-tusche-pixel').exists())
        self.assertFalse((self.home / '.config/umbriel/tusche-pixel-dither.glsl').exists())
        # the include stays (an empty file), Umbriel's config is not rewritten again
        self.assertEqual(sha(self.home / '.config/umbriel/config.toml'), umbriel_with_include)
        self.assertEqual(self.calls().count('restart'), 2)
        self.assertEqual([c for c in self.calls() if c.startswith('cursor')], ['cursor pixel', 'cursor auto'])

    def test_font_choice_switches_the_block_and_outlives_the_tusche_style(self):
        shell = self.home / '.config/omarchy/shell.toml'
        before = sha(shell)
        # the Tusche style is on: the choice is only recorded
        out = self.run_script('font', 'tiny5')
        self.assertEqual(out['font'], 'tiny5')
        self.assertEqual(sha(shell), before)
        self.assertNotIn('restart', self.calls())
        self.run_script('set', 'pixel')
        text = shell.read_text()
        self.assertIn('family = "Tusche Pixel"', text)
        self.assertIn('pixel-em = 8', text)
        # base-size 14: the bar icon token that lands on 16 px
        self.assertIn('icon-font = 14', text)
        fonts = self.home / '.local/share/fonts'
        self.assertTrue((fonts / 'tusche-departure/TuscheDeparture-Regular.ttf').exists())
        self.assertTrue((fonts / 'tusche-departure/OFL-departure-mono.txt').exists())
        restarts = self.calls().count('restart')
        self.run_script('font', 'departure')
        text = shell.read_text()
        self.assertIn('family = "Tusche Departure"', text)
        self.assertIn('pixel-em = 11', text)
        self.assertIn('heading = 22', text)
        self.assertIn('icon-font = 19', text)
        self.assertEqual(text.count('>>> tusche pixel style'), 1)
        self.assertEqual(self.calls().count('restart'), restarts + 1)
        # the same font again: nothing to restart
        self.run_script('font', 'departure')
        self.assertEqual(self.calls().count('restart'), restarts + 1)
        self.run_script('font', 'tiny5')
        out = self.run_script('set', 'tusche')
        self.assertEqual(sha(shell), before)
        self.assertEqual(out['font'], 'tiny5')
        self.assertEqual(self.run_script('status')['font'], 'tiny5')

    def test_normal_font_keeps_the_look_without_a_pixel_face(self):
        shell = self.home / '.config/omarchy/shell.toml'
        before = sha(shell)
        self.run_script('font', 'normal')
        out = self.run_script('set', 'pixel')
        text = shell.read_text()
        # the look stays: block, segments, opaque plates, Umbriel's dither, corners
        self.assertEqual(out['font'], 'normal')
        self.assertIn('pixel-face = false', text)
        self.assertIn('slider = "segments"', text)
        self.assertTrue(out['umbrielInclude'])
        self.assertEqual(out['corners'], 'sharp')
        # no pixel face: no family, no grid, no sizes, no icon token, no native text
        for absent in ('family =', 'pixel-grid', 'pixel-em', 'icon-font', 'heading ='):
            self.assertNotIn(absent, text)
        self.assertFalse(out['nativeText'])
        restarts = self.calls().count('restart')
        out = self.run_script('font', 'departure')
        self.assertIn('family = "Tusche Departure"', shell.read_text())
        self.assertTrue(out['nativeText'])
        self.assertEqual(self.calls().count('restart'), restarts + 1)
        out = self.run_script('font', 'normal')
        self.assertNotIn('family =', shell.read_text())
        self.assertFalse(out['nativeText'])
        self.assertEqual(self.calls().count('restart'), restarts + 2)
        out = self.run_script('set', 'tusche')
        self.assertEqual(sha(shell), before)
        self.assertFalse(out['nativeText'])
        self.assertEqual(out['font'], 'normal')

    def test_mix_keeps_the_windows_and_grid_with_the_tusche_shell(self):
        shell = self.home / '.config/omarchy/shell.toml'
        shell_json = self.home / '.config/omarchy/shell.json'
        shader = self.home / '.config/umbriel/tusche-pixel-dither.glsl'
        hook = self.home / '.config/omarchy/hooks/theme-set.d/80-tusche-pixel'
        before = sha(shell)
        original_bg = os.path.realpath(self.home / '.local/state/omarchy/current/background')
        out = self.run_script('set', 'mix')
        # the shell stays the Tusche style's: no block, no native text, no restart
        self.assertEqual(out['style'], 'mix')
        self.assertFalse(out['shellBlock'] or out['nativeText'])
        self.assertEqual(sha(shell), before)
        self.assertEqual(json.loads(shell_json.read_text())['bar']['background'], 'none')
        self.assertNotIn('restart', self.calls())
        self.assertEqual([c for c in self.calls() if c.startswith('cursor')], [])
        # the pixel style's windows: dissolve (blur stays), square corners, dot grid
        self.assertTrue(out['windowDither'])
        self.assertFalse(out['umbrielInclude'])
        self.assertTrue(shader.exists())
        self.assertEqual(out['corners'], 'sharp')
        self.assertIn('pixel-backgrounds', out['background'])
        self.assertTrue(hook.exists())
        # through the pixel style and back
        self.run_script('set', 'pixel')
        restarts = self.calls().count('restart')
        out = self.run_script('set', 'mix')
        self.assertFalse(out['shellBlock'] or out['nativeText'])
        self.assertEqual(sha(shell), before)
        self.assertEqual(json.loads(shell_json.read_text())['bar']['background'], 'none')
        self.assertEqual(self.calls().count('restart'), restarts + 1)
        self.assertEqual([c for c in self.calls() if c.startswith('cursor')], ['cursor pixel', 'cursor auto'])
        self.assertTrue(out['windowDither'] and shader.exists())
        # and to the Tusche style: everything as found
        out = self.run_script('set', 'tusche')
        self.assertEqual(out['corners'], 'theme')
        self.assertEqual(out['background'], original_bg)
        self.assertFalse(out['windowDither'] or shader.exists() or hook.exists())
        self.assertEqual(sha(shell), before)

    def test_previous_corner_choice_returns(self):
        subprocess.run([str(self.bin / 'omarchy-hyprland-corners'), 'rounded'], env={'HOME': str(self.home)}, check=True)
        self.run_script('set', 'pixel')
        out = self.run_script('set', 'tusche')
        self.assertEqual(out['corners'], 'rounded')

    def test_user_edit_in_between_keeps_the_edit(self):
        shell = self.home / '.config/omarchy/shell.toml'
        self.run_script('set', 'pixel')
        shell.write_text(shell.read_text() + '\n[tooltip]\nbackground-alpha = 0.9\n')
        self.run_script('set', 'tusche')
        text = shell.read_text()
        self.assertNotIn('tusche pixel style', text)
        self.assertIn('base-size = 14', text)
        self.assertIn('background-alpha = 0.9', text)

    def test_theme_switch_draws_a_new_grid_and_returns_the_new_theme_background(self):
        self.run_script('set', 'pixel')
        first = os.path.realpath(self.home / '.local/state/omarchy/current/background')
        new_bg = self.theme('morgenrot')          # Omarchy's theme switch sets its background
        out = self.run_script('retheme')
        self.assertIn('pixel-backgrounds/morgenrot-grid', out['background'])
        self.assertNotEqual(out['background'], first)
        out = self.run_script('set', 'tusche')
        self.assertEqual(out['background'], os.path.realpath(new_bg))

    def test_background_chosen_while_pixel_stays(self):
        self.run_script('set', 'pixel')
        mine = Path(self.tmp.name) / 'mine.png'
        mine.write_bytes(b'png mine')
        link = self.home / '.local/state/omarchy/current/background'
        link.unlink()
        link.symlink_to(mine)
        out = self.run_script('set', 'tusche')
        self.assertEqual(out['background'], os.path.realpath(mine))

    def test_grid_uses_the_screen_size(self):
        out = self.run_script('set', 'pixel', '--no-restart')
        from PIL import Image
        self.assertEqual(Image.open(out['background']).size, (2560, 1600))


if __name__ == '__main__':
    unittest.main(verbosity=1)
