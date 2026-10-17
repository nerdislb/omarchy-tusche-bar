#!/bin/bash
# Fetch Omi, the Omarchy mascot, for the focus seal's Omi face (option seal: omi).
#
# Omi is tahayvr's mascot (https://github.com/tahayvr/omi, formerly meet-omi). Its code is
# MIT, but the Omi design (the kit's data, the pictures) is a derivative of the Omarchy
# logo and carries NO license. So this plugin does not ship it: this script downloads one
# pinned release into your own data directory, checks its hashes, and the face reads it
# from there. Nothing here may be published as part of this repo.
#
# Each install goes into its own directory (omi-<release>-<time>) and the file `current` names the
# one in use. It is rewritten in one atomic step, and the face loads Omi from the directory it names:
# Quickshell keeps what it has loaded per URL, so a new version must come with a new URL, or a
# running shell would mix the old player with the new data. The previous version stays for a way back.
#
#   setup/omi-fetch.sh            install (or repair) the pinned release
#   setup/omi-fetch.sh --remove   delete everything again; the seal falls back to the plain one
set -euo pipefail

repo="tahayvr/omi"
tag="v1.0.0"
commit="007adefdbc254ebc6005acf9575b201a9167feec"
base="${XDG_DATA_HOME:-$HOME/.local/share}/tusche-bar"
current="$base/current"
# upstream path  ->  name here  ->  sha256
files=(
  "examples/omarchy/Omi.qml  Omi.qml   c9cd9082c9d3b145aa42f7a9d3fac7869bd113e52dbc06c665d0f6c59d858f5c"
  "kit/omi.js                omi.js    c9860fd8cb28160d91d4152206a8340c5312ac30e6a849d8237fa4a5712aa22f"
  "kit/omi.json              omi.json  ddecd5d4db25b82bfa4a723fa51a8023f633d3eb00671c553525c5950c4b3ce3"
)

if [ "${1:-}" = "--remove" ]; then
  rm -rf -- "$base"/omi "$base"/omi-* "$base"/current "$base"/current.tmp
  echo "removed Omi from $base"
  exit 0
fi

name_new="omi-$tag-$(date +%Y%m%d%H%M%S)"
dest="$base/$name_new"
mkdir -p -- "$base"
tmp="$(mktemp -d "$base/.omi-fetch.XXXXXX")"
trap 'rm -rf -- "$tmp"' EXIT
for entry in "${files[@]}"; do
  read -r remote name sum <<<"$entry"
  curl --fail --silent --show-error --location --proto '=https' \
    "https://raw.githubusercontent.com/$repo/$commit/$remote" -o "$tmp/$name"
  if [ "$(sha256sum "$tmp/$name" | cut -d' ' -f1)" != "$sum" ]; then
    echo "checksum mismatch for $name: refusing to install" >&2
    exit 1
  fi
done
cat >"$tmp/NOTICE.txt" <<NOTICE
Omi, the Omarchy mascot: https://github.com/$repo, release $tag ($commit)
Downloaded for local use by the Tusche Bar's focus seal. The code is MIT; the Omi
design is a derivative of the Omarchy logo, owned by the Omacom Foundation, and no
license to it is granted. Do not copy these files into a repository or a package.
NOTICE

# Older layouts: a plain `omi` directory (the first install) or an `omi` symlink (a short-lived second one).
if [ -L "$base/omi" ]; then
  rm -f -- "$base/omi"
elif [ -d "$base/omi" ]; then
  mv -- "$base/omi" "$base/omi-legacy"
fi
previous=""
[ -f "$current" ] && previous="$(head -n1 "$current")"

mv -- "$tmp" "$dest"
trap - EXIT
chmod 755 "$dest"
printf '%s\n' "$name_new" >"$base/current.tmp"
mv -f -- "$base/current.tmp" "$current"

# Keep the one before as the way back, drop anything older.
for old in "$base"/omi-*; do
  name="$(basename "$old")"
  [ "$name" = "$name_new" ] || [ "$name" = "$previous" ] || rm -rf -- "$old"
done
echo "installed Omi $tag into $dest (current: $name_new${previous:+, previous: $previous})"
