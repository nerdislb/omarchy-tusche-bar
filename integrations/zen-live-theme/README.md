# Optional live Zen palette sync

For an **already installed and activated Omazen** integration. This does not
install Omazen, browser loaders, extensions or CSS, nor restart any browser.

## Why

Omarchy can defer `theme-set` hooks until app retints finish. A Chromium-family
browser launched by `--refresh-platform-policy --no-startup-window` can remain
alive, holding the retint batch open indefinitely. Omazen's normal hook then
never gets to publish its palette, even though the desktop has changed.

This narrow user path unit invokes the existing `~/.local/bin/omazen sync`
when Omarchy's active palette changes, independently of the retint queue. It
watches both the parent directory and the palette to survive whole-directory
replacement. Omazen still owns validation, last-good retention, atomic palette
writes and the running browser bridge. The existing Omazen hook is retained;
both routes invoke the same idempotent sync. There is no periodic polling.

## Install

```sh
python3 integrations/zen-live-theme/install.py
systemctl --user status omazen-live-theme.path
omazen doctor
```

Omazen must already be installed at `~/.local/bin/omazen` and configured for the
active Omarchy palette. This optional helper does not enable a disabled Omazen
bridge. Units are installed under `~/.config/systemd/user/`; changed earlier
units are backed up under `~/.local/state/omazen-live-theme/backups/`.
Nothing in the bar installer enables this automatically.

The browser-policy blockage itself is outside this integration's scope: no
running browser, credential helper, upstream command or unrelated theme hook is
terminated or changed. Other apps relying exclusively on that blocked queue can
still be delayed. This helper specifically keeps Zen synchronized.

## Verify and rollback

Switch light → dark with the same browser window open. Require new
`PALETTE_APPLIED` and `CHROME_STYLE_PROBE` entries in Omazen's bridge log, the
expected painted chrome colours and an unchanged browser PID. Wait for bridge
application before interpreting `omazen doctor`. Restore the original theme and
background after testing. A newer Zen version may still produce Omazen's
upstream compatibility-candidate warning; a local test does not erase that.

`python3 tests/zen_live_theme.py` exercises these actual unit templates against
a private palette/state directory with the installed Omazen CLI: file edits,
atomic directory replacement, invalid palette retention and rapid switches.
It installs temporary uniquely named user units and cleans up only those units.

To return to the previous hook-only behaviour:

```sh
systemctl --user disable --now omazen-live-theme.path
```

The last palette remains valid. Restore earlier unit backups if needed; do not
restore unrelated systemd files, browser profiles or shell configuration.
