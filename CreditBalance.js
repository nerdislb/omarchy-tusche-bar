.pragma library

// A monetary credit pool has no subscription percentage or weekly reset.
function view(record, now) {
  var stamp = record && Date.parse(record.updatedAt)
  if (!record || record.status !== "ok" || !isFinite(stamp))
    return { state: "unavailable", label: "Unavailable", compact: "credits ?" }
  if (now - stamp > 1800000 || stamp > now + 60000)
    return { state: "stale", label: "Out of date", compact: "credits ?" }
  if (record.unlimited === true)
    return { state: "ok", label: "Unlimited", compact: "credits ∞" }
  var amount = typeof record.balance === "string" && record.balance.trim() !== "" ? Number(record.balance) : NaN
  if (!isFinite(amount) || amount < 0 || amount > 1e12)
    return { state: "unavailable", label: "Unavailable", compact: "credits ?" }
  var compact = amount >= 1e6 ? (amount / 1e6).toFixed(1) + "M"
    : amount >= 1000 ? (amount / 1000).toFixed(1) + "k" : amount.toFixed(amount < 10 ? 2 : 0)
  return { state: "ok", amount: amount, label: "", compact: compact + " cr" }
}

function grantText(grants) {
  if (!Array.isArray(grants)) return ""
  return grants.slice(0, 8).filter(function(g) {
    return g && typeof g.amount === "number" && isFinite(g.amount) && g.amount > 0
      && /^\d{4}-\d{2}-\d{2}$/.test(String(g.expiresOn || ""))
  }).map(function(g) {
    return "Support grant: " + String(g.amount).replace(/\B(?=(\d{3})+(?!\d))/g, ",")
      + " credits · expires " + g.expiresOn + " (per email)."
  }).join("\n")
}
