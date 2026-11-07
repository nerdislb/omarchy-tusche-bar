.pragma library

function composite(ink, background, alpha) {
    return { r: ink.r * alpha + background.r * (1 - alpha),
             g: ink.g * alpha + background.g * (1 - alpha),
             b: ink.b * alpha + background.b * (1 - alpha) }
}
function linear(value) { return value <= 0.04045 ? value / 12.92 : Math.pow((value + 0.055) / 1.055, 2.4) }
function luminance(c) { return 0.2126 * linear(c.r) + 0.7152 * linear(c.g) + 0.0722 * linear(c.b) }
function ratio(a, b) {
    var x = luminance(a), y = luminance(b)
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)
}
function quantize(c) {
    return {r:Math.round(c.r * 255) / 255, g:Math.round(c.g * 255) / 255, b:Math.round(c.b * 255) / 255}
}
function opacity(ink, backgrounds, minimum) {
    function passes(alpha, target) {
        return backgrounds.every(function(bg) {
            var surface = quantize(bg)
            return ratio(composite(ink, bg, alpha), bg) >= target
                && ratio(quantize(composite(ink, surface, Math.round(alpha * 255) / 255)), surface) >= target
        })
    }
    // Preserve the original color exactly whenever it already passes.
    if (passes(minimum, 4.5)) return minimum
    var low = minimum, high = 1
    for (var i = 0; i < 20; i++) {
        var mid = (low + high) / 2
        if (passes(mid, 4.55)) high = mid
        else low = mid
    }
    // Round upward on the compositor's 8-bit output grid, including a small
    // margin for surface rounding.
    return Math.min(1, (Math.ceil(high * 255) + 1) / 255)
}
function color(ink, backgrounds, minimum) {
    return Qt.rgba(ink.r, ink.g, ink.b, opacity(ink, backgrounds, minimum))
}
function backgrounds(ink, background, accent, plate) {
    if (!plate) return [background]
    // Cover rest, pointer hover and open-panel tint without changing text
    // color during the shell's plate animation. No per-frame JS work.
    return [background, composite(ink, background, 0.075),
            composite(ink, background, 0.13), composite(accent, background, 0.2)]
}
