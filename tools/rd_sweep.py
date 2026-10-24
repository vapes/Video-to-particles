"""Rate-distortion sweep on a 20-frame sample of the black version.
A technique only counts as a win if it beats plain AVIF at the same PSNR.
PSNR is always measured against the original full-res frames (after GPU-style bilinear upscale where needed).
"""
import glob, io, json, os, sys
import cv2
import numpy as np
from PIL import Image

FR = sys.argv[1]
files = sorted(glob.glob(os.path.join(FR, "*.png")))
N = len(files)
idx = list(range(0, N, 6))
src = [np.asarray(Image.open(files[i]).convert("RGB")) for i in idx]
H, W = src[0].shape[:2]
M = 1048576
scale_full = N / len(idx)


def psnr(a, b):
    mse = np.mean((a.astype(np.float32) - b.astype(np.float32)) ** 2)
    return 10 * np.log10(255 ** 2 / mse)


def enc(arr, q, speed=6):
    b = io.BytesIO(); Image.fromarray(arr, "RGB").save(b, format="AVIF", quality=q, speed=speed); bb = b.getvalue()
    return len(bb), np.asarray(Image.open(io.BytesIO(bb)).convert("RGB"))


def run(name, prep, post, qs, speed=6):
    out = []
    for q in qs:
        tot, ps = 0, []
        for f in src:
            p = prep(f)
            n, d = enc(p, q, speed)
            tot += n
            ps.append(psnr(f, post(d)))
        r = dict(name=name, q=q, speed=speed, mb=round(tot * scale_full / M, 3), psnr=round(float(np.mean(ps)), 2))
        print(json.dumps(r, ensure_ascii=False), flush=True)
        out.append(r)
    return out


ident = lambda x: x
def down(s):
    return lambda f: cv2.resize(f, (round(W * s), round(H * s)), interpolation=cv2.INTER_AREA)
def up(d):
    return cv2.resize(d, (W, H), interpolation=cv2.INTER_LINEAR)
def denoise(h):
    return lambda f: cv2.fastNlMeansDenoisingColored(f, None, h, h, 5, 15)

res = []
res += run("plain", ident, ident, [40, 50, 60, 70, 80, 88])
res += run("plain-slow", ident, ident, [60, 70, 80], speed=2)
res += run("scale0.75", down(0.75), up, [60, 70, 80, 88])
res += run("scale0.5", down(0.5), up, [70, 80, 88, 95])
res += run("denoise3", denoise(3), ident, [60, 70, 80])
json.dump(res, open(sys.argv[2], "w"), indent=1)
