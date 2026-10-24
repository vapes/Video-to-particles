"""Generate three 2-second @60fps (120 frames) 512x512 RGBA test animations
that look like typical slot win-animations:

  s1_sparkles  - static symbol, a pulsing glint and sparkles drifting in a band (local change)
  s2_shine     - light sweep across the symbol + pulsing outer glow (medium change)
  s3_bounce    - the whole symbol scales/rotates every frame (full-frame change)

Rendered at 2x and downsampled for clean anti-aliasing; a fixed grain texture
is baked into the art so compression behaves like painted/AI-generated assets.
"""
import math, os, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

W = H = 512
SS = 2                      # supersampling factor
N = 120
OUT = sys.argv[1] if len(sys.argv) > 1 else "frames"
rng = np.random.default_rng(7)


def lerp(a, b, t):
    return a + (b - a) * t


def make_symbol():
    S = W * SS
    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    cx = cy = S / 2
    r = np.hypot(xx - cx, yy - cy) / (S / 2)
    ang = np.arctan2(yy - cy, xx - cx)

    img = np.zeros((S, S, 4), np.float32)

    # golden coin plate with a rim and radial shading
    plate = r < 0.86
    rim = (r >= 0.78) & (r < 0.86)
    shade = 0.55 + 0.45 * np.cos(ang + 2.2) * 0.5 + 0.25 * (1 - r)
    gold = np.stack([255 * shade, 190 * shade, 60 * shade], -1)
    rimc = np.stack([255 * (0.7 + 0.3 * np.sin(ang * 3)), 215 * (0.7 + 0.3 * np.sin(ang * 3)),
                     110 * np.ones_like(r)], -1)
    img[..., :3] = np.where(rim[..., None], rimc, gold)
    img[..., 3] = plate * 255.0

    # engraved rays on the plate
    rays = (np.sin(ang * 24) > 0.6) & (r > 0.45) & (r < 0.76)
    img[..., :3] = np.where(rays[..., None], img[..., :3] * 0.82, img[..., :3])

    im = Image.fromarray(np.clip(img, 0, 255).astype(np.uint8), "RGBA")
    d = ImageDraw.Draw(im)

    # faceted ruby: hexagon split into triangles with different shades
    R = 0.52 * S / 2
    pts = [(cx + R * math.cos(math.radians(60 * i - 90)), cy + R * math.sin(math.radians(60 * i - 90))) for i in range(6)]
    inner = [(cx + 0.45 * R * math.cos(math.radians(60 * i - 90)), cy + 0.45 * R * math.sin(math.radians(60 * i - 90))) for i in range(6)]
    shades = [(235, 40, 70), (200, 20, 50), (150, 10, 35), (120, 5, 30), (175, 15, 45), (250, 70, 100)]
    for i in range(6):
        j = (i + 1) % 6
        d.polygon([pts[i], pts[j], inner[j], inner[i]], fill=shades[i] + (255,))
    d.polygon(inner, fill=(255, 90, 120, 255))
    d.polygon([inner[5], inner[0], inner[1], (cx, cy)], fill=(255, 150, 170, 255))
    for i in range(6):
        d.line([pts[i], pts[(i + 1) % 6]], fill=(90, 0, 20, 255), width=6)
        d.line([pts[i], inner[i]], fill=(255, 170, 190, 200), width=3)

    arr = np.asarray(im).astype(np.float32)
    # fixed grain texture (keeps the art from being unrealistically flat)
    grain = rng.normal(0, 7, (S, S, 1)).astype(np.float32)
    grain = np.asarray(Image.fromarray(np.clip(grain[..., 0] + 128, 0, 255).astype(np.uint8)).filter(
        ImageFilter.GaussianBlur(0.8))).astype(np.float32)[..., None] - 128
    a = arr[..., 3:4] / 255
    arr[..., :3] = np.clip(arr[..., :3] + grain * 1.6 * a, 0, 255)
    return Image.fromarray(arr.astype(np.uint8), "RGBA")


def sparkle(size, intensity=1.0, color=(255, 245, 200)):
    s = size
    yy, xx = np.mgrid[-s:s + 1, -s:s + 1].astype(np.float32) / s
    star = np.exp(-np.abs(xx) * 18) * np.exp(-np.abs(yy) * 2.2) + np.exp(-np.abs(yy) * 18) * np.exp(-np.abs(xx) * 2.2)
    glow = np.exp(-(xx ** 2 + yy ** 2) * 9)
    a = np.clip((star * 0.9 + glow * 0.6) * intensity, 0, 1)
    out = np.zeros(a.shape + (4,), np.float32)
    out[..., 0], out[..., 1], out[..., 2] = color
    out[..., 3] = a * 255
    return Image.fromarray(out.astype(np.uint8), "RGBA")


def paste_center(canvas, sprite, x, y):
    x0 = int(round(x - sprite.width / 2))
    y0 = int(round(y - sprite.height / 2))
    layer = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    layer.paste(sprite, (x0, y0))
    return Image.alpha_composite(canvas, layer)


def down(im):
    return im.resize((W, H), Image.LANCZOS)


def transform_symbol(sym, scale, rot_deg):
    S = sym.width
    big = sym.rotate(rot_deg, resample=Image.BICUBIC, center=(S / 2, S / 2))
    ns = int(S * scale)
    scaled = big.resize((ns, ns), Image.BICUBIC)
    canvas = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    off = (S - ns) // 2
    if off >= 0:
        canvas.paste(scaled, (off, off), scaled)
    else:
        canvas = scaled.crop((-off, -off, -off + S, -off + S))
    return canvas


def main():
    sym = make_symbol()
    S = W * SS
    alpha = sym.split()[3]
    glow_mask = alpha.filter(ImageFilter.GaussianBlur(28 * SS))

    # sparkle trajectories for s1 (confined to an upper-right band)
    sp = [dict(x=rng.uniform(0.58, 0.92) * S, y0=rng.uniform(0.15, 0.55) * S, sz=int(rng.uniform(10, 22) * SS),
               ph=rng.uniform(0, 1), sp=rng.uniform(0.15, 0.3) * S) for _ in range(12)]

    for name in ["s1_sparkles", "s2_shine", "s3_bounce"]:
        os.makedirs(os.path.join(OUT, name), exist_ok=True)

    yy, xx = np.mgrid[0:S, 0:S].astype(np.float32)
    sym_arr = np.asarray(sym).astype(np.float32)

    for f in range(N):
        t = f / N  # 0..1 loop phase

        # ---- s1: local sparkles + glint
        c = sym.copy()
        gl = 0.5 + 0.5 * math.sin(t * 2 * math.pi * 2)
        c = paste_center(c, sparkle(int(40 * SS), 0.4 + 0.8 * gl), 0.63 * S, 0.33 * S)
        for p in sp:
            ph = (t + p["ph"]) % 1
            y = p["y0"] - ph * p["sp"]
            inten = math.sin(ph * math.pi)
            c = paste_center(c, sparkle(p["sz"], inten), p["x"] + 8 * SS * math.sin(ph * 6.28), y)
        down(c).save(os.path.join(OUT, "s1_sparkles", f"{f:04d}.png"))

        # ---- s2: shine sweep (first second) + pulsing glow ring (whole loop)
        pulse = 0.5 + 0.5 * math.sin(t * 2 * math.pi)
        glow = Image.new("RGBA", (S, S), (255, 200, 80, 0))
        glow.putalpha(glow_mask.point(lambda v, k=pulse: int(min(255, v * (0.6 + 0.9 * k)))))
        base = Image.alpha_composite(glow, sym)
        arr = np.asarray(base).astype(np.float32)
        sweep_t = t * 2.0  # band crosses during the first half of the loop
        if sweep_t <= 1.2:
            pos = lerp(-0.4, 1.4, sweep_t / 1.2) * S * 1.4
            band = np.exp(-(((xx + yy) * 0.7 - pos) / (40 * SS)) ** 2)
            a = sym_arr[..., 3:4] / 255
            arr[..., :3] = np.clip(arr[..., :3] + band[..., None] * 170 * a, 0, 255)
        down(Image.fromarray(arr.astype(np.uint8), "RGBA")).save(os.path.join(OUT, "s2_shine", f"{f:04d}.png"))

        # ---- s3: full bounce/wobble every frame
        sc = 0.88 + 0.1 * math.sin(t * 2 * math.pi * 2) ** 2
        rot = 6 * math.sin(t * 2 * math.pi)
        down(transform_symbol(sym, sc, rot)).save(os.path.join(OUT, "s3_bounce", f"{f:04d}.png"))
        if f % 20 == 0:
            print("frame", f, flush=True)


if __name__ == "__main__":
    main()
