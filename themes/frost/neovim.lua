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
        bg = "#e9edf0",
        dark_bg = "#d8dfe7",
        darker_bg = "#c8d1dc",
        lighter_bg = "#f0f5fa",
        fg = "#171c24",
        dark_fg = "#444c59",
        light_fg = "#11151b",
        bright_fg = "#000000",
        muted = "#515b69",
        red = "#b32525",
        yellow = "#000000",
        orange = "#353739",
        green = "#000000",
        cyan = "#535457",
        blue = "#353739",
        magenta = "#444c59",
        brown = "#818488",
        bright_red = "#000000",
        bright_yellow = "#000000",
        bright_green = "#000000",
        bright_cyan = "#494a4d",
        bright_blue = "#2e2f32",
        bright_magenta = "#383a3d",
        accent = "#0f1113",
        cursor = "#000000",
        foreground = "#171c24",
        background = "#e9edf0",
        selection = "#c8d1dc",
        selection_foreground = "#000000",
        selection_background = "#c8d1dc",
      },
      on_highlights = function(hl, c)
        local sig, strong = "#b32525", "#000000"
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
