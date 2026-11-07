#!/usr/bin/env bash
# Private real-shell capture, following pixel-stil/tools/shell-shot.sh.
set -euo pipefail
exec python3 -I "$(dirname -- "$0")/shell-shot.py" "$@"
