# Install the look on another machine

Brings the Tusche look (the author's setup) to an Omarchy machine:

- the themes **Tusche, Papier, Tusche Lavur, Papier Lavur, Chrom, Platin, Frost, Smoke** (`themes/`);
- the **Tusche Bar** and the **Tusche Island** with all their motion (logo
  arrival, seal tab, rolling cards, wet bloom, dried rim, system chip …);
- the **card picker** for themes and backgrounds (Style menu);
- the saved bar combinations (`paper` is loaded) and the island's settings
  (`look.json`).

## Needs

- **Omarchy:** a recent version, from early October 2026 or later. The script first checks the Tusche Bar's manifest against the local Omarchy and stops if it is refused.
- **Session:** run it as your user inside the desktop session (the shell must be running).
- **Tools:** `git`, `jq`, `python3`, `rsync`.
- **Network:** the repositories are public on GitHub; without network use the offline bundle.

## Install

From GitHub:

```sh
git clone https://github.com/nerdislb/omarchy-tusche-bar.git ~/src/omarchy-tusche-bar
~/src/omarchy-tusche-bar/setup/install.sh --dry-run   # look first
~/src/omarchy-tusche-bar/setup/install.sh
```

Offline: on a machine with the repositories run `setup/make-bundle.sh`. Copy the tar.gz across and run:

```sh
tar xzf tusche-look-*.tar.gz
tusche-look/omarchy-tusche-bar/setup/install.sh
```

### Options

| Option | Effect |
|---|---|
| `--theme papier\|tusche\|papier-lavur\|tusche-lavur\|chrom\|platin\|frost\|smoke` | Theme to switch to (default `papier`). |
| `--combination NAME` | Saved bar combination to load (default `paper`; after a carry-over from the Amiga Bar only when given, so the bar keeps its arrangement). |
| `--no-card-picker` | Leave the card picker out. |
| `--animated` | Also install the moving backgrounds (quiet 60 s loops, downloaded from the GitHub release and checksummed; `setup/motion-backgrounds.sh` does the same on its own). |
| `--boot-logo` | Also put the seal on the boot screen (asks for sudo, rebuilds the initramfs). |
| `--src DIR` | Repository folder (default `~/src`). |
| `--dry-run` | Show every step and change nothing. |

## What it does

1. **Backup:** shell.json, the menu extension, `bindings.lua`, the saved combinations and base layout, the eight themes and the plugin folders (if present), saved to `~/.local/state/tusche-look/backup-<time>/`.
2. **Repositories:** clones them into `~/src` or fast-forwards them there (from beside this folder, else from GitHub). It stops on local changes.
3. **From the Amiga Bar** (only when one is found): the old extras undo what they changed outside the plugin (fastfetch logo, desktop font profile, the A500 bar form); `migrate-from-amiga.py` moves the options, saved combinations, base layout, island settings and state to the Tusche names and turns the old "Amiga Bar (managed)" key block into the Tusche Bar's; the old plugin folders are removed (they stay in the backup).
4. **Plugins:** installs each with its `dev-install.sh`.
5. **Themes:** copies the eight themes (Tusche, Papier, their Lavur variants, Chrom and Platin).
6. **Settings:**
   - merges the saved combinations;
   - puts the island in the place of Omarchy's clock (it is the clock), or merges the settings into its entry;
   - then enables the plugins.
7. **Extras:** the card picker's Style menu entries.
8. **Apply:** restarts the shell, loads the bar combination (not after a carry-over, unless `--combination` is given) and sets the theme.
9. **Boot screen** (optional): the seal.

Re-running it updates and reinstalls.

## Undo

```sh
~/src/omarchy-tusche-bar/setup/revert.sh ~/.local/state/tusche-look/backup-<time>
```

It restores the backed-up files, themes and plugin folders (an Amiga Bar it carried over included) and removes what the install added. The repositories in `~/src` and the boot screen stay; for the boot screen run `bin/boot-logo.py restore --default`.

## Not included

- Other plugins: OmaMail, WhatsApp, Flux, Buds, Drive and so on. Their bar widgets simply stay away.
- The workspace overview and anything with accounts or credentials.
