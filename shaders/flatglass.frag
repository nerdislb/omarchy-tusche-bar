#version 440
// Iris: tint and pre-blurred backdrop only. No bevel, refraction or glint.
// The uniform layout matches glass.frag; the established material stays intact.
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
void main() {
    vec2 p = qt_TexCoord0 * size;
    float r = min(max(radius, 0.0), min(size.x, size.y) * 0.5);
    vec2 q = abs(p - size * 0.5) - size * 0.5 + r;
    float d = length(max(q, vec2(0.0))) + min(max(q.x, q.y), 0.0) - r;
    float aa = max(fwidth(d), 0.7);
    float alpha = (1.0 - smoothstep(-aa, aa, d)) * (1.0 - smoothstep(size.y * reveal - 0.5, size.y * reveal + 0.5, p.y));
    if (reveal <= 0.0 || alpha <= 0.001) { fragColor = vec4(0.0); return; }
    vec3 body = texture(src, clamp((p + padding) / textureSize_, vec2(0.0), vec2(1.0))).rgb;
    // Iris's backing already protects contrast. Only cap exceptionally bright
    // dark-mode backdrops, scaling all channels together to retain their hue.
    // The older glass shader's per-channel clamp flattened coloured wallpapers.
    if (lightOn < 0.5) body *= min(1.0, 0.80 / max(max(body.r, body.g), max(body.b, 0.001)));
    body = mix(body, tint.rgb, clamp(backing, 0.0, 1.0));
    fragColor = vec4(body * alpha, alpha) * qt_Opacity;
}
