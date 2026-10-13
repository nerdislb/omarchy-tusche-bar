#!/bin/bash
# Install the Tusche look on this machine: the Tusche & Papier themes and the
# metal pair Chrom & Platin, the
# Tusche Bar and the Tusche Island with all their motion (logo arrival, seal
# tab, rolling cards, wet bloom, dried rim, system chip ...), the card picker,
# the saved bar combinations and the island settings from setup/look.json.
# An earlier Amiga Bar / Amiga Island setup is carried over to the Tusche
# names (setup/migrate-from-amiga.py) and its old plugin folders removed.
#
#   setup/install.sh [options]
#     --theme NAME         theme to switch to (default from look.json: papier)
#     --combination NAME   saved bar combination to load (default: paper; after
#                          a carry-over from the Amiga Bar only when given)
#     --no-card-picker     leave the card picker out
#     --animated           also install the moving backgrounds (quiet 60 s loops,
#                          downloaded from the GitHub release, ~25 MB)
#     --boot-logo          also put the seal on the boot screen (asks for sudo)
#     --src DIR            where the repositories live (default ~/src)
#     --dry-run            show what would happen, change nothing
#
# Run it as your user inside the desktop session. It is re-runnable (updates
# the repositories fast-forward and reinstalls). Everything it changes is
# backed up first under ~/.local/state/tusche-look/backup-<time>/;
# setup/revert.sh <that folder> puts it back.
# Repositories come from beside this one (offline bundle) or from GitHub.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
bar_repo="$(dirname "$here")"
look="$here/look.json"
SRC="$HOME/src"
theme=""
combo=""
combo_given=false
card_picker=true
animated=false
boot_logo=false
dry=false

while (( $# )); do
  case "$1" in
    --theme) theme="$2"; shift 2 ;;
    --combination) combo="$2"; combo_given=true; shift 2 ;;
    --no-card-picker) card_picker=false; shift ;;
    --animated) animated=true; shift ;;
    --no-fastfetch) shift ;;   # accepted for older instructions; there is no fastfetch logo any more
    --boot-logo) boot_logo=true; shift ;;
    --src) SRC="$2"; shift 2 ;;
    --dry-run) dry=true; shift ;;
    -h|--help) sed -n '2,24p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "install: unknown option $1 (see --help)" >&2; exit 2 ;;
  esac
done

theme="${theme:-$(jq -r '.theme // "papier"' "$look")}"
combo="${combo:-$(jq -r '.barCombination // "paper"' "$look")}"
themes=(tusche papier tusche-lavur papier-lavur chrom platin frost smoke)
repos=(omarchy-tusche-bar omarchy-tusche-island)
$card_picker && repos+=(omarchy-card-picker)
plugins_dir="$HOME/.config/omarchy/plugins"
old_ids=(nerdibeard.amiga-bar nerdibeard.amiga-island)

step() { printf '\n==> %s\n' "$*"; }
note() { printf '    %s\n' "$*"; }
run() { if $dry; then printf '    [dry-run] %s\n' "$*"; else "$@"; fi; }
die() { printf 'install: %s\n' "$*" >&2; exit 1; }

plugin_id() { case "$1" in omarchy-tusche-bar) echo nerdibeard.tusche-bar ;; omarchy-tusche-island) echo nerdibeard.tusche-island ;; omarchy-card-picker) echo nerdibeard.card-picker ;; esac; }
branch_of() { case "$1" in omarchy-tusche-island) echo main ;; *) echo master ;; esac; }

# ---------------------------------------------------------------- 0 · preflight
step "Preflight"
for cmd in omarchy omarchy-shell git jq python3 rsync; do
  command -v "$cmd" >/dev/null || die "$cmd is missing"
done
[[ $theme =~ ^(tusche|papier|tusche-lavur|papier-lavur|chrom|platin|frost|smoke)$ ]] || die "--theme must be one of: ${themes[*]}"
jq -e --arg c "$combo" '.barCombinations | any(.name == $c)' "$look" >/dev/null || die "no saved combination named '$combo' in look.json"
note "user $USER · Omarchy at ${OMARCHY_PATH:-?} · $(omarchy version 2>/dev/null | head -1 || echo 'version unknown')"
pgrep -x quickshell >/dev/null || $dry || die "run this inside the desktop session (the Omarchy shell is not running)"
# the plugin manifests must pass this machine's Omarchy schema (an older Omarchy would refuse them)
omarchy plugin validate "$bar_repo" >/dev/null || die "this Omarchy rejects the Tusche Bar's manifest – update Omarchy first (the build is from early October 2026)"
[[ -f "${OMARCHY_PATH:-/nonexistent}/shell/Ui/KeyboardPanel.qml" || -f /usr/share/omarchy/shell/Ui/KeyboardPanel.qml ]] ||
  note "warning: Omarchy's KeyboardPanel was not found where expected – the drop-down menu needs it"
# an Amiga Bar / Island from before the rename: its plugin folders or ids in shell.json
amiga=false
for id in "${old_ids[@]}"; do [[ -d "$plugins_dir/$id" ]] && amiga=true; done
grep -q -E 'nerdibeard\.amiga-(bar|island)|"amiga\.' "$HOME/.config/omarchy/shell.json" 2>/dev/null && amiga=true
$amiga && note "an Amiga Bar / Island setup was found – it is carried over to the Tusche names"

# ---------------------------------------------------------------- 1 · backup
stamp="$(date +%Y%m%d-%H%M%S)"
backup="$HOME/.local/state/tusche-look/backup-$stamp"
step "Backup -> $backup"
if ! $dry; then
  mkdir -p "$backup/themes" "$backup/plugins"
  for f in .config/omarchy/shell.json .config/omarchy/extensions/omarchy-menu.jsonc .config/hypr/bindings.lua .local/state/tusche-bar/presets.json .local/state/tusche-bar/base.json; do
    if [[ -e "$HOME/$f" ]]; then mkdir -p "$backup/files/$(dirname "$f")"; cp -a "$HOME/$f" "$backup/files/$f"; echo "$f" >>"$backup/files.list"; fi
  done
  for t in "${themes[@]}"; do
    [[ -d "$HOME/.config/omarchy/themes/$t" ]] && cp -a "$HOME/.config/omarchy/themes/$t" "$backup/themes/" && echo "$t" >>"$backup/themes.list"
  done
  for id in $(for r in "${repos[@]}"; do plugin_id "$r"; done) "${old_ids[@]}"; do
    [[ -d "$plugins_dir/$id" ]] && cp -a "$plugins_dir/$id" "$backup/plugins/" && echo "$id" >>"$backup/plugins.list"
  done
  printf '%s\n' "${themes[@]}" >"$backup/themes.installed"
  for r in "${repos[@]}"; do plugin_id "$r"; done >"$backup/plugins.installed"
  touch "$backup/themes.list" "$backup/plugins.list" "$backup/files.list"
fi
note "shell.json, menu extension, saved combinations, the six themes and the plugin folders (if present)"

# ---------------------------------------------------------------- 2 · repositories
step "Repositories in $SRC"
run mkdir -p "$SRC"
for r in "${repos[@]}"; do
  dest="$SRC/$r"
  br="$(branch_of "$r")"
  if [[ $r == omarchy-tusche-bar ]]; then src="$bar_repo"
  elif [[ -d "$(dirname "$bar_repo")/$r/.git" ]]; then src="$(dirname "$bar_repo")/$r"
  else src="https://github.com/nerdislb/$r.git"; fi
  # in place only when both are existing folders and the same one (two missing paths are not "the same")
  if [[ -d $dest && -d $src && $(cd "$dest" && pwd -P) == $(cd "$src" && pwd -P) ]]; then
    if [[ $r == omarchy-tusche-bar ]]; then
      note "$r: in place ($dest) – to update it, git pull there before running this"
    else
      [[ -z $(git -C "$dest" status --porcelain) ]] || die "$dest has local changes – commit or stash them first"
      note "$r: in place ($dest), pull $br from origin"
      run git -C "$dest" checkout -q "$br"
      if ! $dry; then git -C "$dest" pull -q --ff-only origin "$br" || note "$r: pull failed (offline or no access?) – kept as it is"; fi
    fi
  elif [[ -d "$dest/.git" ]]; then
    [[ -z $(git -C "$dest" status --porcelain) ]] || die "$dest has local changes – commit or stash them first"
    note "$r: update $dest from $src ($br, fast-forward)"
    if $dry; then
      note "[dry-run] git -C $dest fetch $src $br, then $br fast-forward (or create $br)"
    else
      git -C "$dest" fetch -q "$src" "$br"
      if git -C "$dest" rev-parse -q --verify HEAD >/dev/null && ! git -C "$dest" merge-base HEAD FETCH_HEAD >/dev/null; then
        die "$dest is a different repository (no shared history) – move it aside (mv $dest $dest.old) or use --src DIR, then run this again"
      elif git -C "$dest" show-ref --verify --quiet "refs/heads/$br"; then
        git -C "$dest" checkout -q "$br"
        git -C "$dest" merge -q --ff-only FETCH_HEAD ||
          die "$dest: its $br has commits of its own – merge them by hand, or move the folder aside (mv $dest $dest.old) and run this again"
      else
        # an older or partial clone without this branch: start it at the fetched one (other branches stay)
        note "$r: $dest has no branch $br yet – creating it"
        git -C "$dest" checkout -q -b "$br" FETCH_HEAD
      fi
    fi
  else
    note "$r: clone $src -> $dest ($br)"
    run git clone -q --branch "$br" "$src" "$dest"
    run git -C "$dest" remote set-url origin "https://github.com/nerdislb/$r.git"
  fi
done

# The checkouts must be the Tusche ones before anything old is touched: an older
# checkout (still the Amiga Bar / Island) would install the old plugins.
for r in "${repos[@]}"; do
  want="$(plugin_id "$r")"
  if $dry && [[ ! -d "$SRC/$r" ]]; then continue; fi
  got="$(jq -r .id "$SRC/$r/manifest.json" 2>/dev/null || true)"
  [[ $got == "$want" ]] || die "$SRC/$r is not $want (its manifest says '${got:-nothing}') – update that checkout, then run this again"
done

# ---------------------------------------------------------------- 3 · from the Amiga Bar (only if found)
if $amiga; then
  step "Carry the Amiga Bar / Island over"
  old="$plugins_dir/nerdibeard.amiga-bar/bin"
  # what the old bar put outside its own folder: fastfetch's logo, the desktop
  # font profile, the A500 form's block in shell.toml – each script undoes its
  # own, and a failure stops here, while the old scripts are still in place
  if [[ -f $old/fastfetch-logo.py ]]; then
    run python3 "$old/fastfetch-logo.py" restore || die "could not put fastfetch's previous logo back ($old/fastfetch-logo.py restore)"
    note "fastfetch: previous logo back"
  fi
  if [[ -f $old/system-font.py ]]; then
    profile="$(python3 "$old/system-font.py" status 2>/dev/null | jq -r '.profile // empty' 2>/dev/null || true)"
    [[ -n $profile ]] || die "could not read the desktop font profile ($old/system-font.py status)"
    if [[ $profile != normal ]]; then
      run python3 "$old/system-font.py" restore || die "could not remove the desktop font profile ($old/system-font.py restore)"
      note "desktop font profile removed"
    fi
  fi
  if [[ -f $old/bar-form.py ]]; then
    run python3 "$old/bar-form.py" disable >/dev/null || die "could not give the bar its fill back ($old/bar-form.py disable)"
    note "bar form: the full bar"
  fi
  if $dry; then python3 "$here/migrate-from-amiga.py" --dry-run; else python3 "$here/migrate-from-amiga.py"; fi
  for id in "${old_ids[@]}"; do
    [[ -d "$plugins_dir/$id" ]] && run rm -rf "$plugins_dir/$id" && note "$id: old plugin folder removed (kept in the backup)"
  done
  bindings="$HOME/.config/hypr/bindings.lua"
  if [[ -f $bindings ]] && grep -q -E 'amiga-(bar|island)' "$bindings"; then
    note "warning: $bindings still calls the Amiga Bar / Island – change amiga-bar to tusche-bar (the menu strip and status screen are gone; 'tusche-bar menu' opens the drop-down) and remove an old 'BEGIN nerdibeard.amiga-island' block:"
    grep -n -E 'amiga-(bar|island)' "$bindings" | sed 's/^/      /'
  fi
fi

# ---------------------------------------------------------------- 4 · plugin files
step "Plugins: files"
for r in "${repos[@]}"; do
  note "$(plugin_id "$r"): install from $SRC/$r"
  if $dry; then note "[dry-run] $SRC/$r/dev-install.sh"; else (cd "$SRC/$r" && ./dev-install.sh >/dev/null); fi
done
run omarchy-shell shell rescanPlugins

# ---------------------------------------------------------------- 5 · themes
step "Themes: ${themes[*]}"
run mkdir -p "$HOME/.config/omarchy/themes"
for t in "${themes[@]}"; do
  # the moving backgrounds are not in the repository: --delete must keep them
  run rsync -a --delete --exclude '*-bewegt.mp4' "$bar_repo/themes/$t/" "$HOME/.config/omarchy/themes/$t/"
done
if $animated; then
  step "Moving backgrounds (download)"
  run "$here/motion-backgrounds.sh" install
fi

# ---------------------------------------------------------------- 6 · settings, then enable
# The island's entry goes in first (in the clock's place): enabling a bar widget
# that has no entry yet would put it at its default spot instead.
step "Settings from look.json (saved bar combinations, island)"
if $dry; then python3 "$here/apply-settings.py" --look "$look" --dry-run; else python3 "$here/apply-settings.py" --look "$look"; sleep 1.5; fi
step "Plugins: enable"
for r in "${repos[@]}"; do
  id="$(plugin_id "$r")"
  if $dry; then note "[dry-run] omarchy plugin enable $id"; continue; fi
  out=""
  for _ in 1 2 3 4 5; do
    out="$(omarchy plugin enable "$id" 2>&1)" && break
    sleep 1; omarchy-shell shell rescanPlugins >/dev/null 2>&1 || true
  done
  note "$id: $out"
done

# ---------------------------------------------------------------- 7 · card picker menu
if $card_picker; then
  step "Card picker in the Style menu (Theme, Background)"
  run python3 "$SRC/omarchy-card-picker/bin/menu-override.py" enable
fi

# ---------------------------------------------------------------- 8 · restart, bar, theme
# A carried-over bar keeps its arrangement: loading a combination rebuilds the
# bar from the saved base layout, which would undo later moves in the bar.
load=true
$amiga && ! $combo_given && load=false
if $load; then step "Restart the shell, load the bar combination '$combo', theme $theme"
else step "Restart the shell (the carried-over bar stays as it was arranged), theme $theme"; fi
if ! $dry; then
  if pgrep -x quickshell >/dev/null; then
    # omarchy restart shell gives the notification service only 2 s after the shell answers; on a
    # machine with many plugins it can report failure although the shell is up – carry on if it runs
    if ! omarchy restart shell; then
      sleep 2
      pgrep -x quickshell >/dev/null || die "the shell did not come back (locked session?) – unlock and run: omarchy restart shell"
      note "the restart reported a problem (above), but the shell runs – continuing"
    fi
  fi
  ok=false
  for _ in $(seq 1 120); do
    if omarchy-shell tusche-bar state >/dev/null 2>&1; then ok=true; break; fi
    sleep 0.5
  done
  $ok || die "the Tusche Bar does not answer – check 'omarchy plugin list', then run: omarchy-shell tusche-bar load $combo"
  if $load; then
    result="busy"
    for _ in $(seq 1 20); do
      result="$(omarchy-shell tusche-bar load "$combo" 2>&1 || true)"
      [[ $result == busy ]] || break
      sleep 0.5
    done
    note "bar: $result"
    for _ in $(seq 1 20); do
      omarchy-shell tusche-bar state 2>/dev/null | jq -e --arg c "$combo" --slurpfile l "$look" \
        '.options.logo == ($l[0].barCombinations[] | select(.name == $c) | .options.logo)' >/dev/null && break
      sleep 0.5
    done
  else
    note "bar: kept as it was (to load '$combo': omarchy-shell tusche-bar load $combo)"
  fi
  # Super+Space and Super+Alt+Space open the bar's menu (search line / Apps);
  # the Control Center's "Super+Space" row switches back to Omarchy's menus
  keys="$(omarchy-shell tusche-bar set keys bar 2>&1 || true)"
  note "Super+Space: the bar's menu ($keys)"
  omarchy theme set "$theme" >/dev/null 2>&1 || note "theme: run 'omarchy theme set $theme' yourself"
else
  if $load; then note "[dry-run] omarchy restart shell; omarchy-shell tusche-bar load $combo; omarchy theme set $theme"
  else note "[dry-run] omarchy restart shell; omarchy theme set $theme"; fi
fi

# ---------------------------------------------------------------- 9 · boot screen (optional)
if $boot_logo; then
  step "Boot screen: the seal in $theme's colours (sudo)"
  run python3 "$plugins_dir/nerdibeard.tusche-bar/bin/boot-logo.py" set nerdibeard --theme "$theme"
fi

step "Done"
$dry && note "dry run – nothing was changed" || note "backup: $backup  ·  undo: $SRC/omarchy-tusche-bar/setup/revert.sh $backup"
note "switch logo/bar: middle click on the logo (Control Center) · themes and backgrounds: Style menu (card picker)"
