# vendor

`MenuModel.js` is Omarchy's own menu model library, copied unchanged from
`shell/plugins/menu/MenuModel.js` (Omarchy commit 492b8837, 2026-10-14;
MIT License, Copyright (c) David Heinemeier Hansson). The drop-down logo
menu (`DropMenu.qml`, `OmarchyMenuSource.qml`) uses it to read
`omarchy-menu.jsonc` and the user's extensions exactly the way the native
menu does: merge, `when:` / `checked:` / `disabled:` guards, search.

Keep the file byte-identical to upstream. To update it:

    cp "$OMARCHY_PATH/shell/plugins/menu/MenuModel.js" vendor/MenuModel.js
