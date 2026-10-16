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
        bg = "#1b0e0a",
        dark_bg = "#140a07",
        darker_bg = "#0d0604",
        lighter_bg = "#2a1711",
        fg = "#f3e0cd",
        dark_fg = "#cba78f",
        light_fg = "#ead2bd",
        bright_fg = "#fff4e8",
        muted = "#a7836c",
        red = "#ee7a64",
        yellow = "#e9c47c",
        orange = "#eda55a",
        green = "#adb98c",
        cyan = "#93b8aa",
        blue = "#a2b4bb",
        magenta = "#d6919a",
        brown = "#9a5b3e",
        bright_red = "#eda55a",
        bright_yellow = "#f2d394",
        bright_green = "#c1cba0",
        bright_cyan = "#a9c9bd",
        bright_blue = "#b6c6cc",
        bright_magenta = "#e2a6ad",
        accent = "#eda55a",
        cursor = "#eda55a",
        foreground = "#f3e0cd",
        background = "#1b0e0a",
        selection = "#46261b",
        selection_foreground = "#fff4e8",
        selection_background = "#46261b",
      },
      on_highlights = function(hl, c)
        local sig = "#ee7a64"
        for _, g in ipairs({ "Error", "ErrorMsg", "DiagnosticError", "DiagnosticSignError", "DiagnosticVirtualTextError",
          "DiagnosticFloatingError", "diffRemoved", "Removed", "GitSignsDelete", "DiffviewFilePanelDeletions", "SpellBad" }) do
          hl[g] = { fg = sig, bold = g == "Error" or g == "ErrorMsg" }
        end
        hl.DiagnosticUnderlineError = { undercurl = true, sp = sig }
        hl.Comment = { fg = c.muted, italic = true }
        hl.CursorLineNr = { fg = "#eda55a", bold = true }
        hl.Todo = { fg = c.bg, bg = "#eda55a", bold = true }
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
