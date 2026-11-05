# Pixel style fonts

- `TuschePixel-Regular.ttf`, `TuschePixel-Bold.ttf`: the shell's family in the pixel
  style. Tiny5's letters plus `TuschePixelSymbols.ttf` in one font, so no symbol
  depends on Qt's font fallback (its choice for the first text it lays out is not
  reliable). Bold carries the Regular pixels: Tiny5's bold grows them off the grid.
  SIL OFL 1.1 like Tiny5 (`OFL-tiny5.txt`); symbol notes in `LICENSE-symbols.txt`.
- `Tiny5-Regular.ttf`, `Tiny5-Bold.ttf`: static Tiny5 (wght 400; Bold = the same
  pixels) from the variable Tiny5 in github.com/Trendorin/yami `fonts/` (Google Fonts
  "Tiny5" by Stefan Schmidt, no Reserved Font Name). The variable file made Qt draw
  a smeared synthetic bold.
- `TuschePixelSymbols.ttf`: the 7x7 pixel symbols alone (252 Nerd Font codepoints
  the shell, Tusche Bar and Island use), compiled from the VectorCraft master
  `../symbols/tusche-pixel-symbols.vectorcraft`; `../symbols/build.sh` rebuilds all.

`bin/pixel-style.py set pixel` (or `ensure-fonts`) installs them into
`~/.local/share/fonts/{tusche-pixel,tiny5}`.
