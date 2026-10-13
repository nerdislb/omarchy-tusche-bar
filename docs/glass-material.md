# Frost / Smoke · Bevel Lens

Frost is light glass; Smoke is dark glass. The owner selected direction B
with one correction: **retain the existing frame geometry**. Popup radii
come from the native card; notification geometry is unchanged. Each new
theme's `hyprland.lua` is byte-identical to Platin or Chrom. Rounding, border
width, gaps, display settings and global compositor blur are not overridden.

## Use

Install matching Bar and Island versions, then choose **Frost** or **Smoke**
in the normal theme picker. All existing themes remain available.

Two independent Control Center choices:

- **Glass material:** Bevel Lens / Solid surface.
- **Glass motion:** Soft spring / Classic roll.

```sh
omarchy theme set smoke
omarchy-shell tusche-bar set glass on
omarchy-shell tusche-bar set glassMotion on
```

Reduced Motion remains authoritative: fixed geometry and the native opacity
fade, without a spring or travelling light. The resting bar and Island stay
solid and compact. Existing quota rings and window-focus glints are retained;
there is no new window animation or continuously moving highlight.

## Native material

`GlassBackdrop.qml` composes the current still wallpaper and intersecting,
mapped, visible toplevels on the displayed workspace using Quickshell's
native toplevel export. It **never captures a whole screen** or shell layers,
avoiding optical feedback. Captures stay in GPU/RAM textures, never saved
screenshots or a network stream. Sleeping/locked outputs do not export
toplevel content. Source captures are constrained to 1600×1000 and released
when the card is gone or the material is disabled.

`GlassSurface.qml` pre-blurs the source before the original
`shaders/glass.frag` samples it, including at the refracted 9 px bevel.
Backdrop brightness is bounded before tinting (0.62 Frost / 0.66 Smoke) to
protect foreground text. A 650 ms light sweep runs once on entry. Shader
source and QSB ship with both companions. No Omacale source is copied.

`GlassMath.js` advances an analytic, lightly under-damped spring. Reversing
or reopening retains velocity and position; completion stops its frame
clock. The reveal mask clamps overshoot so the card's dimensions and corners
do not change. Audio's last open geometry/content remain through closing
even if its native content immediately shrinks.

No private service capability is added. Omarchy remains the native bar and
popup owner; `NativeMaterial` uses the existing presentation adapter.

## Verification

```sh
node tests/glass.cjs
TUSCHE_ISLAND_DIR=/path/to/omarchy-tusche-island node tests/regressions.cjs
python3 tests/glass_runtime.py --output /tmp/glass-native-evidence
```

The runtime test runs production Qt components, the real Omarchy Border
factory and OpenGL RHI under Xvfb, with an authored backdrop. It does not
touch the desktop, lock, inbox or application content. It covers entry,
return/reopen, frozen closing geometry, square frames, stopped clocks,
independent switches and Reduced Motion. Rest and returned-rest images must
be pixel-identical. This is native Qt render/lifecycle evidence, **not live
compositor-capture or GPU/battery certification**.

`omarchy-shell tusche-bar state` reports effective options and native cards'
radius, dimensions, reveal, spring/light activity and capture count. Verify
the loaded generation, not only file hashes. Omarchy preserves its lock
service on plugin rescan, but refuses a full shell restart while securely
locked. Respect that boundary; do not kill or replace the locker for testing.

`dev-install.sh` publishes content-addressed code generations through
`bin/install-generation.py`. All manifest entry points and only this bar's
owned custom-module source URLs move together. Layout order, unknown settings
and file permissions are preserved; old payloads remain for rollback.
Changing URLs avoids stale Qt components without restarting authentication
services. `python3 tests/generation_install.py` checks the scoped merge,
idempotence, update and rejection of edited installed generations.

Capture API: [Quickshell ScreencopyView](https://quickshell.org/docs/v0.2.0/types/Quickshell.Wayland/ScreencopyView/).

## Limits

Toplevel export requires Hyprland's installed protocol. If unavailable,
the safe fallback is the still wallpaper or tint. Floating-window stacking
uses focus history, an approximation where windows overlap. Animated/video
wallpapers use the solid fallback rather than an unsynchronised decoder in
each card. A static material has no animation timer, but live changing
toplevel content can still consume GPU work. Multi-monitor spanning,
fractional scaling and battery cost need separate live checks.

Rebuild the shader:

```sh
/usr/lib/qt6/bin/qsb --glsl '100 es,120,150' --hlsl 50 --msl 12 \
  -o shaders/glass.frag.qsb shaders/glass.frag
```

Synchronize the shared MaterialCard, Glass components/math and shader/QSB
into the Island's `views/`. `tools/build-glass-themes.py` rebuilds the two
themes from the existing metal-family assets and palettes.
