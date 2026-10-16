-- aether with the theme palette; red is the signal colour only (errors, diagnostics, deletions).
return {
  {
    "omacom/aether.nvim",
    branch = "v3",
    name = "aether",
    priority = 1000,
    opts = {
      styles = { comments = { italic = true }, keywords = { bold = true }, functions = { bold = true } },
      colors = {
        bg = "#f7efdf",
        dark_bg = "#eee2cc",
        darker_bg = "#e2d2b6",
        lighter_bg = "#fcf8ef",
        fg = "#2d1b10",
        dark_fg = "#5a3f2a",
        light_fg = "#24150b",
        bright_fg = "#140b05",
        muted = "#7f624a",
        red = "#a63d2c",
        yellow = "#7d5b0b",
        orange = "#9a5216",
        green = "#56673a",
        cyan = "#3b6a60",
        blue = "#3f5e6a",
        magenta = "#8e4a59",
        brown = "#6b4227",
        bright_red = "#9a5216",
        bright_yellow = "#6e5007",
        bright_green = "#4c5c2c",
        bright_cyan = "#2f5c52",
        bright_blue = "#33505c",
        bright_magenta = "#7c3d4c",
        accent = "#9a5216",
        cursor = "#9a5216",
        foreground = "#2d1b10",
        background = "#f7efdf",
        selection = "#f0dbb2",
        selection_foreground = "#140b05",
        selection_background = "#f0dbb2",
      },
      on_highlights = function(hl, c)
        local sig = "#a63d2c"
        for _, g in ipairs({ "Error", "ErrorMsg", "DiagnosticError", "DiagnosticSignError", "DiagnosticVirtualTextError",
          "DiagnosticFloatingError", "diffRemoved", "Removed", "GitSignsDelete", "DiffviewFilePanelDeletions", "SpellBad" }) do
          hl[g] = { fg = sig, bold = g == "Error" or g == "ErrorMsg" }
        end
        hl.DiagnosticUnderlineError = { undercurl = true, sp = sig }
        hl.Comment = { fg = c.muted, italic = true }
        hl.CursorLineNr = { fg = "#9a5216", bold = true }
        hl.Todo = { fg = c.bg, bg = "#9a5216", bold = true }
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
