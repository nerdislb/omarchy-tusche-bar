.pragma library

// Hyprland clients are in compositor logical coordinates. Monitor width/height
// are untransformed pixels; reserved edges are already logical (left/top/right/
// bottom). Share those semantics with the existing Overview, without its capture
// or window-management machinery. No titles, icons or screenshots are needed.
function finite(value) { return typeof value === "number" && isFinite(value) }
function address(value) { return String(value || "").toLowerCase().replace(/^0x/, "") }

function monitorRect(monitor) {
    if (!monitor || monitor.disabled === true) return null
    var scale = finite(monitor.scale) && monitor.scale > 0 ? monitor.scale : 1
    var rotated = Math.abs(Number(monitor.transform) || 0) % 2 === 1
    var width = (rotated ? monitor.height : monitor.width) / scale
    var height = (rotated ? monitor.width : monitor.height) / scale
    if (!finite(width) || !finite(height) || width <= 0 || height <= 0) return null
    var reserved = monitor.reserved || []
    var edge = function(i) { return finite(reserved[i]) ? Math.max(0, reserved[i]) : 0 }
    var left = edge(0), top = edge(1), right = edge(2), bottom = edge(3)
    // A transient/incomplete monitor update must never yield negative geometry.
    if (left + right >= width) { left = 0; right = 0 }
    if (top + bottom >= height) { top = 0; bottom = 0 }
    return {
        x: (finite(monitor.x) ? monitor.x : 0) + left,
        y: (finite(monitor.y) ? monitor.y : 0) + top,
        width: width - left - right, height: height - top - bottom
    }
}

function isRegular(workspace) {
    return !!workspace && finite(workspace.id) && workspace.id !== 0
        && (workspace.id > 0 || String(workspace.name || "").length > 0)
        && String(workspace.name || "").indexOf("special:") !== 0
        && workspace.name !== "special"
}

// Positive IDs have no upper bound. Named regular workspaces have negative
// compositor IDs; special/scratchpad workspaces are not focus targets here.
function workspaceIds(workspaces, active) {
    var ids = []
    for (var i = 0; i < workspaces.length; ++i) {
        var workspace = workspaces[i]
        if (isRegular(workspace) && ids.indexOf(workspace.id) < 0) ids.push(workspace.id)
    }
    if (finite(active) && active > 0 && ids.indexOf(active) < 0) ids.push(active)
    return ids.sort(function(a, b) { return a - b })
}

function workspaceSelector(workspace, id) {
    return workspace && id < 0 && isRegular(workspace)
        ? "name:" + workspace.name : String(id)
}

function matchingMonitor(monitors, value) {
    for (var i = 0; i < monitors.length; ++i) {
        var monitor = monitors[i]
        if (monitor && (monitor.id === value || monitor.name === value) && monitorRect(monitor)) return monitor
    }
    return null
}

function layoutOf(workspace, clients, monitors, focusedAddress) {
    var empty = { available: false, rectangles: [], offscreen: { left: 0, right: 0, top: 0, bottom: 0, total: 0 } }
    if (!isRegular(workspace)) return empty
    clients = clients || []; monitors = monitors || []
    var own = clients.filter(function(client) {
        return client && client.workspace && client.workspace.id === workspace.id
            && client.mapped !== false && client.hidden !== true
    })
    var monitor = matchingMonitor(monitors, workspace.monitorID)
        || matchingMonitor(monitors, workspace.monitor)
    // Avoid projecting onto a different screen during docking/workspace moves.
    // When workspace metadata is not yet complete, a client's source is safer
    // than the focused monitor; a single monitor is the final empty-map fallback.
    if (!monitor) {
        for (var i = 0; i < own.length && !monitor; ++i) monitor = matchingMonitor(monitors, own[i].monitor)
    }
    if (!monitor && monitors.length === 1 && workspace.monitorID === undefined
        && workspace.monitor === undefined && own.length === 0) monitor = monitors[0]
    var area = monitorRect(monitor)
    if (!area) return empty
    var result = { available: true, rectangles: [], offscreen: empty.offscreen,
        aspect: area.width / area.height, monitor: monitor.name || "" }
    var focus = address(focusedAddress)
    for (var j = 0; j < own.length; ++j) {
        var client = own[j], at = client.at || [], size = client.size || []
        if (!finite(at[0]) || !finite(at[1]) || !finite(size[0]) || !finite(size[1]) || size[0] <= 0 || size[1] <= 0) continue
        if (finite(client.monitor) && client.monitor !== monitor.id) continue
        var x = at[0] - area.x, y = at[1] - area.y
        var x2 = x + size[0], y2 = y + size[1]
        if (x2 <= 0 || y2 <= 0 || x >= area.width || y >= area.height) {
            // Parked pages stay discoverable without stacking them at the edge
            // or shrinking the currently visible tiling to an unreadable sliver.
            result.offscreen.total++
            if (x2 <= 0) result.offscreen.left++
            if (x >= area.width) result.offscreen.right++
            if (y2 <= 0) result.offscreen.top++
            if (y >= area.height) result.offscreen.bottom++
            continue
        }
        var left = Math.max(0, x), top = Math.max(0, y)
        var right = Math.min(area.width, x2), bottom = Math.min(area.height, y2)
        result.rectangles.push({
            x: left / area.width, y: top / area.height,
            width: (right - left) / area.width, height: (bottom - top) / area.height,
            focused: !!focus && address(client.address) === focus,
            floating: client.floating === true, fullscreen: Number(client.fullscreen) > 0,
            clipped: left !== x || top !== y || right !== x2 || bottom !== y2,
            address: String(client.address || "")
        })
    }
    // Keep floating and focused windows legible above underlying tiles.
    result.rectangles.sort(function(a, b) {
        return (a.focused ? 2 : a.floating ? 1 : 0) - (b.focused ? 2 : b.floating ? 1 : 0)
    })
    return result
}

// Hyprland does not emit a geometry event for every manual resize. These
// events plus one refresh on pointer entry cover settled layouts without an
// idle poll or per-frame IPC; the larger Overview remains the full tape view.
function eventAffectsGeometry(name) {
    return /^(openwindow|closewindow|movewindow(v2)?|workspace(v2)?|focusedmon(v2)?|activewindowv2|fullscreen|changefloatingmode|moveactive|resizeactive|moveworkspace(v2)?|createworkspace(v2)?|destroyworkspace(v2)?|togglegroup|moveintogroup|moveoutofgroup|pin|configreloaded|monitor.*|openlayer|closelayer)$/.test(String(name || ""))
}

function eventAffectsMonitors(name) {
    return /^(monitor.*|configreloaded|openlayer|closelayer|moveworkspace(v2)?)$/.test(String(name || ""))
}

// hyprctl --batch emits adjacent JSON documents, not one JSON array. Parse
// balanced values with string/escape awareness; never split on title content.
// Only the geometry/IDs survive into the retained snapshot (no titles/PIDs).
function parseSnapshot(text) {
    if (typeof text !== "string" || text.length > 4194304) return null
    var values = [], start = -1, depth = 0, quoted = false, escaped = false
    try {
        for (var i = 0; i < text.length; ++i) {
            var c = text[i]
            if (start < 0) {
                if (/\s/.test(c)) continue
                if (c !== "[" && c !== "{") return null
                start = i
            }
            if (quoted) {
                if (escaped) escaped = false
                else if (c === "\\") escaped = true
                else if (c === '"') quoted = false
            } else if (c === '"') quoted = true
            else if (c === "[" || c === "{") depth++
            else if (c === "]" || c === "}") {
                depth--
                if (depth === 0) { values.push(JSON.parse(text.slice(start, i + 1))); start = -1 }
            }
        }
    } catch (_) { return null }
    if (start >= 0 || values.length !== 4 || !Array.isArray(values[0])
        || !Array.isArray(values[1]) || !Array.isArray(values[2])
        || !values[3] || !finite(values[3].id)) return null
    return {
        monitors: values[0].filter(function(m) { return !!monitorRect(m) }).map(function(m) {
            return {id:m.id,name:m.name,x:m.x,y:m.y,width:m.width,height:m.height,scale:m.scale,transform:m.transform,reserved:m.reserved,
                dpmsStatus:m.dpmsStatus,solitaryBlockedBy:Array.isArray(m.solitaryBlockedBy)?m.solitaryBlockedBy.slice(0,8):undefined}
        }),
        workspaces: values[1].filter(isRegular).map(function(w) {
            return {id:w.id,name:w.name,monitor:w.monitor,monitorID:w.monitorID,windows:w.windows || 0}
        }),
        clients: values[2].filter(function(c) { return c && c.workspace }).map(function(c) {
            return {address:c.address,at:c.at,size:c.size,workspace:{id:c.workspace.id},monitor:c.monitor,
                mapped:c.mapped,hidden:c.hidden,floating:c.floating,fullscreen:c.fullscreen}
        }),
        active: {id:values[3].id,name:values[3].name}
    }
}
