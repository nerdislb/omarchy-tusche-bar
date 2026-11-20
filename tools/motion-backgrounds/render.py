#!/usr/bin/env python3
"""Subtle motion for the Tusche & Papier backgrounds – one deterministic renderer.

  render.py still SCENE VARIANT T OUT.png [--size WxH]
  render.py clip  SCENE VARIANT OUT.mp4  [--size WxH] [--fps N] [--seconds S] [--start T]
  render.py loopcheck SCENE VARIANT [--size WxH]
  render.py list

VARIANT is "air" (atmosphere only: mist, light, wind) or "life" (the same plus
a rare guest: birds, a gull, a leaf). Every scene is a pure function of time t
in seconds with the loop length LOOP: frame(t) == frame(t + LOOP), so a clip of
LOOP seconds plays as a seamless background loop. Stills, gallery clips and the
reel all come from frame().
"""
import math
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

LOOP = 60.0
THEMES = Path(__file__).resolve().parents[2] / 'themes'
INK = np.array([43, 41, 36], np.float32) / 255
PAPER = np.array([223, 218, 203], np.float32) / 255
TAU = 2 * math.pi


# ---------------------------------------------------------------- helpers
def load(rel, size):
    im = Image.open(THEMES / rel).convert('RGB').resize(size, Image.LANCZOS)
    return np.asarray(im, np.float32) / 255


def lum(img):
    return img[..., 0] * 0.2126 + img[..., 1] * 0.7152 + img[..., 2] * 0.0722


def box_blur(a, r):
    """Separable box blur (edges clamped), r in pixels."""
    if r < 1:
        return a
    out = a
    for axis in (0, 1):
        pad = [(0, 0)] * out.ndim
        pad[axis] = (r + 1, r)
        p = np.pad(out, pad, mode='edge')
        c = np.cumsum(p, axis=axis, dtype=np.float64)
        n = out.shape[axis]
        hi = np.take(c, np.arange(2 * r + 1, 2 * r + 1 + n), axis=axis)
        lo = np.take(c, np.arange(0, n), axis=axis)
        out = ((hi - lo) / (2 * r + 1)).astype(np.float32)
    return out


def periodic_noise(h, w, feature, seed, feature_y=None):
    """Soft noise in [0,1], periodic in both axes (FFT low-pass of white noise).
    feature_y < feature gives long horizontal bands, like mist."""
    rng = np.random.default_rng(seed)
    f = np.fft.rfft2(rng.standard_normal((h, w)))
    ky = np.fft.fftfreq(h)[:, None]
    kx = np.fft.rfftfreq(w)[None, :]
    fy = feature if feature_y is None else feature_y
    f *= np.exp(-((kx * feature) ** 2 + (ky * fy) ** 2) / 2)
    n = np.fft.irfft2(f, s=(h, w)).astype(np.float32)
    n -= n.min()
    return n / max(n.max(), 1e-6)


def roll_shift(tex, dx=0.0, dy=0.0):
    """Periodic bilinear shift of a 2-D texture by (dx, dy) pixels."""
    out = tex
    if dx:
        i = math.floor(dx); f = dx - i
        a = np.roll(out, i, axis=1)
        out = a * (1 - f) + np.roll(a, 1, axis=1) * f
    if dy:
        i = math.floor(dy); f = dy - i
        a = np.roll(out, i, axis=0)
        out = a * (1 - f) + np.roll(a, 1, axis=0) * f
    return out


def sample(img, xs, ys):
    """Bilinear sampling of img (H,W,3) at float coordinates (clamped)."""
    h, w = img.shape[:2]
    xs = np.clip(xs, 0, w - 1.001); ys = np.clip(ys, 0, h - 1.001)
    x0 = xs.astype(np.int32); y0 = ys.astype(np.int32)
    fx = (xs - x0)[..., None]; fy = (ys - y0)[..., None]
    a = img[y0, x0]; b = img[y0, x0 + 1]; c = img[y0 + 1, x0]; d = img[y0 + 1, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def smooth(e0, e1, x):
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def ease(x):
    x = min(max(x, 0.0), 1.0)
    return x * x * (3 - 2 * x)


def window(t, t0, t1):
    """0..1 progress of an event that runs once per loop from t0 to t1 (else None)."""
    t = t % LOOP
    if t0 <= t <= t1:
        return (t - t0) / (t1 - t0)
    return None


# ---------------------------------------------------------------- sprites
def stamp(layer_rgb, layer_a, sprite, cx, cy):
    """Alpha-composite an RGBA float sprite (h,w,4) centred at (cx, cy) into the
    premultiplied accumulation buffers (subpixel placement via bilinear shift)."""
    sh, sw = sprite.shape[:2]
    x0f = cx - sw / 2; y0f = cy - sh / 2
    x0 = math.floor(x0f); y0 = math.floor(y0f)
    fx = x0f - x0; fy = y0f - y0
    s = np.zeros((sh + 1, sw + 1, 4), np.float32)
    s[:sh, :sw] += sprite * (1 - fx) * (1 - fy)
    s[:sh, 1:] += sprite * fx * (1 - fy)
    s[1:, :sw] += sprite * (1 - fx) * fy
    s[1:, 1:] += sprite * fx * fy
    H, W = layer_a.shape
    ya, yb = max(0, y0), min(H, y0 + sh + 1)
    xa, xb = max(0, x0), min(W, x0 + sw + 1)
    if ya >= yb or xa >= xb:
        return
    part = s[ya - y0:yb - y0, xa - x0:xb - x0]
    a = part[..., 3:4]
    layer_rgb[ya:yb, xa:xb] = layer_rgb[ya:yb, xa:xb] * (1 - a) + part[..., :3] * a
    layer_a[ya:yb, xa:xb] = layer_a[ya:yb, xa:xb] * (1 - a[..., 0]) + a[..., 0]


def bird_sprite(span, phase, color, alpha=0.9, ss=4):
    """A far bird: two wings as curved strokes; phase 0..1 of a wing beat."""
    s = int(span * ss)
    im = Image.new('L', (s * 2, s * 2), 0)
    d = ImageDraw.Draw(im)
    c = s
    lift = math.sin(phase * TAU) * 0.55          # wing tips up/down
    tipy = c - lift * s * 0.45
    midy = c - lift * s * 0.15
    w = max(1, int(ss * span / 9))
    for side in (-1, 1):
        pts = [(c, c + s * 0.05), (c + side * s * 0.22, midy - s * 0.05), (c + side * s * 0.5, tipy)]
        d.line(pts, fill=255, width=w, joint='curve')
    d.ellipse((c - w, c - w * 0.6, c + w, c + w * 1.2), fill=255)
    small = im.resize((s // ss * 2, s // ss * 2), Image.LANCZOS)
    a = np.asarray(small, np.float32)[..., None] / 255 * alpha
    rgb = np.broadcast_to(color, a.shape[:2] + (3,))
    return np.concatenate([rgb, a], axis=2).astype(np.float32)


def leaf_sprite(size, angle, flip, color, alpha=0.85, ss=4):
    """A small leaf (almond blade, midrib, short stem); flip -1..1 = flutter."""
    s = int(size * ss)
    im = Image.new('L', (s * 3, s * 3), 0)
    d = ImageDraw.Draw(im)
    c = s * 1.5
    pts = []
    for i in range(41):
        u = i / 40
        x = (u - 0.5) * s
        y = math.sin(u * math.pi) * s * 0.28
        pts.append((x, -y))
    for i in range(40, -1, -1):
        u = i / 40
        x = (u - 0.5) * s
        y = math.sin(u * math.pi) * s * 0.28 * 0.9
        pts.append((x, y))
    stem = [(-0.5 * s, 0), (-0.72 * s, 0.06 * s)]
    ca, sa = math.cos(angle), math.sin(angle)
    def tf(p):
        x, y = p
        y *= flip
        return (c + x * ca - y * sa, c + x * sa + y * ca)
    d.polygon([tf(p) for p in pts], fill=200)
    d.line([tf(p) for p in stem], fill=255, width=max(1, ss))
    d.line([tf((-0.48 * s, 0)), tf((0.45 * s, 0))], fill=255, width=max(1, ss // 2))
    small = im.resize((s * 3 // ss, s * 3 // ss), Image.LANCZOS)
    a = np.asarray(small, np.float32)[..., None] / 255 * alpha
    rgb = np.broadcast_to(color, a.shape[:2] + (3,))
    return np.concatenate([rgb, a], axis=2).astype(np.float32)


GAUSS = {}


def dot(radius):
    r = round(radius * 4) / 4
    if r not in GAUSS:
        n = int(math.ceil(r * 3)) * 2 + 1
        y, x = np.mgrid[:n, :n] - n // 2
        GAUSS[r] = np.exp(-(x ** 2 + y ** 2) / (2 * r * r)).astype(np.float32)
    return GAUSS[r]


def add_dots(glow, pts):
    """Additive soft dots: pts = [(x, y, radius, intensity)]."""
    H, W = glow.shape
    for x, y, r, k in pts:
        g = dot(r)
        n = g.shape[0]; h = n // 2
        xi, yi = int(round(x)), int(round(y))
        xa, xb = xi - h, xi + h + 1
        ya, yb = yi - h, yi + h + 1
        if xb <= 0 or yb <= 0 or xa >= W or ya >= H:
            continue
        gx0, gy0 = max(0, -xa), max(0, -ya)
        xa2, ya2 = max(0, xa), max(0, ya)
        xb2, yb2 = min(W, xb), min(H, yb)
        glow[ya2:yb2, xa2:xb2] += g[gy0:gy0 + yb2 - ya2, gx0:gx0 + xb2 - xa2] * k


def flock(t, t0, t1, path, n, span, color, seed, rgb, a):
    """n birds flying along path(u) -> (x, y) once per loop, loose formation."""
    u = window(t, t0, t1)
    if u is None:
        return
    rng = np.random.default_rng(seed)
    offs = rng.uniform(-1, 1, (n, 2)) * np.array([span * 3.0, span * 1.4])
    offs[0] = 0
    ph = rng.uniform(0, 1, n)
    for i in range(n):
        x, y = path(u)
        x += offs[i, 0]; y += offs[i, 1] + math.sin((t + ph[i] * 3) * 0.9) * span * 0.25
        # beat in bursts, glide in between
        beat = (t * 2.6 + ph[i]) % 1.0
        glide = 0.5 + 0.5 * math.sin(t * 0.7 + ph[i] * 6)
        phase = beat if glide > 0.45 else 0.18
        stamp(rgb, a, bird_sprite(span * (0.9 + 0.2 * ph[i]), phase, color), x, y)


# ---------------------------------------------------------------- scenes
class Scene:
    title = ''
    src = ''
    theme = ''
    has_life = True

    def __init__(self, size):
        self.W, self.H = size
        self.base = load(self.src, size)
        self.s = self.W / 1280.0           # scale relative to the 720p design
        self.setup()

    def setup(self):
        pass

    def frame(self, t, variant):
        return self.base


class Berge(Scene):
    title = 'Berge – Nebel zieht, Vögel'
    src = 'papier/backgrounds/1-berge.jpg'
    theme = 'Papier · Papier Lavur'

    def setup(self):
        H, W = self.H, self.W
        self.m1 = periodic_noise(H, W, 150 * self.s, 11, 34 * self.s)
        self.m2 = periodic_noise(H, W // 2, 90 * self.s, 12, 24 * self.s)
        y = np.linspace(0, 1, H)[:, None]
        self.band = (smooth(0.28, 0.45, y) * (1 - smooth(0.86, 0.98, y))).astype(np.float32)

    def frame(self, t, variant):
        W = self.W
        p = t / LOOP
        a = roll_shift(self.m1, -p * W)                        # one width per loop
        b = np.tile(roll_shift(self.m2, -p * (W // 2) * 2), (1, 2))[:, :W]
        mist = smooth(0.45, 0.85, a * 0.6 + b * 0.4) * self.band * 0.42
        out = self.base * (1 - mist[..., None]) + PAPER * mist[..., None]
        if variant == 'life':
            rgb = np.zeros_like(out); al = np.zeros(out.shape[:2], np.float32)
            Wd, Hd = self.W, self.H
            path = lambda u: (Wd * (1.08 - 1.2 * u), Hd * (0.17 + 0.05 * math.sin(u * 3)))
            flock(t, 14, 40, path, 3, 13 * self.s, INK, 3, rgb, al)
            out = out * (1 - al[..., None]) + rgb
        return out


class Leuchtturm(Scene):
    title = 'Leuchtturm – Lichtkegel, Brandung'
    src = 'papier/backgrounds/2-leuchtturm.jpg'
    theme = 'Papier'

    def setup(self):
        H, W = self.H, self.W
        self.lx, self.ly = 0.742 * W, 0.363 * H
        yy, xx = np.mgrid[:H, :W].astype(np.float32)
        self.dx = (xx - self.lx) / W                     # beam geometry, in picture widths
        self.dy = (yy - self.ly) / W
        self.dist = np.hypot(self.dx, self.dy)
        L = lum(self.base)
        # the beam shows on mist, sea and rock more than on bare paper
        self.catch = (0.45 + 0.55 * (1 - smooth(0.55, 0.86, L))).astype(np.float32)
        y0 = int(0.74 * H)
        self.sea = (y0, H)
        sy, sx = np.mgrid[y0:H, :W].astype(np.float32)
        self.sx, self.sy = sx, sy
        self.seamask = (1 - smooth(0.55, 0.68, sx / W))[..., None].astype(np.float32)

    def frame(self, t, variant):
        H, W = self.H, self.W
        out = self.base.copy()
        # surf: slow, small displacement of the sea
        y0, y1 = self.sea
        ph = TAU * t / LOOP
        dx = (np.sin(self.sx / (34 * self.s) + self.sy / (9 * self.s) - ph * 12) * 0.9
              + np.sin(self.sx / (71 * self.s) - self.sy / (23 * self.s) - ph * 7) * 0.6) * self.s
        dy = np.sin(self.sx / (52 * self.s) + ph * 9 + self.sy / (17 * self.s)) * 0.7 * self.s
        warped = sample(self.base, self.sx + dx, self.sy + dy)
        out[y0:y1] = out[y0:y1] * (1 - self.seamask) + warped * self.seamask
        # beam: the lamp turns about the tower's vertical axis, 4 turns a loop.
        # Seen from the side the beam lies flat: it reaches far to one side while
        # it points across the picture, shortens and widens as it swings towards
        # us (the lantern flashes), then reappears on the other side and fades
        # as it turns away behind the tower.
        phi = TAU * 4 * t / LOOP
        across = math.cos(phi)                 # -1: points left (over the sea), +1: right
        toward = math.sin(phi)                 # +1: points at the viewer
        side = -1.0 if across < 0 else 1.0
        reach = 0.04 + 0.62 * abs(across) ** 0.8          # visible length, picture widths
        strength = (0.30 + 0.70 * (0.5 + 0.5 * toward)) * min(1.0, abs(across) * 3 + 0.25)
        along = self.dx * side
        hw = 0.004 + np.clip(along, 0, None) * (0.05 + 0.10 * max(toward, 0.0))
        cone = (np.exp(-(self.dy / hw) ** 2) * smooth(0.0, 0.012, along)
                * np.exp(-np.clip(along, 0, None) / reach))
        flash = max(toward, 0.0) ** 8
        glow = np.exp(-(self.dist / (0.010 + 0.016 * flash)) ** 2) * (0.30 + 0.70 * flash)
        k = (cone * strength * 0.34 * self.catch + glow * 0.45)[..., None]
        out = out + (1 - out) * k * np.array([1.0, 0.98, 0.9], np.float32)
        if variant == 'life':
            rgb = np.zeros_like(out); al = np.zeros(out.shape[:2], np.float32)
            path = lambda u: (W * (-0.06 + 1.14 * u), H * (0.62 - 0.14 * u + 0.02 * math.sin(u * 5)))
            flock(t, 28, 52, path, 1, 15 * self.s, INK, 5, rgb, al)
            out = out * (1 - al[..., None]) + rgb
        return out


class Pinsel(Scene):
    title = 'Pinsel – ein Blatt fällt'
    src = 'papier/backgrounds/3-pinsel.jpg'
    theme = 'Papier · Papier Lavur'

    def setup(self):
        H, W = self.H, self.W
        self.light = periodic_noise(H // 4, W // 4, 60, 21)

    def frame(self, t, variant):
        H, W = self.H, self.W
        # air: a very soft brightening drifting across the paper, like light through leaves
        l = roll_shift(self.light, t / LOOP * (W // 4))
        l = np.asarray(Image.fromarray((l * 255).astype(np.uint8)).resize((W, H), Image.BILINEAR), np.float32) / 255
        k = (smooth(0.55, 0.9, l) * 0.045)[..., None]
        out = self.base + (1 - self.base) * k
        if variant == 'life':
            u = window(t, 8, 32)
            if u is not None:
                rgb = np.zeros_like(out); al = np.zeros(out.shape[:2], np.float32)
                x = W * (0.86 - 0.62 * u) + math.sin(u * TAU * 2.2) * 60 * self.s
                y = H * (-0.06 + 1.12 * ease(u * 0.98))
                ang = math.sin(u * TAU * 1.7) * 0.9 + u * 2.5
                flip = math.cos(u * TAU * 3.1)
                stamp(rgb, al, leaf_sprite(28 * self.s, ang, flip, INK, 0.8), x, y)
                out = out * (1 - al[..., None]) + rgb
        return out


class Nebelwald(Scene):
    title = 'Nebelwald – Staub im Lichtschacht, Bodennebel'
    src = 'tusche/backgrounds/1-nebelwald.jpg'
    theme = 'Tusche · Tusche Lavur'

    def setup(self):
        H, W = self.H, self.W
        L = lum(self.base)
        x = np.linspace(0, 1, W)[None, :]; y = np.linspace(0, 1, H)[:, None]
        band = smooth(0.66, 0.73, x) * (1 - smooth(0.82, 0.88, x)) * (1 - smooth(0.70, 0.86, y))
        self.shaft = (smooth(0.08, 0.45, box_blur(L, int(6 * self.s))) * band).astype(np.float32)
        self.fog = periodic_noise(H, W, 130 * self.s, 31, 30 * self.s)
        self.fogband = (smooth(0.55, 0.72, y) * (1 - smooth(0.9, 1.0, y))).astype(np.float32)
        rng = np.random.default_rng(32)
        n = 90
        self.motes = np.column_stack([rng.uniform(0.66, 0.86, n), rng.uniform(0.0, 0.80, n),
                                      rng.uniform(0.6, 1.6, n), rng.uniform(0, 1, n), rng.integers(1, 3, n)])

    def mote_layer(self, t):
        H, W = self.H, self.W
        glow = np.zeros((H, W), np.float32)
        pts = []
        for x0, y0, r, ph, j in self.motes:
            # rise slowly through the shaft (j shaft-heights a loop), sway a little
            y = (y0 - (t / LOOP) * 0.80 * j) % 0.80
            x = x0 + 0.012 * math.sin(TAU * (t / LOOP * 3 + ph))
            px, py = x * W, y * H
            m = self.shaft[min(H - 1, int(py)), min(W - 1, int(px))]
            tw = 0.55 + 0.45 * math.sin(TAU * (t / LOOP * 7 + ph * 3))
            pts.append((px, py, r * self.s, m * tw * 0.55))
        add_dots(glow, pts)
        return glow

    def frame(self, t, variant):
        H, W = self.H, self.W
        p = t / LOOP
        breath = 1 + 0.06 * math.sin(TAU * 2 * p)
        out = self.base * (1 + (breath - 1) * self.shaft[..., None])
        fog = roll_shift(self.fog, p * W)
        a = (smooth(0.5, 0.85, fog) * self.fogband * 0.16)[..., None]
        out = out + (0.78 - out) * a
        out = out + self.mote_layer(t)[..., None] * (1 - out)
        if variant == 'life':
            u = window(t, 20, 38)
            if u is not None:
                rgb = np.zeros_like(out); al = np.zeros(out.shape[:2], np.float32)
                x = W * (0.82 - 0.16 * u) + math.sin(u * TAU * 1.8) * 30 * self.s
                y = H * (-0.04 + 0.92 * u)
                lit = self.shaft[min(H - 1, max(0, int(y))), min(W - 1, max(0, int(x)))]
                col = np.array([0.10, 0.10, 0.10], np.float32) * (1 - lit) + np.array([0.78, 0.78, 0.76], np.float32) * lit
                ang = math.sin(u * TAU * 1.3) * 1.1 + u * 3
                fade = min(1.0, (1 - u) / 0.12)                # it settles on the forest floor
                stamp(rgb, al, leaf_sprite(15 * self.s, ang, math.cos(u * TAU * 3.4), col, 0.9 * fade), x, y)
                out = out * (1 - al[..., None]) + rgb
        return out


class Treppe(Scene):
    title = 'Treppe – Staub im Sonnenstrahl, eine Wolke zieht vorbei'
    src = 'tusche/backgrounds/2-treppe.jpg'
    theme = 'Tusche'
    has_life = False

    def setup(self):
        H, W = self.H, self.W
        L = lum(self.base)
        self.hi = smooth(0.25, 0.75, box_blur(L, int(4 * self.s)))[..., None].astype(np.float32)
        # beam volume: a band from the window slit down to the lit floor
        yy, xx = np.mgrid[:H, :W].astype(np.float32)
        ax, ay = 0.70 * W, 0.20 * H
        bx, by = 0.36 * W, 0.92 * H
        vx, vy = bx - ax, by - ay
        ln = math.hypot(vx, vy)
        u = ((xx - ax) * vx + (yy - ay) * vy) / (ln * ln)
        dperp = np.abs((xx - ax) * vy - (yy - ay) * vx) / ln
        width = (0.02 + 0.10 * np.clip(u, 0, 1)) * W
        self.beam = (smooth(-0.02, 0.08, u) * (1 - smooth(0.9, 1.02, u)) * (1 - smooth(0.4, 1.0, dperp / width))).astype(np.float32)
        self.axis = (ax, ay, vx, vy)
        rng = np.random.default_rng(41)
        n = 110
        self.motes = np.column_stack([rng.uniform(0, 1, n), rng.uniform(-1, 1, n),
                                      rng.uniform(0.5, 1.4, n), rng.uniform(0, 1, n)])

    def frame(self, t, variant):
        H, W = self.H, self.W
        p = t / LOOP
        # a cloud passes the sun once a loop: the light dims softly and returns
        u = window(t, 34, 46)
        dim = 0.0 if u is None else math.sin(u * math.pi) ** 2 * 0.10
        out = self.base * (1 - dim * self.hi)
        glow = np.zeros((H, W), np.float32)
        ax, ay, vx, vy = self.axis
        ln = math.hypot(vx, vy)
        nx, ny = -vy / ln, vx / ln
        pts = []
        for s0, o, r, ph in self.motes:
            s = (s0 + p * 1.0) % 1.0                       # drift down the beam, one length a loop
            w = (0.02 + 0.10 * s) * W
            off = o * w * 0.8 + math.sin(TAU * (p * 4 + ph)) * 6 * self.s
            x = ax + vx * s + nx * off
            y = ay + vy * s + ny * off
            if not (0 <= x < W and 0 <= y < H):
                continue
            m = self.beam[int(y), int(x)]
            tw = 0.5 + 0.5 * math.sin(TAU * (p * 9 + ph * 5))
            pts.append((x, y, r * self.s, m * tw * 0.45 * (1 - dim * 3)))
        add_dots(glow, pts)
        out = out + glow[..., None] * (1 - out)
        return out


class Monolith(Scene):
    title = 'Monolith – Hitzeflimmern, Wolkenschatten, Vögel'
    src = 'tusche/backgrounds/3-monolith.jpg'
    theme = 'Tusche'

    def setup(self):
        H, W = self.H, self.W
        self.y0, self.y1 = int(0.585 * H), int(0.70 * H)
        bh = self.y1 - self.y0
        self.haze = periodic_noise(bh, W, 9 * self.s, 51)
        sy, sx = np.mgrid[self.y0:self.y1, :W].astype(np.float32)
        self.sx, self.sy = sx, sy
        yb = np.linspace(0, 1, bh)[:, None]
        self.hazemask = (np.sin(yb * math.pi) ** 1.5).astype(np.float32)
        self.cloud = periodic_noise(H // 4, W // 4, 70, 52)
        y = np.linspace(0, 1, H)[:, None]
        self.ground = smooth(0.62, 0.70, y).astype(np.float32)
        self.lit = smooth(0.35, 0.8, lum(self.base))[..., None].astype(np.float32)
        yy, xx = np.mgrid[:H, :W].astype(np.float32)
        self.sun = np.exp(-(np.hypot(xx - 0.967 * W, yy - 0.03 * H) / (0.07 * W)) ** 2)[..., None].astype(np.float32)

    def frame(self, t, variant):
        H, W = self.H, self.W
        p = t / LOOP
        out = self.base.copy()
        # cloud shadows drift over the salt flat, one width a loop
        c = roll_shift(self.cloud, p * (W // 4))
        c = np.asarray(Image.fromarray((c * 255).astype(np.uint8)).resize((W, H), Image.BILINEAR), np.float32) / 255
        shade = (smooth(0.6, 0.85, c) * self.ground * 0.13)[..., None]
        out = out * (1 - shade * self.lit)
        # heat shimmer along the horizon
        bh = self.y1 - self.y0
        n = roll_shift(self.haze, 0, -p * bh * 6)
        dy = (n - 0.5) * 2.4 * self.s * self.hazemask
        dx = (roll_shift(self.haze, p * W * 0, -p * bh * 4 + bh / 2) - 0.5) * 1.2 * self.s * self.hazemask
        out[self.y0:self.y1] = sample(out, self.sx + dx, self.sy + dy)
        # the sun breathes a little
        out = out + (1 - out) * self.sun * (0.04 + 0.04 * math.sin(TAU * 3 * p))
        if variant == 'life':
            rgb = np.zeros_like(out); al = np.zeros(out.shape[:2], np.float32)
            path = lambda u: (W * (1.06 - 1.15 * u), H * (0.24 - 0.06 * u + 0.015 * math.sin(u * 4)))
            flock(t, 22, 46, path, 2, 12 * self.s, np.array([0.12, 0.12, 0.12], np.float32), 7, rgb, al)
            out = out * (1 - al[..., None]) + rgb
        return out


class BergeMond(Scene):
    title = 'Berge im Mondlicht – Schleier und Wolkenschatten'
    src = 'tusche-lavur/backgrounds/1-berge-mond.jpg'
    theme = 'Tusche Lavur'

    def setup(self):
        H, W = self.H, self.W
        self.mist = periodic_noise(H, W, 160 * self.s, 61, 30 * self.s)
        self.cloud = periodic_noise(H // 4, W // 4, 55, 62)
        y = np.linspace(0, 1, H)[:, None]
        self.band = (smooth(0.50, 0.66, y) * (1 - smooth(0.9, 1.0, y))).astype(np.float32)
        self.lit = smooth(0.25, 0.7, lum(self.base))[..., None].astype(np.float32)

    def frame(self, t, variant):
        H, W = self.H, self.W
        p = t / LOOP
        m = roll_shift(self.mist, -p * W)
        a = (smooth(0.6, 0.92, m) * self.band * 0.09)[..., None]
        out = self.base + (0.82 - self.base) * a
        c = roll_shift(self.cloud, p * (W // 4))
        c = np.asarray(Image.fromarray((c * 255).astype(np.uint8)).resize((W, H), Image.BILINEAR), np.float32) / 255
        out = out * (1 - (smooth(0.55, 0.85, c) * 0.22)[..., None] * self.lit)
        if variant == 'life':
            rgb = np.zeros_like(out); al = np.zeros(out.shape[:2], np.float32)
            path = lambda u: (W * (-0.05 + 1.1 * u), H * (0.70 - 0.05 * u + 0.02 * math.sin(u * 3)))
            flock(t, 24, 50, path, 1, 17 * self.s, np.array([0.05, 0.05, 0.05], np.float32), 9, rgb, al)
            out = out * (1 - al[..., None]) + rgb
        return out


SCENES = {'berge': Berge, 'leuchtturm': Leuchtturm, 'pinsel': Pinsel, 'nebelwald': Nebelwald,
          'treppe': Treppe, 'monolith': Monolith, 'berge-mond': BergeMond}


def to8(img):
    return (np.clip(img, 0, 1) * 255 + 0.5).astype(np.uint8)


def parse(argv):
    opts = {'--size': '1280x720', '--fps': '30', '--seconds': str(LOOP), '--start': '0'}
    pos = []
    i = 0
    while i < len(argv):
        if argv[i] in opts:
            opts[argv[i]] = argv[i + 1]; i += 2
        else:
            pos.append(argv[i]); i += 1
    w, h = map(int, opts['--size'].split('x'))
    return pos, (w, h), int(opts['--fps']), float(opts['--seconds']), float(opts['--start'])


def main():
    pos, size, fps, seconds, start = parse(sys.argv[1:])
    cmd = pos[0]
    if cmd == 'list':
        for k, c in SCENES.items():
            print(k, '|', c.title, '|', c.theme, '|', 'air+life' if c.has_life else 'air')
        return
    scene = SCENES[pos[1]](size)
    variant = pos[2]
    if cmd == 'still':
        Image.fromarray(to8(scene.frame(float(pos[3]), variant))).save(pos[4])
    elif cmd == 'loopcheck':
        a = to8(scene.frame(0.0, variant)).astype(int)
        b = to8(scene.frame(LOOP, variant)).astype(int)
        c = to8(scene.frame(LOOP - 1 / 30, variant)).astype(int)
        print(pos[1], variant, 'max |f(0)-f(L)| =', np.abs(a - b).max(),
              ' mean |f(L-1/30)-f(0)| =', round(float(np.abs(a - c).mean()), 3))
    elif cmd == 'clip':
        out = pos[3]
        W, H = size
        # 16-bit frames into 10-bit HEVC: the slow drift (mist, light) is far below one
        # 8-bit step per frame; at 8 bits the encoder held it back and let it jump at
        # key frames. HEVC Main10 keeps it smooth and is decoded in hardware widely.
        # The RGB -> YCbCr step is spelled out (BT.709, limited range) and written into
        # the stream: without it ffmpeg converts with BT.601 and leaves the file untagged,
        # while players assume BT.709 for 1080p, which shifts saturated colours by a few steps.
        # setparams puts primaries and transfer into the stream as well (the -color_* options
        # alone only carry the matrix through libx265).
        ff = subprocess.Popen(['ffmpeg', '-loglevel', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb48le',
                               '-s', f'{W}x{H}', '-r', str(fps), '-i', '-',
                               '-vf', 'scale=in_range=full:out_range=tv:out_color_matrix=bt709:flags=accurate_rnd+full_chroma_int,'
                                      'setparams=colorspace=bt709:color_primaries=bt709:color_trc=bt709:range=tv',
                               '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv',
                               '-c:v', 'libx265', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p10le',
                               # one key frame per loop, at the seam: a key frame refreshes the
                               # coding noise in detailed areas (about one 8-bit step), so it should
                               # happen once a minute, not every few seconds
                               '-x265-params', f'log-level=error:keyint={int(seconds * fps)}:min-keyint={int(seconds * fps)}:open-gop=0:scenecut=0',
                               '-tag:v', 'hvc1', '-movflags', '+faststart', '-an', out], stdin=subprocess.PIPE)
        n = int(round(seconds * fps))
        for i in range(n):
            f = np.clip(scene.frame(start + i / fps, variant), 0, 1)
            ff.stdin.write((f * 65535 + 0.5).astype('<u2').tobytes())
        ff.stdin.close()
        if ff.wait() != 0:
            sys.exit('ffmpeg failed')
        print(out, n, 'frames')


if __name__ == '__main__':
    main()
