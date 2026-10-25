# vendor

`MenuModel.js` is Omarchy's own menu model library, copied unchanged from
`shell/plugins/menu/MenuModel.js` (Omarchy r7281, last changed in commit c39fd2af, 2026-10-22;
MIT License, Copyright (c) David Heinemeier Hansson). The drop-down logo
menu (`DropMenu.qml`, `OmarchyMenuSource.qml`) and the Control Center's
Omarchy rows (`OmarchySettings.js`) use it to read
`omarchy-menu.jsonc` and the user's extensions exactly the way the native
menu does: merge, `when:` / `checked:` / `disabled:` guards, search.

Keep the file byte-identical to upstream. To update it:

    cp "$OMARCHY_PATH/shell/plugins/menu/MenuModel.js" vendor/MenuModel.js
