-- platin: a still polished-steel border, the bar's studio stripes on a diagonal (no
-- borderangle turn, as Chrom); the window shadow a soft dark.
local active_border_color = { colors = { "rgba(5a5d62ff)", "rgba(d6d9ddff)", "rgba(8a8d92ff)", "rgba(1a1b1dff)", "rgba(2e3034ff)", "rgba(cdd0d4ff)", "rgba(7a7d82ff)", "rgba(1a1b1dff)", "rgba(4a4d52ff)", "rgba(d6d9ddff)" }, angle = 45 }
local inactive_border_color = "rgba(b0b3b8ff)"

hl.config({
  general = {
    col = {
      active_border = active_border_color,
      inactive_border = inactive_border_color,
    },
  },

  group = {
    col = {
      border_active = active_border_color,
      border_inactive = inactive_border_color,
    },
  },

  decoration = {
    shadow = { enabled = true, range = 24, render_power = 3, offset = { 0, 4 }, color = "rgba(1112142a)", color_inactive = "rgba(00000000)" },
  },
})

hl.animation({ leaf = "borderangle", enabled = false })
