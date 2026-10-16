#version 440
// Original Bevel Lens shader. Only a PRE-BLURRED region is sampled, including
// at the optical edge: refraction must never duplicate readable rear text.
layout(location = 0) in vec2 qt_TexCoord0;
layout(location = 0) out vec4 fragColor;
layout(std140, binding = 0) uniform buf {
    mat4 qt_Matrix;
    float qt_Opacity;
    vec2 size;
    vec2 textureSize_;
    float padding;
    float radius;
    float bevel;
    float bend;
    float backing;
    float lightOn;
    float reveal;
    float sweep;
    float strength;
    float gloss;
    vec4 tint;
};
layout(binding = 1) uniform sampler2D src;

float distanceToCard(vec2 p) {
    float r = min(max(radius, 0.0), min(size.x, size.y) * 0.5);
    vec2 q = abs(p - size * 0.5) - size * 0.5 + r;
    return length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - r;
}
void main() {
    vec2 p = qt_TexCoord0 * size;
    float d = distanceToCard(p);
    float aa = max(fwidth(d), 0.7);
    float alpha = (1.0 - smoothstep(-aa, aa, d)) * (1.0 - smoothstep(size.y * reveal - 0.5, size.y * reveal + 0.5, p.y));
    if (reveal <= 0.0 || alpha <= 0.001) { fragColor = vec4(0.0); return; }
    vec2 normal = normalize(vec2(dFdx(d), dFdy(d)) + vec2(0.000001));
    float inside = max(-d, 0.0);
    float edge = 1.0 - smoothstep(0.0, max(bevel, 1.0), inside);
    vec2 uv = (p + padding + normal * sin(edge * 1.5707963) * bend) / textureSize_;
    vec3 body = texture(src, clamp(uv, vec2(0.0), vec2(1.0))).rgb;
    // Endpoint contrast protection, independently of wallpaper/window colours.
    body = lightOn > 0.5 ? max(body, vec3(0.70)) : min(body, vec3(0.32));
    body = mix(body, tint.rgb, clamp(backing, 0.0, 1.0));
    float facing = max(dot(normal, normalize(vec2(-0.58, -0.82))), 0.0);
    float shade = max(dot(normal, normalize(vec2(0.58, 0.82))), 0.0);
    float rim = exp(-inside / 1.4);
    float gleam = exp(-pow((inside - bevel * 0.42) / max(0.8, bevel * 0.2), 2.0));
    body += vec3(rim * (0.06 + 0.30 * facing) + gleam * 0.12 * facing);
    body -= vec3(rim * shade * (lightOn > 0.5 ? 0.14 : 0.055));
    float diagonal = (p.x + p.y) / max(size.x + size.y, 1.0);
    // Gloss: the plate seen at rest (0 = the plain bevel above). A crisp inner
    // edge line, the glass thickness shading the unlit sides, and two still
    // reflections along the same diagonal as the entry light. All additive and
    // bounded, cool or neutral, no colour fringes, no animation clock.
    float g = clamp(gloss, 0.0, 2.0);
    if (g > 0.0) {
        float line = exp(-pow((inside - 0.8) / 0.65, 2.0));
        body += vec3(line * g * (0.12 + 0.34 * facing));
        float thick = exp(-pow((inside - bevel * 0.6) / max(1.0, bevel * 0.45), 2.0));
        body -= vec3(1.0, 0.82, 0.62) * (thick * shade * g * (lightOn > 0.5 ? 0.11 : 0.06));
        float wide = exp(-pow((diagonal - 0.17) / 0.10, 2.0));
        float thin = exp(-pow((diagonal - 0.31) / 0.008, 2.0));
        body += vec3((wide * 0.085 + thin * 0.075) * g);
        // light plate: a little depth towards the far corner, so the card does not merge into a pale backdrop
        if (lightOn > 0.5) body -= vec3(1.0, 0.8, 0.58) * (smoothstep(0.45, 1.0, diagonal) * 0.045 * g);
    }
    body += vec3(exp(-pow((diagonal - sweep) / 0.075, 2.0)) * edge * strength * 0.16);
    fragColor = vec4(clamp(body, 0.0, 1.0) * alpha, alpha) * qt_Opacity;
}
