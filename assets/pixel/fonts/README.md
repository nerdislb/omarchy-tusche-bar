# Pixel style fonts

- `Tiny5-Regular.ttf`, `Tiny5-Bold.ttf`: static instances (wght 400 and 700) of the
  variable Tiny5 from github.com/Trendorin/yami `fonts/` (Google Fonts "Tiny5" by
  Stefan Schmidt, SIL OFL 1.1, see `OFL-tiny5.txt`; no Reserved Font Name). Made with
  fontTools `instancer`; Qt drew bold from the variable file as a smeared synthetic bold.
- `TuschePixelSymbols.ttf`: 7x7 pixel symbols for the Nerd Font codepoints the shell,
  Tusche Bar and Island use. The master is `../symbols/tusche-pixel-symbols.vectorcraft`
  (VectorCraft); `../symbols/build.sh` exports it and compiles this font.
- `60-tusche-pixel-symbols.conf`: fontconfig puts the symbols right after Tiny5.

`bin/pixel-style.py set pixel` (or `ensure-fonts`) installs them into
`~/.local/share/fonts/{tiny5,tusche-pixel-symbols}` and `~/.config/fontconfig/conf.d/`.
