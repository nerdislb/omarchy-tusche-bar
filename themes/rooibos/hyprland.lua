-- rooibos: a still amber stripe border on a diagonal (no borderangle turn, as Frost / Smoke); focus shows as the
-- border and the Tusche Bar's frame glint. The window shadow is a soft warm dark, as Frost's: no light focus halo.
local active_border_color = { colors = { "rgba(5a2a14ff)", "rgba(f6c98aff)", "rgba(b8733aff)", "rgba(2a120aff)", "rgba(7a3c1cff)", "rgba(f3b86eff)", "rgba(9a5a2cff)", "rgba(2a120aff)", "rgba(6a321aff)", "rgba(f6c98aff)" }, angle = 45 }
local inactive_border_color = "rgba(2e1912ff)"

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
    shadow = { enabled = true, range = 24, render_power = 3, offset = { 0, 4 }, color = "rgba(0d06032e)", color_inactive = "rgba(00000000)" },
  },
})

hl.animation({ leaf = "borderangle", enabled = false })
