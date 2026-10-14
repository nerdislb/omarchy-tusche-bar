#version 440
// The glass family's frame glint (Frost / Smoke, 14.10.2026): the light a Bevel
// Lens card catches as it opens (glass.frag), on the focused window's frame. One
// soft band crosses the frame diagonally once, from the top-left corner to the
// bottom-right one, as the cards' sweep does; cool light and a faint bevel
// shadow beside it, nothing metallic: no dark steel shoulders, no colour
// fringes, no sparks (metal.frag's frame glint is the metal family's).
// Only the frame itself is drawn, and only where the band is.
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec2 size;       // item size, px
    vec4 rect;       // the frame's outline inside the item: x, y, w, h, px
    float radius;    // corner radius, px
    float tube;      // frame width, px
    float sweep;     // the band's place across the frame (0 top-left .. 1 bottom-right)
    float amount;    // the band's strength (0 = nothing drawn)
    float band;      // the band's half width, a fraction of the frame's diagonal extent
    float shadeAmt;  // the bevel shadow beside the band (0 = none)
    float bloom;     // soft light just outside the frame (0 = none)
    vec4 tint;       // the band's light
    vec4 shade;      // the shadow's colour
};

float sdRR(vec2 p, vec4 r, float rad) {
    vec2 c = r.xy + r.zw * 0.5;
    rad = min(rad, 0.5 * min(r.z, r.w));
    vec2 q = abs(p - c) - r.zw * 0.5 + rad;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;
}

void main() {
    vec2 p = qt_TexCoord0 * size;
    float hw = 0.5 * tube;
    float dc = sdRR(p, rect, radius) + hw;               // 0 on the frame's centre line
    float cov = clamp(hw - abs(dc) + 0.5, 0.0, 1.0);
    // the cards' sweep coordinate: a diagonal, 0 at the top-left corner, 1 at the bottom-right one
    float pos = ((p.x - rect.x) + 0.5 * (p.y - rect.y)) / max(1.0, rect.z + 0.5 * rect.w);
    float sd = pos - sweep;
    float w = max(0.002, band);
    float core = amount * exp(-sd * sd / (w * w));
    float wide = amount * exp(-sd * sd / (4.0 * w * w));
    if (wide < 0.004) { fragColor = vec4(0.0); return; }
    float off = max(0.0, abs(dc) - hw);
    float halo = bloom * core * exp(-off * off / 5.0) * (1.0 - cov);
    // the facet in shadow beside the band, the light in its core (premultiplied, partly additive)
    float sh = cov * clamp(wide - core, 0.0, 1.0) * shadeAmt;
    float li = cov * core;
    vec4 o = vec4(tint.rgb * li, li * 0.8) + vec4(shade.rgb * sh, sh) * (1.0 - li * 0.8);
    o += vec4(tint.rgb * halo, halo * 0.6) * (1.0 - o.a);
    fragColor = o * qt_Opacity;
}
