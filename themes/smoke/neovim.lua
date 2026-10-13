-- aether with the theme palette; red is the signal colour only.
return {
  {
    "omacom/aether.nvim",
    branch = "v3",
    name = "aether",
    priority = 1000,
    opts = {
      styles = { comments = { italic = true }, keywords = { bold = true }, functions = { bold = true } },
      colors = {
        bg = "#111419",
        dark_bg = "#0b1017",
        darker_bg = "#080c12",
        lighter_bg = "#1b222c",
        fg = "#f0f3f7",
        dark_fg = "#b0bac8",
        light_fg = "#ececec",
        bright_fg = "#ffffff",
        muted = "#a0abb9",
        red = "#ff6969",
        yellow = "#ffffff",
        orange = "#bcbdbf",
        green = "#ffffff",
        cyan = "#929497",
        blue = "#afb0b2",
        magenta = "#c3c4c5",
        brown = "#5a5c60",
        bright_red = "#ffffff",
        bright_yellow = "#ffffff",
        bright_green = "#ffffff",
        bright_cyan = "#abacae",
        bright_blue = "#c7c8c9",
        bright_magenta = "#d7d8d9",
        accent = "#ffffff",
        cursor = "#ffffff",
        foreground = "#f0f3f7",
        background = "#111419",
        selection = "#303c4c",
        selection_foreground = "#ffffff",
        selection_background = "#303c4c",
      },
      on_highlights = function(hl, c)
        local sig, strong = "#ff6969", "#ffffff"
        for _, g in ipairs({ "Error", "ErrorMsg", "DiagnosticError", "DiagnosticSignError", "DiagnosticVirtualTextError",
          "DiagnosticFloatingError", "diffRemoved", "Removed", "GitSignsDelete", "DiffviewFilePanelDeletions", "SpellBad" }) do
          hl[g] = { fg = sig, bold = g == "Error" or g == "ErrorMsg" }
        end
        hl.DiagnosticUnderlineError = { undercurl = true, sp = sig }
        for _, g in ipairs({ "diffAdded", "Added", "GitSignsAdd" }) do hl[g] = { fg = strong, bold = true } end
        hl.String = { fg = c.green, italic = true }
        hl.Comment = { fg = c.muted, italic = true }
        hl.CursorLineNr = { fg = strong, bold = true }
        hl.Todo = { fg = c.bg, bg = strong, bold = true }
      end,
    },
  },
  {
    "LazyVim/LazyVim",
    opts = {
      colorscheme = "aether",
    },
  },
}
