#!/bin/bash
# Optional moving backgrounds for the Tusche & Papier themes: very quiet
# 60-second loops (mist, light, wind; a rare bird or leaf) of the theme stills,
# 1080p HEVC Main10 (BT.709, tagged), played by Omarchy as video backgrounds.
#
#   setup/motion-backgrounds.sh install [--from DIR]   download (or copy from DIR) and install
#   setup/motion-backgrounds.sh remove                 remove them again
#   setup/motion-backgrounds.sh status                 show what is installed
#
# The files go into the themes' own background folders, named after the stills
# (4-berge-bewegt.mp4 …), so a still stays each theme's default and the loops
# are picked like any other background (card picker, omarchy theme bg next).
# Downloads come from this repository's GitHub release and are checked against
# setup/motion-backgrounds.sha256 before anything is installed.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
TAG="motion-backgrounds-2"
URL="https://github.com/nerdislb/omarchy-tusche-bar/releases/download/$TAG"
SUMS="$here/motion-backgrounds.sha256"
THEMES="$HOME/.config/omarchy/themes"

# asset (release file) -> theme/background file name
MAP=(
  "tusche-motion-berge.mp4 papier/4-berge-bewegt.mp4"
  "tusche-motion-leuchtturm.mp4 papier/5-leuchtturm-bewegt.mp4"
  "tusche-motion-pinsel.mp4 papier/6-pinsel-bewegt.mp4"
  "tusche-motion-berge.mp4 papier-lavur/3-berge-bewegt.mp4"
  "tusche-motion-pinsel.mp4 papier-lavur/4-pinsel-bewegt.mp4"
  "tusche-motion-nebelwald.mp4 tusche/4-nebelwald-bewegt.mp4"
  "tusche-motion-treppe.mp4 tusche/5-treppe-bewegt.mp4"
  "tusche-motion-monolith.mp4 tusche/6-monolith-bewegt.mp4"
  "tusche-motion-berge-mond.mp4 tusche-lavur/3-berge-mond-bewegt.mp4"
  "tusche-motion-nebelwald.mp4 tusche-lavur/4-nebelwald-bewegt.mp4"
)

die() { echo "motion-backgrounds: $*" >&2; exit 1; }
assets() { for m in "${MAP[@]}"; do echo "${m%% *}"; done | sort -u; }

cmd="${1:-status}"; shift || true
from=""
while (( $# )); do
  case "$1" in
    --from) from="$2"; shift 2 ;;
    *) die "unknown option $1" ;;
  esac
done

case "$cmd" in
  install)
    command -v sha256sum >/dev/null || die "sha256sum is missing"
    tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
    for a in $(assets); do
      if [[ -n $from ]]; then
        [[ -f $from/$a ]] || die "$from/$a not found"
        cp "$from/$a" "$tmp/$a"
      else
        command -v curl >/dev/null || die "curl is missing"
        echo "==> download $a"
        curl -fsSL --retry 2 -o "$tmp/$a" "$URL/$a" || die "download failed: $URL/$a"
      fi
    done
    (cd "$tmp" && grep -E " ($(assets | paste -sd '|'))$" "$SUMS" | sha256sum -c --quiet -) || die "checksum mismatch – nothing was installed"
    for m in "${MAP[@]}"; do
      a="${m%% *}"; t="${m#* }"; dest="$THEMES/${t%%/*}/backgrounds/${t#*/}"
      if [[ ! -d $(dirname "$dest") ]]; then echo "    skip $t (theme not installed)"; continue; fi
      install -m 0644 "$tmp/$a" "$dest" && echo "    ${m#* }"
    done
    echo "Installed. Pick one in the card picker (Style → Background) or with: omarchy theme bg next"
    ;;
  remove)
    for m in "${MAP[@]}"; do
      t="${m#* }"; dest="$THEMES/${t%%/*}/backgrounds/${t#*/}"
      [[ -f $dest ]] && rm -f "$dest" && echo "    removed ${m#* }"
    done
    # a removed loop that is the current background: Omarchy falls back on the next theme switch
    true
    ;;
  status)
    for m in "${MAP[@]}"; do
      t="${m#* }"; dest="$THEMES/${t%%/*}/backgrounds/${t#*/}"
      printf '%-36s %s\n' "${m#* }" "$([[ -f $dest ]] && echo installed || echo -)"
    done
    ;;
  *) die "usage: motion-backgrounds.sh install [--from DIR] | remove | status" ;;
esac
