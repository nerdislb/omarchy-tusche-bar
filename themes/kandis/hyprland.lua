-- kandis: a still amber stripe border on a diagonal (no borderangle turn, as Frost / Smoke); focus shows as the
-- border and the Tusche Bar's frame glint. The window shadow is a soft warm dark, as Frost's: no light focus halo.
local active_border_color = { colors = { "rgba(9a5a26ff)", "rgba(fff0d2ff)", "rgba(d39a5cff)", "rgba(5a3214ff)", "rgba(b07038ff)", "rgba(ffe6bcff)", "rgba(c88a4cff)", "rgba(5a3214ff)", "rgba(a8662eff)", "rgba(fff0d2ff)" }, angle = 45 }
local inactive_border_color = "rgba(dccab0ff)"

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
    shadow = { enabled = true, range = 24, render_power = 3, offset = { 0, 4 }, color = "rgba(2a170c2a)", color_inactive = "rgba(00000000)" },
  },
})

hl.animation({ leaf = "borderangle", enabled = false })
