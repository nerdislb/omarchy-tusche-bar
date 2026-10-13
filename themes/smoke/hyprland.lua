-- chrom: a still chrome border, the bar's studio stripes on a diagonal (no borderangle turn:
-- it looked uneven; focus shows as the border fade, or as the Tusche Bar's frame glint);
-- the window shadow a faint light.
local active_border_color = { colors = { "rgba(3b3c41ff)", "rgba(f2f3f7ff)", "rgba(6a6c72ff)", "rgba(1c1d20ff)", "rgba(2a2b2fff)", "rgba(e8e9edff)", "rgba(8a8c92ff)", "rgba(1c1d20ff)", "rgba(5a5c62ff)", "rgba(f2f3f7ff)" }, angle = 45 }
local inactive_border_color = "rgba(26272aff)"

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
    shadow = { enabled = true, range = 22, render_power = 3, offset = { 0, 4 }, color = "rgba(ffffff1c)", color_inactive = "rgba(00000000)" },
  },
})

hl.animation({ leaf = "borderangle", enabled = false })
