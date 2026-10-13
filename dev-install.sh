#!/bin/bash
# Publish the working tree as immutable code URLs and rescan plugins without
# restarting the shell or its lock client. Re-run after every edit.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
id="$(jq -r .id "$here/manifest.json")"
target="$HOME/.config/omarchy/plugins/$id"
generation="$(python3 "$here/bin/install-generation.py" "$here" "$target")"
omarchy plugin validate "$target"
omarchy-shell -q shell rescanPlugins
echo "installed $target (code generation $generation)"
