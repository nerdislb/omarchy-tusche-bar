# Pixel style fonts

- `TuschePixel-Regular.ttf`, `TuschePixel-Bold.ttf`: the pixel style's alternative
  family (`bin/pixel-style.py font tiny5`). Tiny5's letters plus `TuschePixelSymbols.ttf` in one font, so no symbol
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

- `TuscheDeparture-Regular.ttf`, `TuscheDeparture-Bold.ttf`: the pixel style's
  default font (`bin/pixel-style.py font departure`; `font tiny5` picks Tusche
  Pixel instead). Departure Mono's letters (11 px
  per em, 8-px caps; outlines converted to TrueType) plus the same symbols on its
  grid (`TuscheDepartureSymbols.ttf`, one symbol cell = one font pixel). Bold
  carries the Regular pixels; Departure Mono has no bold. SIL OFL 1.1 like
  Departure Mono (`OFL-departure-mono.txt`, no Reserved Font Name).
- `DepartureMono-Regular.otf`: Departure Mono 1.500 by Helena Zhang, from the official
  release github.com/rektdeckard/departure-mono (v1.500, `DepartureMono-1.500.zip`,
  sha256 bf3e4805…5c3a; the file matches the repository's
  `public/assets/DepartureMono-Regular.otf` at that tag, git blob e0b25021).

`bin/pixel-style.py set pixel` (or `ensure-fonts`) installs them into
`~/.local/share/fonts/{tusche-pixel,tusche-departure,tiny5}`.
