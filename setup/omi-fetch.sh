#!/bin/bash
# Fetch Omi, the Omarchy mascot, for the focus seal's Omi face (option seal: omi).
#
# Omi is tahayvr's concept (https://github.com/tahayvr/meet-omi). Its code is MIT,
# but the Omi design (the pack's data, the pictures) is a derivative of the Omarchy
# logo and carries NO license. So this plugin does not ship it: this script
# downloads one pinned commit into your own data directory, checks its hashes, and
# the face reads it from there. Nothing here may be published as part of this repo.
#
#   setup/omi-fetch.sh            install (or repair) the pinned files
#   setup/omi-fetch.sh --remove   delete them again; the seal falls back to the plain one
set -euo pipefail

repo="tahayvr/meet-omi"
commit="d99f58a8fd2cebe6c6c708e54f45649183c0b4f2"
dest="${XDG_DATA_HOME:-$HOME/.local/share}/tusche-bar/omi"
# upstream path  ->  name here  ->  sha256
files=(
  "examples/omarchy/Omi.qml  Omi.qml   6da2adc50ede96e97bcd1337abbdfc8952f67d328bc2df0709e04754939728ac"
  "pack/omi.js               omi.js    483bdb5246ba63eab0194e15c37baa383c0eb1754ab5fd2f93f68b9ca693e26f"
  "pack/omi.json             omi.json  4da7ccd95e1df99d6355c21dd11a8d0a085001743e934e4ba54f258abb77db1b"
)

if [ "${1:-}" = "--remove" ]; then
  rm -rf -- "$dest"
  echo "removed $dest"
  exit 0
fi

tmp="$(mktemp -d)"
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
Omi, the Omarchy mascot: https://github.com/$repo at $commit
Downloaded for local use by the Tusche Bar's focus seal. The code is MIT; the Omi
design is a derivative of the Omarchy logo, owned by the Omacom Foundation, and no
license to it is granted. Do not copy these files into a repository or a package.
NOTICE

mkdir -p -- "$dest"
for entry in "${files[@]}"; do
  read -r _ name _ <<<"$entry"
  mv -f -- "$tmp/$name" "$dest/$name"
done
mv -f -- "$tmp/NOTICE.txt" "$dest/NOTICE.txt"
echo "installed Omi $commit into $dest"
