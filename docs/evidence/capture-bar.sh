#!/bin/bash
# Screenshots of the real shell (worktree code, live plugins, a copy of the live
# config) on a headless Umbriel, in the Tusche or the pixel style. Nothing on
# the live desktop changes: own compositor, temporary HOME, private session bus,
# no system bus.
#
#   shell-shot.sh tusche|pixel OUTDIR [ipc-call ...]
# Each extra argument is "target function [args]" for `quickshell ipc call`,
# shot after it as OUTDIR/<style>-<n>.png; OUTDIR/<style>-0.png is the desktop.
set -euo pipefail
style=$1; outdir=$2; shift 2
SHELL_SRC=${SHELL_SRC:-$HOME/Data/Development/projects/omarchy-umbriel-pixel-20261104}
BAR_SRC=${BAR_SRC:-$HOME/Data/Development/projects/tusche-bar-pixel-20261104}
mkdir -p "$outdir"
root=$(mktemp -d /tmp/qss.XXXXXX)
run=$root/run; home=$root/home
mkdir -p "$run" "$home/.config" "$home/.local/state/omarchy" "$home/.local/share" "$home/.cache"
chmod 700 "$run"
cleanup() {
  for p in ${term_pid:-} ${qs_pid:-} ${bus_pid:-} ${um_pid:-}; do kill "$p" 2>/dev/null || true; done
  sleep 1
  for p in ${qs_pid:-} ${um_pid:-}; do kill -KILL "$p" 2>/dev/null || true; done
  rm -rf "$root"
}
trap cleanup EXIT

mkdir -p "$home/.config/omarchy/plugins"
for f in "$HOME"/.config/omarchy/*; do
  n=$(basename "$f")
  case $n in plugins) ;; backgrounds|themes) ln -s "$f" "$home/.config/omarchy/$n" ;; *) cp -a "$f" "$home/.config/omarchy/" ;; esac
done
# live plugins, except the bar and the island: their worktree code as a fresh generation
for f in "$HOME"/.config/omarchy/plugins/*; do
  n=$(basename "$f")
  case $n in nerdibeard.tusche-bar|nerdibeard.tusche-island) mkdir -p "$home/.config/omarchy/plugins/$n" ;; *) ln -s "$f" "$home/.config/omarchy/plugins/$n" ;; esac
done
sed -i "s#$HOME/.config/omarchy/plugins/#$home/.config/omarchy/plugins/#g" "$home/.config/omarchy/shell.json"
ISLAND_SRC=${ISLAND_SRC:-$HOME/Data/Development/projects/tusche-island-raster-20261104}
HOME="$home" python3 -I "$BAR_SRC/bin/install-generation.py" "$BAR_SRC" "$home/.config/omarchy/plugins/nerdibeard.tusche-bar" \
  --config "$home/.config/omarchy/shell.json" > /dev/null
HOME="$home" python3 -I "$ISLAND_SRC/bin/install-generation.py" "$ISLAND_SRC" "$home/.config/omarchy/plugins/nerdibeard.tusche-island" \
  --config "$home/.config/omarchy/shell.json" > /dev/null
for d in fontconfig foot; do [[ -e $HOME/.config/$d ]] && cp -a "$HOME/.config/$d" "$home/.config/"; done
cp -a "$HOME/.config/umbriel" "$home/.config/umbriel"
ln -s "$HOME/.local/share/fonts" "$home/.local/share/fonts"
cp -a "$HOME/.local/state/omarchy/current" "$home/.local/state/omarchy/current"
mkdir -p "$home/.local/state/omarchy/toggles/hypr"
cp -a "$HOME/.local/state/omarchy/toggles/hypr/." "$home/.local/state/omarchy/toggles/hypr/" 2>/dev/null || true
rm -f "$home/.local/state/omarchy/toggles/shell-native-text"

base_env=(HOME="$home" USER="$USER" LANG="${LANG:-de_AT.UTF-8}" PATH="$HOME/Data/Work/pixel-stil-2026-11-04/tools/stubbin:$SHELL_SRC/bin:/usr/local/bin:/usr/bin:/bin:$HOME/.local/bin"
  XDG_CONFIG_HOME="$home/.config" XDG_STATE_HOME="$home/.local/state" XDG_CACHE_HOME="$home/.cache" XDG_DATA_HOME="$home/.local/share"
  OMARCHY_PATH="$SHELL_SRC" DBUS_SYSTEM_BUS_ADDRESS="unix:path=$root/no-system-bus")

mkdir -p "$home/.local/bin"
ln -s /home/nerdi/Data/Development/omarchy-looks/bin/look "$home/.local/bin/look"
python3 - "$home/.config/omarchy/shell.json" <<'PYCONFIG'
import json,sys
p=sys.argv[1]
a=json.load(open(p))
e=next(e for e in a['plugins'] if e['id']=='nerdibeard.tusche-bar')
e.setdefault('options',{}).update(logoImage='/home/nerdi/Data/Work/eigener-look-2026-11-07/logos/A-sendeschluss-mark-transparent.svg', dayline='on', daylineNow='on', workspacePing='on')
open(p,'w').write(json.dumps(a))
PYCONFIG
# headless compositor: the live configuration, without its session autostarts
cat > "$home/.config/umbriel/shot.toml" <<EOF
[include]
files = ["config.toml"]

[general]
autostart = []

[environment]
OMARCHY_PATH = "$SHELL_SRC"

[output.HEADLESS-1]
mode = "1920x1080@60"
scale = ${B_OUTPUT_SCALE:-1.0}
EOF
setsid env -i "${base_env[@]}" XDG_RUNTIME_DIR="$run" WLR_BACKENDS=headless WLR_LIBINPUT_NO_DEVICES=1 WLR_HEADLESS_OUTPUTS=1 \
  WAYLAND_DISPLAY=umbriel-headless-guard WLR_RENDERER=gles2 WLR_RENDER_DRM_DEVICE="${B_RENDER_NODE:-/dev/dri/renderD129}" umbriel -c "$home/.config/umbriel/shot.toml" > "$root/umbriel.log" 2>&1 &
um_pid=$!
for _ in $(seq 1 100); do [[ -S $run/umbriel-wayland-0.sock ]] && break; sleep 0.05; done
[[ -S $run/umbriel-wayland-0.sock ]] || { cat "$root/umbriel.log" >&2; exit 1; }
wl=$(ls "$run" | grep -E '^wayland-[0-9]+$' | head -1)
dbus-daemon --session --fork --print-address=3 --print-pid=4 --nopidfile 3>"$root/bus.addr" 4>"$root/bus.pid"
sess=(XDG_RUNTIME_DIR="$run" WAYLAND_DISPLAY="$wl" UMBRIEL_SOCKET="$run/umbriel-wayland-0.sock" XDG_CURRENT_DESKTOP=umbriel
  DBUS_SESSION_BUS_ADDRESS="$(<"$root/bus.addr")")
bus_pid=$(<"$root/bus.pid")

if [[ $style == pixel ]]; then
  env -i "${base_env[@]}" "${sess[@]}" python3 -I "$BAR_SRC/bin/pixel-style.py" set pixel --no-restart > "$root/style.json" 2> "$root/style.err" || {
    cat "$root/style.err" >&2; exit 1; }
fi
text_env=()
[[ -f $home/.local/state/omarchy/toggles/shell-native-text ]] && text_env=(QT_QUICK_DEFAULT_TEXT_RENDERTYPE=NativeRendering)

setsid env -i "${base_env[@]}" "${sess[@]}" "${text_env[@]}" QS_DISABLE_FILE_WATCHER=1 QS_NO_RELOAD_POPUP=1 QT_QPA_PLATFORM=wayland \
  quickshell -n -p "$SHELL_SRC/shell" > "$root/shell.log" 2>&1 &
qs_pid=$!
# a terminal for scale
if [[ -z ${NO_TERM:-} ]] && command -v foot >/dev/null; then
  setsid env -i "${base_env[@]}" "${sess[@]}" foot -W 110x30 sh -c 'fastfetch --logo none 2>/dev/null || uname -a; exec sleep 600' > "$root/foot.log" 2>&1 &
  term_pid=$!
fi
sleep "${B_SETTLE_SECONDS:-40}"
kill -0 "$qs_pid" 2>/dev/null || { tail -30 "$root/shell.log" >&2; exit 1; }
shot() { env -i "${base_env[@]}" "${sess[@]}" timeout 20 grim "$1"; }
# Exercise the real IPC/config path without restarting this private shell.
env -i "${base_env[@]}" "${sess[@]}" quickshell ipc -p "$SHELL_SRC/shell" call tusche-bar set logoImage "" > "$outdir/logo-reset.txt"
sleep 1
env -i "${base_env[@]}" "${sess[@]}" quickshell ipc -p "$SHELL_SRC/shell" call tusche-bar set logoImage /home/nerdi/Data/Work/eigener-look-2026-11-07/logos/A-sendeschluss-mark-transparent.svg > "$outdir/logo-set.txt"
sleep 1
env -i "${base_env[@]}" "${sess[@]}" quickshell ipc -p "$SHELL_SRC/shell" call tusche-bar state > "$outdir/state.json"
python3 - "$home/.config/omarchy/shell.json" "$outdir/options.json" <<'PYOPTIONS'
import json,sys
cfg=json.load(open(sys.argv[1]))
entry=next(e for e in cfg['plugins'] if e['id']=='nerdibeard.tusche-bar')
json.dump(entry['options'],open(sys.argv[2],'w'),indent=2)
PYOPTIONS
shot "$outdir/$style-0.png"
n=0
for call in "$@"; do
  n=$((n + 1))
  # shellcheck disable=SC2086
  env -i "${base_env[@]}" "${sess[@]}" timeout 10 quickshell ipc -p "$SHELL_SRC/shell" call $call > /dev/null 2>&1 || true
  sleep 3
  shot "$outdir/$style-$n.png"
  env -i "${base_env[@]}" "${sess[@]}" timeout 10 quickshell ipc -p "$SHELL_SRC/shell" call tusche-bar cc "" > /dev/null 2>&1 || true
done
grep -E "ERROR|TypeError|ReferenceError" "$root/shell.log" | sed 's/^ *//' | sort | uniq -c | sort -rn | head -20 > "$outdir/$style-errors.txt" || true
cp "$root/umbriel.log" "$outdir/umbriel.log"
cp "$root/shell.log" "$outdir/$style-shell.log"
[[ -f $root/style.json ]] && cp "$root/style.json" "$outdir/$style-style.json"
echo "shots in $outdir"
