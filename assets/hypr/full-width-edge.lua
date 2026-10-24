-- Written by the Tusche Bar Control Center (Extras → Full width windows).
-- Full width (SUPER + ALT + F) fills the screen edge to edge: a workspace with a
-- maximized window drops its outer gaps, border and rounding. Switch it off in
-- the Control Center, or delete this file and run `hyprctl reload`.
-- Idea from the hyprperks dotfiles (hyprwm/hyprperks-dotfiles, workspaces.lua).
hl.workspace_rule({
  workspace = "f[1]",
  gaps_out = 0,
  border_size = 0,
  no_rounding = true,
})
