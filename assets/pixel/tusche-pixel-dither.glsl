// Tusche pixel style: a window dissolves in and out on a 4x4 Bayer grid of
// 4-pixel cells, as the shell's pixel panels do. Written next to
// tusche-pixel.toml by the Tusche Bar's pixel style; removed with it.
float tusche_bayer2(vec2 a) {
  a = floor(a);
  return fract(dot(a, vec2(0.5, a.y * 0.75)));
}

float tusche_bayer4(vec2 a) {
  return tusche_bayer2(0.5 * a) * 0.25 + tusche_bayer2(a);
}

vec4 animation(vec2 uv) {
  float visible = umbriel_direction > 0.0 ? umbriel_clamped_progress : 1.0 - umbriel_clamped_progress;
  vec2 cell = floor(uv * umbriel_size / 4.0);
  float threshold = tusche_bayer4(cell) + 0.03125;
  return umbriel_sample(uv) * step(threshold, visible);
}
