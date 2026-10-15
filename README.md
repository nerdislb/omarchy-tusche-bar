# Tusche Bar

Presets, modules and motion for the **native** Omarchy bar, made for Tusche & Papier, the metal pair Chrom & Platin, and the glass pair Frost & Smoke (all included). It adds:

- **Logo and workspaces:** a compact workspace row with your own logo (Omarchy, the Arch mark or the Nerdibeard seal);
- **Status:** AI quota gauges and status groups (network, phone, system);
- **Menu:** a drop-down logo menu that holds the whole Omarchy menu, searchable;
- **Popups:** your popups and Omarchy's own ones (volume, battery, Wi-Fi …) in the theme's material: rolling cards on Papier and Tusche, an ink bloom with a dried rim on the Lavur themes, thin liquid-chrome rims on Chrom and Platin.

Everything is switchable in its own Control Center. The bar stays Omarchy's own: every widget keeps its own service. It works with any Omarchy theme; the material comes with themes that ship a `bar-material.json` (the eight themes in `themes/`).

### Frost & Smoke

Light **Frost** and dark **Smoke** add Bevel Lens glass to menus, native
popups and Island notes. Existing frame geometry is retained — no rounded
window override. Glass and the interruptible spring are independently
switchable; Reduced Motion removes the spring and light sweep. See
[Glass material](docs/glass-material.md) for capture boundaries, verification
and limitations. Existing themes remain unchanged. Each of the two ships three
pictures of its own, made for glass: Frost has Raureif, Gletscherlicht and
Prisma; Smoke has Rauchband, Regenglas and Rauchquarz. They carry no chrome
(that is Chrom's and Platin's): the bar's rings, logo and clock segment are
plain, and the window frame's focus glint is a soft, cool light band like the
popups' own, not a chrome spark.

![The bar in Tusche Lavur](docs/screenshots/bar-tusche-lavur.png)
![The bar in Papier](docs/screenshots/bar-papier.png)

| Logo menu, Tusche Lavur | Logo menu, Papier | Omarchy's volume popup, Tusche Lavur |
|---|---|---|
| ![Drop-down menu blooming open](docs/screenshots/menu-tusche-lavur.gif) | ![Drop-down menu in Papier](docs/screenshots/menu-papier.png) | ![Volume popup in the ink material](docs/screenshots/audio-tusche-lavur.png) |

### Chrom & Platin

Two liquid-metal themes: **Chrom** (liquid chrome on black) and **Platin** (polished platinum, the light one). Thin chrome rims run along the bar's edge, the popups, the AI rings and the menu. The metal stands still: a popup glints once as it opens, the rings and the logo when you switch workspace. Window borders carry still chrome stripes; the option *Window frames → glint* uses the same short diagonal light sweep as the popups on focus. The longer glint once around the window remains available as *orbit*. Switch with `setup/install.sh --theme chrom` (or `platin`). Details are under [Metal: Chrom & Platin](#elements-and-variants) below; there is also a [short video](docs/screenshots/chrom-platin.mp4).

![Chrom (left) and Platin (right)](docs/screenshots/chrom-platin.jpg)

| Logo menu, Chrom · Platin | AI quota card, Chrom · Platin |
|---|---|
| ![Drop-down menu with the chrome hover tube](docs/screenshots/chrom-platin-menu.gif) | ![Quota card with chrome rings and meters](docs/screenshots/chrom-platin-quota.png) |

Companions: [Tusche Island](https://github.com/nerdislb/omarchy-tusche-island) (clock, live activities and notifications) and [Card Picker](https://github.com/nerdislb/omarchy-card-picker) (themes and wallpapers as a hand of cards).

## Requirements

- **Omarchy:** a recent version with the Quickshell shell (the dev line of early October 2026 or later). The plugin uses Omarchy's panel and menu plugin kinds; an older Omarchy refuses its manifest, and the setup script checks that first.
- **Tools:** `git`, `jq`, `python3` and `rsync` (all present on Omarchy).
- **Session:** run the commands as your user in the desktop session.

## Install

### The whole look

Installs the eight themes (Tusche & Papier with their Lavur variants, Chrom & Platin, Frost & Smoke), this bar, the Tusche Island and the Card Picker, with the author's bar combination `paper`:

```sh
git clone https://github.com/nerdislb/omarchy-tusche-bar.git ~/src/omarchy-tusche-bar
~/src/omarchy-tusche-bar/setup/install.sh --dry-run   # shows every step, changes nothing
~/src/omarchy-tusche-bar/setup/install.sh
```

The script:

- backs up everything it touches first;
- clones the other two repositories into `~/src`;
- puts the island in the place of Omarchy's clock;
- restarts the shell and switches to Papier.

Options: `--theme tusche|papier-lavur|tusche-lavur|chrom|platin|frost|smoke`, `--no-card-picker` and `--boot-logo` (the seal on the boot screen, asks for sudo). Details are in [setup/README.md](setup/README.md). Undo with `setup/revert.sh <backup folder>`, which the script names at the end.

### Only the bar

```sh
git clone https://github.com/nerdislb/omarchy-tusche-bar.git ~/src/omarchy-tusche-bar
cd ~/src/omarchy-tusche-bar && ./dev-install.sh
omarchy-shell shell rescanPlugins
omarchy plugin enable nerdibeard.tusche-bar
omarchy restart shell
```

Then pick a look:

- **Control Center:** middle click on the bar's logo.
- **Preset:** `omarchy-shell tusche-bar preset tidy` (`tidy` or `focus`).
- **Single setting:** for example `omarchy-shell tusche-bar set logo arch`.

Your own bar layout is saved the first time and comes back with `omarchy-shell tusche-bar preset today`.

Menu entries and status groups for optional plugins only appear when those plugins are installed: Flux, Buds, OmaMail, WhatsApp, Proton VPN, the system monitor and others.

**Super+Space** can open the logo menu as a launcher: the search line is ready, apps lead the results, and Super+Alt+Space opens it on the Apps list. Switch it in the Control Center (Quick → Super+Space → Bar menu with search) or with `omarchy-shell tusche-bar set keys bar`; `… set keys omarchy` gives Omarchy's own menus back. It keeps one managed block in `~/.config/hypr/bindings.lua` (`bin/keybinds.py`), and when the bar is not running the keys still open Omarchy's menus. The whole-look install turns it on.

### Moving backgrounds (optional)

Very quiet 60-second loops of the theme stills: mist drifting through the
valleys, the lighthouse beam turning, dust in a shaft of light, cloud shadows,
and once a minute a few far birds or a falling leaf. The stills stay each
theme's default; the loops are extra backgrounds (`4-berge-bewegt.mp4` …) you
pick in the card picker or with `omarchy theme bg next`.

```sh
~/src/omarchy-tusche-bar/setup/motion-backgrounds.sh install   # ~25 MB from the GitHub release, checksummed
~/src/omarchy-tusche-bar/setup/motion-backgrounds.sh remove
```

Or `setup/install.sh --animated`. They are 1080p HEVC Main10 (decoded in
hardware on most machines); Omarchy pauses video backgrounds behind
fullscreen windows. `tools/motion-backgrounds/render.py` renders them from the
stills (numpy): every scene is a pure function of time, frame 60 s = frame 0.

### Coming from the Amiga Bar

The Tusche Bar and Island were called Amiga Bar and Amiga Island until October 2026. `setup/install.sh` carries such a setup over by itself: the options, saved combinations, base layout, island settings and state move to the new names (`setup/migrate-from-amiga.py`), the removed Amiga extras undo what they changed outside the plugin (fastfetch logo, desktop font profile, the A500 bar form), and the old plugin folders go into the backup.

## Update

```sh
git -C ~/src/omarchy-tusche-bar pull
~/src/omarchy-tusche-bar/dev-install.sh
omarchy restart shell
```

Re-running `setup/install.sh` updates all three repositories.

## Uninstall

```sh
omarchy-shell tusche-bar preset today      # your own bar layout back
omarchy plugin disable nerdibeard.tusche-bar
rm -r ~/.config/omarchy/plugins/nerdibeard.tusche-bar
```

After a whole-look install, `setup/revert.sh <backup folder>` is the complete undo.

---

The sections below are the reference: how it is built, every option, IPC and tests.

## Architecture

- `Engine.qml` — keep-loaded panel plugin (`nerdibeard.tusche-bar`): Control Center, presets, IPC. It writes `bar.layout` through `bin/apply-layout.py` (atomic, keeps shell.json's 0600 mode). The bar itself stays `omarchy.bar`.
- Why not a replacement bar: under a plugin bar, Omarchy hands third-party widgets a service-less shell facade (a security boundary), so OmaMail, WhatsApp and Flux would lose their own services.
- Own parts are custom QML modules in the layout (`{ "id": "tusche.x", "source": "<plugin>/modules/X.qml", ... }`); one plugin can register only one bar widget.
- `modules/Status.qml` mounts the widgets it folds away invisibly (`embeds`: id → original settings), so their native popups (Wi-Fi, Bluetooth, VPN, Tailscale, monitor, drive, radar, plugins, buds, system monitor) still open from our groups. Flux, OmaMail and WhatsApp are not embedded (they need their own services); Flux is read via `flux-cli` and opened as its window. Weather and world clocks stay native (their popups position via the centre section).
- The user's layout is captured once in `~/.local/state/tusche-bar/base.json`; **Today** restores it. Options live in this plugin's `plugins[]` entry.

## Elements and variants

| Element | Variants |
|---|---|
| Workspaces (`Workspaces.qml`, with the menu logo) | today, pips, stack, logo (the frame carries the number), minimap |
| AI quotas (`Quota.qml`) | today, gauge, vu, rings, ondemand |
| Right side (`Status.qml`) | today, groups, deviations — the system group shows a chip outline that fills from below like the battery (CPU in 6 rows, one row from 2 %); CPU > 85 % or RAM > 90 % turns only the fill to the alarm tone |
| Bar edge (`ThemeEdge.qml`) | none (default), theme (light & shadow from the theme's `bar-material.json`) — kept by presets |
| Logo (`ArchLogo.qml`, `SealLogo.qml`) | omarchy, arch (the official Arch Linux mark, unaltered, in the bar's ink), nerdibeard (the seal: nb cut out of a 16 px ink block); with native workspaces only the menu logo is replaced; the drop-down's title follows the logo |
| Centre (`Centre.qml`) | today, calm (temperature at the weather glyph) |
| Super+Space (`bin/keybinds.py`) | omarchy (Omarchy's menus, default), bar (the logo menu with the search line; Super+Alt+Space on the Apps list) — kept by presets |
| Window frames (`WindowGlint.qml`) | hyprland (Hyprland's own border, default), glint (the popups' short diagonal sweep on focus), orbit (a glint once around the window; metal themes) — kept by presets |

Presets: `today` (your bar), `tidy` (pips · gauge · groups), `focus` (stack · on demand · deviations).

**Edge from the theme** (`edge: theme`) reads `bar-material.json` from the
current Omarchy theme (the eight themes here ship one; other themes show
no edge) and follows theme switches. `edge.kind` `dry`: a line over the bar's
lower edge on Overlay (light in Tusche, ink in Papier), and under it a short
hard shadow, a glow and a still haze on the Top layer — while the workspace
has windows only in the gap above them (`general:gaps_out`), in full on an
empty one (on the Bottom layer Hyprland blends layer surfaces additively, so
a dark haze would never show). `kind` `lavur`: a pre-rendered wash
(`bar-lavur.png` in the theme) instead. `kind` `metal` (Chrom, Platin): a
chrome tube along the bar's lower edge, with the `haze` below it.

With the material, popups (drop menu, quota, status, and Omarchy's own) roll
out of the bar from the top in the theme's frame with its shadow (Papier: hard
ink, 6/6) or halo (Tusche), hanging flush from the bar
(`MaterialCard.qml`); the logo becomes an inverted tab while the drop menu is
open, and the hovered row inverts. A material card with `bloom` (the Lavur
themes) blooms instead of rolling: a drop falls out of the bar and grows to
the card's size as one sheet of wet paper (`InkSheet.qml`). Ink fills it (in
the tide colour, `tide`), the water clears it from the source
(`shaders/wetink.frag`) and its residue evaporates with the water; the
pigment dries into a rim at the calm edge – a blurred blob cut at a gently
noise-displaced threshold (`shaders/bloomcut.frag`), the rim just inside it
gathered in a few short denser sections, a broken faint drying line further
in (`shaders/restink.frag`, over the paper's mask blurred by
`shaders/gauss.frag`); all noise in the card's own coordinates. Under it a
halo: Papier a short soft ink wash, Tusche a flat dark seam plus a breath of
moonlight. The theme tunes it with `card.rest` (`ridge`, `pool`, `echo`,
`residue`, `halo` parts with `color`, `alpha`, `blur` = σ in px, `dx`, `dy`,
`spread`, `dh`). The compiled `.qsb` files ship next to the shaders; rebuild
one with `qsb --glsl "100 es,120,150" --hlsl 50 --msl 12 -o shaders/X.frag.qsb shaders/X.frag`.
The drop menu's hover is then a brush stroke (`brush`, a PNG in the theme
folder). With `tones.strong` the bar's own text is the quieter tone (the
theme sets it) and logo and the active workspace's number stay strong. The
Tusche Island takes the same material for its notes. Reduced Motion: the
roll and the bloom jump, the content fades.

**Metal: Chrom & Platin** (design round 07.10.2026). Chrom is Tusche's black
with a cool steel tint, Platin a cool platinum grey; red stays the one signal
colour. Their `bar-material.json` carries a `metal` object, and everything
metal is one shader (`shaders/metal.frag`, `MetalShape.qml`, in both repos): a
chrome tube along a rounded rect, a ring with a filled arc, or a cylinder bar.
Its studio's light stripes lie around the outline; at their brightest edges a
small per-channel offset gives orange/blue fringes. Chrome frames the bar's
lower edge, the cards and the island's notes and segment (`rim` px), the
logo (`logo`), the hovered menu row (`hover: "tube"`, a pill or `hoverRadius` px corners); the AI rings show the quota
as a solid arc with a chrome head on a flat track (`ringStyle` 2; 1 = chrome
arc, 0 = chrome all round; `rings`, `ring` px tube, `ringSize` px) and the meters chrome
cylinders over a `track` (`meters`); from 90 % the metal takes the signal
colour. The metal stands still – nothing redraws at rest. A card glints as it
opens, and a workspace switch runs a glint once over the rings and the logo,
at most every `pulseGapMs` (4000); the bar's edge stays still unless
`edgeGlint` is true (`sweepMs`, 900); only then do the fringes spark. `flow` > 0 (rad/s) makes the
highlights flow all the time instead, like the liquid-metal video that started
the round (costs a redraw every frame while visible). Other keys: `tint`,
`light`, `disp`, `spark`, `sharp`, `gain`, `base`. Window borders are
Hyprland's own: the bar's studio stripes as a still, diagonal 10-stop gradient.
Hyprland can only turn that gradient (`borderangle`), in 1° steps, and a turning
line races along a rectangle's edges and lingers at its corners, so it stays
still. The option **Window frames → glint** (`omarchy-shell tusche-bar set
frames glint`, `WindowGlint.qml`) runs the same short diagonal light sweep as
the popups: from top-left to bottom-right, with the same easing and fade
(`sweepMs`, 900). The longer, slowing glint once around the frame remains an
alternative: **Window frames → orbit** (`omarchy-shell tusche-bar set frames
orbit`, `frameGlintMs`, 2800), placed by arc length for an even pace around
the corners. Both draw only the glint on a click-through layer the size of the
frame. They start once the window has settled and stop when it moves, the
workspace changes, or the theme/style changes; `omarchy-shell tusche-bar
glintWindow` runs the selected style on demand, for other events. `tools/build-metal-themes.py` builds both themes
from Tusche and Papier. Reduced Motion: no glint, no flow.

AI usage records (`~/.local/state/omarchy/agents/usage`) are refreshed by
`omarchy.agents` only while it sits in the bar. When a variant folds the AI
widgets away, the engine runs `omarchy-agent-usage-update` itself with that
widget's interval and disabled providers (retrying advised limits after 30 s),
and fetches limits when the quota popup opens. A limit past its reset time
always counts as reset (0 %), even before a fresh record arrives.

The bar shows the AI usage selection (`~/.config/omarchy/ai-usage-deepseek.json`
`tracked`); in the rings variant a tracked agent without numbers right now
(Antigravity while its app is closed) keeps a quiet empty ring. Left click
opens a card per agent – every agent with a record that has numbers, limits or
a plan, the tracked ones first: name, plan and freshness, sign-in or app notes,
each limit window with its meter and reset time (a prepaid balance with its
ledger note), today's prompts, sessions, tokens and top models, tokens over the
last seven days, and all-time figures with the most used model. ←/→ (Tab), the
scroll wheel, 1–9 or a click on the row of agents switch cards; r refreshes.

## Logos: Arch and the Nerdibeard seal

Expressive only once, when the logo arrives (the bar starts or the option
switches to it), then still – no hover effect, no loop.

- `arch` (`modules/ArchLogo.qml`): the first path of
  `/usr/share/pixmaps/archlinux-logo.svg` (package filesystem) without the ™,
  one fill in the bar's strong ink, 1.18 × the 18 px field (the triangle
  reads lighter than a square glyph), centred like the Omarchy glyph.
  Arrival: one fade, 0.22 s (reduced motion 0.12 s). The tab inverts it.
- `nerdibeard` (`modules/SealLogo.qml`): a 16 × 16 block with a 1 px rim and
  the initials nb cut out in squared seal script, whole pixels, its top line
  on the workspace frame's. Arrival: one impression, 0.32 s – the ink at the
  letters' edges prints at once, the rest soaks out to the rim in a fixed
  order. Press: the ink takes the tab's tone. Drop-down (theme material): the
  ink runs out of the seal into the tab once (0.24 s, a rounded front, the nb
  readable throughout); closing restores the rest state once the card is
  back. Reduced motion: 0.12 s cross-fades.

Switch: Control Center → Logo, or `omarchy-shell tusche-bar set logo
omarchy|arch|nerdibeard`.

## Boot screen logo (Plymouth)

`bin/boot-logo.py set nerdibeard|arch [--theme NAME]` puts the seal (a
finished stamp impression, a fifth smaller than the 230 px logo box, set a
touch crooked) or the unaltered Arch mark on the boot screen that asks for
the disk password, in the theme's foreground on its background (default: the
current theme). The marks are 240 × 240 alpha masks (`assets/boot/*.alpha`);
the script composes the PNG under `~/.local/state/tusche-bar/boot-logo/` and
hands it to Omarchy's `omarchy-plymouth-set`, which asks for the sudo
password and rebuilds the initramfs. `restore` puts the theme's own
unlock.png back (`omarchy-plymouth-set-by-theme`), `restore --default`
Omarchy's logo; `status` tells what the boot screen shows. The boot screen
does not follow the bar's logo option or theme switches by itself (each
change needs sudo). Test: `python3 tests/boot_logo.py`.

## Logo menu

- `DropMenu.qml`: left click on the logo (or `omarchy-shell tusche-bar menu`) folds out one tall menu under the logo; with the theme material it rolls or blooms out of the bar like the other popups. Its first level is the Omarchy menu itself, Apps to System — `omarchy-menu.jsonc` read by `OmarchyMenuSource.qml` with Omarchy's own model library (`vendor/MenuModel.js`, unchanged copy) including `when:`/`checked:`/`disabled:` guards. **More** holds what `~/.config/omarchy/extensions/omarchy-menu.jsonc` adds to the root (Window Overview …) and our groups Agents · Network · Phone · Widgets · Tusche (Control Center, island, Terminal, Do not disturb, Stay awake, Transparent bar); extension entries under an Omarchy submenu stay there. `omarchy-shell tusche-bar search` (Super+Space) opens it as a launcher: the search line is shown, apps come first, then menu entries with their path; `… apps` (Super+Alt+Space) opens it on the Apps list. Submenus open inside it (‹ back), typing searches the whole tree and lists matching apps after the menu hits (at most 8); ↑↓, PgUp/PgDn, Enter/→, ←/Backspace, Esc. Right click on the logo: Omarchy's own centred menu. Middle click: the Control Center.
- Nested like the native menu, so a pick in the drop-down never ends in the centred menu:
  - **Lists the shell fills in** open as levels inside it: **Apps** from the shell's application library (the facade Omarchy hands to plugins of kind `menu` — hence `"menu"` next to `"panel"` in `manifest.json`; the plugin still loads as the same keep-loaded panel), alphabetical with the apps' own icons, launched like the native menu; **Font**, power profiles and **Setup → Language** with the native menu's own bash providers (✓ on the current value). Typing inside a list filters it; languages are also searchable by English name or code. Font and language lists refresh on re-entry. Selecting a language runs Omarchy's own `omarchy-language` command. Without the library (older shell) or for an unknown provider the native menu opens there as before.
  - **Language scope:** the picker shows native language names and changes Omarchy's language and session locale through that command. The drop-down's other labels still use the English menu definition and user extensions; native menu catalogs and translated power-profile labels are not wired here. Bash-provider rows (languages, fonts and power profiles) are searchable inside their list, not in the drop-down's whole-tree search.
  - **Questions** an action asks through `omarchy-menu-select` / `omarchy-menu-input` (Keybindings, Timezone, the plugin rows, Remove › TUI/Theme/Web App, Transcode …) are answered inside it. Every Omarchy action started from the drop-down runs with `bin/menu-shim` first on its `PATH`; those two shims take the same arguments, stdin and file protocol as Omarchy's commands and hand the payload to `omarchy-shell tusche-bar ask`. When no drop-down takes it (no Tusche Bar, no logo shown, shell not answering) they run Omarchy's own command with the same prompt, options (stdin included) and menu arguments. An action known to ask keeps the drop-down open on a waiting level that turns into the question, or closes when the action ends without asking (at the latest after 3 s). The answer is written as the native menu writes it (the selection file, then the done file); Esc, ×, a click outside, ‹ and every other close cancel (the done file alone), so no script is ever left waiting. `tusche-bar state` shows `ask`.
- Omarchy's own popups take the theme material too (`NativeMaterial.qml`): the status module finds the KeyboardPanel of every Omarchy widget it folds (network, Bluetooth, Tailscale, monitor …) and of Omarchy's panel widgets that stay in the native bar (audio, power, weather, world clock …; it keeps watching, as Omarchy may create them later or anew) and hangs a `MaterialCard` into it, as our own popups declare one. Omarchy's code is untouched; widgets keep their own (trusted) bar and services. A popup the search does not recognise keeps Omarchy's look; without a material nothing changes. `tusche-bar state` shows `natives`.

## Control Center

`ControlCenter.qml` (pure model in `ControlCenter.js`): Quick · Configure,
areas on the left (Quick, Tusche Bar, Tusche Island, Card picker, Health),
editor on the right, Ctrl+K search over settings and their values, a Health
chip. Edits are staged and confirmed explicitly:

- **Use** applies the staged changes live; the window stays open.
- **Save** applies what is still staged and closes.
- **Cancel** (button, ×, Esc once the search is closed, click outside, or any
  other close) restores the state from opening if Use applied something, then
  closes.

Bar options go out as one write (layout changes rebuild the bar; look options do not), island settings
through `omarchy-shell tusche-island set …`, the card picker through its
`menu-override.py`; one step at a time, each confirmed before the next. Health
only reports live checks (base layout, AI usage refresh, notification takeover
marker, card picker override, last write, saved combinations).

### Visual editing and optional presentation

The **Tusche Bar** page now shows selectable logo, workspace, quota and status
faces. These are the same pure renderers used by the live bar, with read-only
snapshots of its running widgets. Hover or keyboard focus previews a variant;
click, Enter or Space stages it. Preset cards describe their actual differences.
Native **As today** widgets and missing readings are labelled, never invented.
Use / Save / Cancel retain their existing meaning. Papier, Tusche, Lavur,
Chrom, Platin, Frost and Smoke keep their materials and typography.

**Motion** plays the current material's real popup and frame effects locally,
at production speed, with Stop and reduced-motion support. It uses an authored
backdrop, never a screen capture; playback ends at rest and stops on leaving.
It does not trigger real window focus or simulate the Island's full transitions.

**Screens** selects `compact` (pips, on-demand quotas, status deviations),
`detailed` (minimaps, rings, status groups) or shared presentation per output.
These choices also stage until Use / Save. Cancel restores only outputs touched
by Use. Disconnected outputs retain their profile. Profiles affect already-active
Tusche modules, not native **As today** widgets; no display geometry, resolution,
hardware settings, native services or theme changes are involved.

The **Minimap** variant shows real monitor-relative window rectangles, floating
outlines and off-screen-page counts, including workspaces above 10 and named
workspaces. Geometry refreshes on relevant compositor events and pointer entry,
not an idle timer. Some silent resizes therefore appear on the next such event.
On Quickshell 0.3.2 / Lua Hyprland, native monitor/workspace metadata can be
empty even when native client metadata works. One shared, bounded read-only
`hyprctl` batch supplies sanitized geometry in that case; no titles/PIDs are kept.

Three optional look settings default **off** and survive preset changes:

- **Device announcements**: when the default audio output moves (a headset
  taking over, a dock going away) or a Bluetooth device connects or disconnects,
  one line goes to Omarchy's on-screen display (`omarchy-osd -m …`). When the
  island owns the OSD, the line lands in its HUD; the bar itself gets no extra
  slot and no click target moves. Volume and brightness keep Omarchy's own OSD,
  so they are not repeated, and nothing is polled: PipeWire and BlueZ are
  observed through Quickshell's public services, never through a native widget.
  The island already announces Bluetooth devices unless its own `bluetooth`
  setting is off, so Bluetooth stays quiet here in that case. Start-up and late
  sources set silent baselines, at most one line goes out per 1.5 s (a flapping
  device ends in its final state), and device names are cleaned to one plain
  line and passed as an argument, never through a shell. Option key
  `statusHints`, off by default.
- **Day progress**: a minute-resolution, one-device-pixel accent line inside a
  horizontal bar's edge. It takes no input or extra reserved screen space and
  uses the native bar's fullscreen stacking. Hidden/vertical bars show no line.
- **Focus seal**: after applying this option, **Quick → Start focus mode** parks
  the native bar offscreen while its widgets/services remain alive. A small seal
  brings the bar back with a click (left or right); the middle button opens the
  Control Center. The seal stays calm and says only what the bar would have: a thin
  line under it while the battery is at or below 30 % and discharging (urgent
  colour at 15 % and below), and a small square in its corner when a workspace
  needs you (from the bar's workspace module, when it is in the bar). For a key:
  `omarchy-shell tusche-bar focus toggle` parks the bar, or brings it back when it
  is hidden; bind it yourself, nothing adds a binding. Disabling the option
  releases only its own unchanged hide flag, preserving a pre-existing or later
  manual hide. Recovery: `omarchy-toggle-bar off`.

Focus ownership is stored privately in
`~/.local/state/tusche-bar/focus-owner.json`. A failed native command is rolled
back when possible, otherwise ownership remains for recovery. Explicit Show
archives an unreadable ownership file instead of blocking future starts.

## Saved combinations

The Control Center's Tusche Bar area includes **My combinations**. Enter a name
and choose **Save / replace** (saves the options as shown, staged ones
included); select a saved name to stage it like a preset, or × to remove it.
These are variant selections, not snapshots of accounts or the whole desktop.
Data stays in `~/.local/state/tusche-bar/presets.json`.
IPC: `omarchy-shell tusche-bar save "My focus"` / `... load "My focus"`.

Folded widgets receive a presentation-only adapter, not access to another
plugin's services. Native Wi-Fi QR/speed-test and monitor OSD actions are
explicitly routed; member settings are stored in their `embeds` entry and
carried into the restoration baseline before the next preset switch.
`recaptureBase` refuses while our modules are in the bar and a baseline
exists: restore **Today** first. If `base.json` is lost while our modules are
in the bar, the baseline is rebuilt from them (each module turns back into the
native widgets it replaced, folded widgets keep their settings; order inside a
group may differ) and `state` reports it in `lastResult`.

## IPC

- `omarchy-shell tusche-bar options` (Control Center, toggle) · `cc quick|bar|screens|motion|island|cards|health` · `preset today|tidy|focus` · `set <element> <variant>` · `save|load <name>` · `menu` (drop-down) · `search` (drop-down as a launcher) · `apps` (drop-down on the Apps list) · `recaptureBase` · `state`.
- `omarchy-shell tusche-bar screenProfile <output> inherit|compact|detailed` applies a presentation profile directly; `focus start|show|release|toggle` controls the optional focus seal.
- Module IPC (tests, keybinds): `tusche-quota toggle|select <agent>|state`, `tusche-status group net|phone|system|all`, `tusche-status member <widget-id>`, `tusche-centre state`.
- `tusche-bar ask <payload>` is the menu shims' entry (an `omarchy-menu-select`/`-input` payload; answers `ok` when a drop-down took it).

## Develop

`OMARCHY_PATH=/path/to/omarchy ./dev-install.sh`. Custom modules and `.pragma library` code can be cached by the running shell. `dev-install.sh` now publishes immutable code generations and updates only this plugin's owned source URLs before a plugin rescan; layout order and options stay intact. Verify the loaded `moduleDir` and `glass` state via IPC. Each preset change rebuilds the bar (widgets such as AI usage need 2–3 s). Do not restart or kill a secure lock client to apply UI changes. Older installers or native shell/facade changes may still require a full shell restart after unlocking.

Tests: `node tests/regressions.cjs` (with the Tusche Island checkout next to this repository) and `python3 tests/boot_logo.py`.

Presentation checks: `node tests/presentation.cjs`, `python3 tests/focus_mode.py`,
`node tests/workspace_geometry.cjs`, `node tests/announce.cjs`, and
`node tests/visual_editor.cjs`. Native isolated renderer checks:
`python3 tests/workspace_runtime.py --output /tmp/workspace-proof`,
`python3 tests/announce_runtime.py` and
`python3 tests/visual_editor_runtime.py --output /tmp/editor-proof` (Qt, Quickshell,
Xvfb). These use authored fixtures, not the live desktop or private data.

## Licences and trademarks

- **Code:** MIT (`LICENSE`).
- **`vendor/MenuModel.js`:** an unchanged copy of Omarchy's menu model library (Omarchy, MIT).
- **Trademarks:** the Arch Linux logo (drawn unaltered in `modules/ArchLogo.qml`, used under the [Arch Linux trademark policy](https://terms.archlinux.org/docs/trademark-policy/) for non-commercial community use) and the Omarchy logo belong to their owners. This is an independent project; no affiliation or endorsement is implied.
