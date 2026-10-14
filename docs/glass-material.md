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
solid and compact. There is no continuously moving highlight.

## No chrome

Frost and Smoke are not metal themes (design round 14.10.2026): their
`bar-material.json` has no `metal` block, and everything chrome in the bar hangs
on that block. So there is no chrome frame round the logo, the quota rings and
meters are the plain Tusche ones, the Island's segment (the clock) has no
chrome rim, the menu hover is the plain row, and nothing glints on a workspace
switch. Chrom and Platin keep all of it.

The window frame keeps Platin's and Chrom's stripes (`hyprland.lua`, see above).
Its focus glint (option *Window frames → Glint on focus*) is the glass one,
`GlassFrameGlint.qml` with `shaders/frameglass.frag`, drawn by `WindowGlint.qml`
instead of the chrome `MetalShape` kind "frame": the light a Bevel Lens card
catches as it opens, one wide, cool, soft band that crosses the frame
diagonally once in 650 ms (as the popups' light, from the top-left corner to
the bottom-right one), with a faint bevel shadow beside it and a soft light
spilling a few pixels over the edge. No dark steel shoulders, no colour
fringes, no sparks. It follows the glass material switch and Reduced Motion
(off), draws only while it runs, and the "orbit" style is metal-only. Tune it
in the theme's `glass.frame` (`tools/build-glass-themes.py` writes it):

| Key | Meaning | Frost / Smoke |
|---|---|---|
| `ms` | duration | 650 / 650 |
| `band` | band half width, a fraction of the frame's diagonal | 0.10 / 0.10 |
| `amount` | strength at the start, fading to nothing | 0.66 / 0.56 |
| `shadeAmt`, `shade` | bevel shadow beside the band | 0.15, `#3a5675` / 0.12, `#03060b` |
| `bloom` | soft light just outside (and a few px inside) the frame | 0.8 / 0.65 |
| `tint` | the light | `#ffffff` / `#cfe3ff` |

## Pictures

Frost and Smoke carry three pictures of their own, made for glass (design
round 14.10.2026), not Platin's and Chrom's. The first one is the theme's
default; the others are one `omarchy theme bg next` away.

| Theme | Pictures (default first) |
|---|---|
| Frost | Raureif (hoar-frost ferns), Gletscherlicht (ice cave), Prisma (prism spectrum on plaster) |
| Smoke | Rauchband (silky smoke), Regenglas (raindrops, night bokeh), Rauchquarz (smoky quartz) |

They are AI-generated stills (`tools/glass-backgrounds/PROMPTS.md`), 1920×1080,
calm in the upper third where the menu and the audio popup open. The glass
keeps menu and popup text at 5.5 : 1 or better on all six (measured on the
rendered pixels in the design round). The bar is opaque
(`background-alpha = 1.0`), so its text does not depend on the picture; only
the still haze under the bar and the bar's lower edge meet it. The previews
(`preview.png`) are rendered with a schematic bar, not captured from the live
desktop. The pictures are still images: video wallpapers keep the solid
fallback described below.

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
python3 tests/glass_frame_runtime.py --output /tmp/glass-frame-evidence
```

`glass_frame_runtime.py` renders the production `GlassFrameGlint` and its shader
over a fake window (Xvfb, no screen capture; needs Pillow): at rest and after
the glint nothing is drawn (pixel-identical to the scene without it), mid-glint
the light lies along the frame and reaches no deeper than a few pixels into
the window, and it is cool or neutral, never warm.

The runtime test runs production Qt components, the real Omarchy Border
factory and OpenGL RHI under Xvfb, with an authored backdrop. It does not
touch the desktop, lock, inbox or application content. It covers entry,
return/reopen, frozen closing geometry, square frames, stopped clocks,
independent switches and Reduced Motion. Rest and returned-rest images must
be pixel-identical. This is native Qt render/lifecycle evidence, **not live
compositor-capture or GPU/battery certification**.

The popup host fixture deliberately shadows `contentItem` with a children
list, like Omarchy's KeyboardPanel/PopupCard. GlassSurface maps to the actual
visual scene root, not that alias. The test checks the real origin without
overriding screen coordinates, including ancestor-position updates. This
guards against a live-only type error that previously left the backdrop at
(0, 0). Keep the Island's `views/GlassSurface.qml` copy identical.

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

The glass frame glint's integration (`WindowGlint.qml` choosing the renderer,
the Hyprland events that start and stop it) cannot run without Hyprland: the
native test covers the renderer, the live behaviour is checked with
`omarchy-shell tusche-bar glintWindow` and `omarchy-shell tusche-bar state`
(`frames.renderer` is `glass`).

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
themes from the metal family's frames and palettes and the pictures in
`tools/glass-backgrounds/`.
