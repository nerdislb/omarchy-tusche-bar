.pragma library

function parse(value) {
    return String(value).split(",").map(function(name) { return name.trim().toUpperCase() })
}

// Commons.Compositor maps Umbriel's fixed, per-output inventory into blocks
// of ten (indices above ten use 1000 + output * 100 + index). Sparse occupied
// workspaces must not renumber a channel when another workspace becomes empty.
function position(id, workspaces, umbriel) {
    if (umbriel && id > 0) return id >= 1000 ? (id - 1000) % 100 : (id - 1) % 10 + 1
    var own = null
    for (var i = 0; i < workspaces.length; i++) if (workspaces[i].id === id) own = workspaces[i]
    if (!own) return 0
    var monitor = own.monitorID === undefined ? own.monitor : own.monitorID
    var ids = workspaces.filter(function(w) {
        return (w.monitorID === undefined ? w.monitor : w.monitorID) === monitor
            && String(w.name || "").indexOf("special:") !== 0
    }).map(function(w) { return w.id }).sort(function(a, b) { return a - b })
    return ids.indexOf(id) + 1
}

function label(position, names) {
    if (position < 1) return ""
    var number = String(position).padStart(2, "0")
    return names[position - 1] ? number + " " + names[position - 1] : "CH " + number
}
