"""Motion-compensated residual sequence ("MC-AVIF") for Pixi.

Decoder (GPU, per frame):  cur = clamp(prev[x + mv(block)] + residual(x) - 128)
  * frame 0 is a normal AVIF keyframe
  * every later frame = previous reconstructed frame shifted per 16x16 block by an
    integer motion vector (or a flat 128 'intra' predictor), plus a residual AVIF
  * vectors for all frames live in one small lossless PNG

Encoder is closed-loop: it predicts from the frame the decoder will actually have
(decoded AVIF residuals included), so there is no drift. Integer vectors and
8-bit residuals keep the shader bit-exact with this reference.

usage: python3 mc_encode.py <frames_dir> <out_dir> <key_q> <res_q> [speed] [--write]
"""
import glob, io, json, os, sys, time
import cv2
import numpy as np
from PIL import Image

FR, OUT = sys.argv[1], sys.argv[2]
QK, QR = int(sys.argv[3]), int(sys.argv[4])
SPEED = int(sys.argv[5]) if len(sys.argv) > 5 and sys.argv[5].isdigit() else 6
WRITE = "--write" in sys.argv
B = 16
SEARCH = 64
PER_ROW = 8          # frames per row in the vector atlas

files = sorted(glob.glob(os.path.join(FR, "*.png")))
src = [np.asarray(Image.open(f).convert("RGB")) for f in files]
N = len(src)
H0, W0 = src[0].shape[:2]
W, H = -(-W0 // B) * B, -(-H0 // B) * B
frames = [np.pad(f, ((0, H - H0), (0, W - W0), (0, 0)), mode="edge") for f in src]
bx, by = W // B, H // B


def avif(arr, q):
    b = io.BytesIO(); Image.fromarray(arr, "RGB").save(b, format="AVIF", quality=q, speed=SPEED); return b.getvalue()


def dec(b):
    return np.asarray(Image.open(io.BytesIO(b)).convert("RGB"))


def psnr(a, b):
    mse = np.mean((a.astype(np.float32) - b.astype(np.float32)) ** 2)
    return 99.0 if mse == 0 else 10 * np.log10(255 ** 2 / mse)


yy, xx = np.mgrid[0:H, 0:W]
blk_y, blk_x = yy // B, xx // B


def predict(prev, vec):
    """vec: (by, bx, 2) integer (dx, dy) -> per-pixel gather from prev with edge clamp."""
    dx = vec[..., 0][blk_y, blk_x]
    dy = vec[..., 1][blk_y, blk_x]
    sy = np.clip(yy + dy, 0, H - 1)
    sx = np.clip(xx + dx, 0, W - 1)
    return prev[sy, sx]


def block_cost(cur, pred):
    d = cur.astype(np.int16) - pred.astype(np.int16)
    dc = np.clip(d, -128, 127)
    c = np.abs(dc).astype(np.int32) + 4 * np.abs(d - dc).astype(np.int32)
    return c.sum(axis=2).reshape(by, B, bx, B).sum(axis=(1, 3))


dis = cv2.DISOpticalFlow_create(cv2.DISOPTICAL_FLOW_PRESET_MEDIUM)
t0 = time.time()
keyb = avif(frames[0], QK)
recon = dec(keyb)
sizes = dict(key=len(keyb), res=0, mv=0)
ps = [psnr(src[0], recon[:H0, :W0])]
mv_all = np.zeros((N - 1, by, bx, 3), np.uint8)
stats = dict(intra=0, zero=0, moved=0)
res_files = []

for i in range(1, N):
    cur = frames[i]
    g_cur = cv2.cvtColor(cur, cv2.COLOR_RGB2GRAY)
    g_prev = cv2.cvtColor(recon, cv2.COLOR_RGB2GRAY)
    flow = dis.calc(g_cur, g_prev, None)                       # cur(x) ~ prev(x + flow)
    med = np.median(flow.reshape(by, B, bx, B, 2), axis=(1, 3))
    med = np.clip(np.round(med), -SEARCH, SEARCH).astype(np.int32)

    cands = [np.zeros_like(med), med]
    for ox, oy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        cands.append(med + np.array([ox, oy]))
    left = np.roll(med, 1, axis=1); left[:, 0] = med[:, 0]
    top = np.roll(med, 1, axis=0); top[0] = med[0]
    cands += [left, top]
    costs = [block_cost(cur, predict(recon, c)) for c in cands]
    costs[0] = (costs[0] * 0.98).astype(costs[0].dtype)        # tiny bias to zero vector (cheaper to code)
    intra_cost = block_cost(cur, np.full_like(cur, 128))
    allc = np.stack(costs + [intra_cost])
    choice = allc.argmin(axis=0)

    vec = np.zeros_like(med)
    for k, c in enumerate(cands):
        vec[choice == k] = c[choice == k]
    intra = choice == len(cands)
    vec[intra] = 0
    pred = predict(recon, vec)
    pred[np.repeat(np.repeat(intra, B, 0), B, 1)] = 128

    d = cur.astype(np.int16) - pred.astype(np.int16)
    e = np.clip(d + 128, 0, 255).astype(np.uint8)
    rb = avif(e, QR)
    ed = dec(rb).astype(np.int16)
    recon = np.clip(pred.astype(np.int16) + ed - 128, 0, 255).astype(np.uint8)

    sizes["res"] += len(rb)
    ps.append(psnr(src[i], recon[:H0, :W0]))
    mv_all[i - 1, ..., 0] = (vec[..., 0] + 128).astype(np.uint8)
    mv_all[i - 1, ..., 1] = (vec[..., 1] + 128).astype(np.uint8)
    mv_all[i - 1, ..., 2] = intra.astype(np.uint8) * 255
    stats["intra"] += int(intra.sum())
    stats["zero"] += int(((vec == 0).all(-1) & ~intra).sum())
    stats["moved"] += int(((vec != 0).any(-1) & ~intra).sum())
    if WRITE:
        os.makedirs(os.path.join(OUT, "mc"), exist_ok=True)
        fn = f"r{i:03d}.avif"
        open(os.path.join(OUT, "mc", fn), "wb").write(rb)
        res_files.append(fn)
        np.save(os.path.join(OUT, f"recon_{i:03d}.npy"), recon) if i in (1, 37, 118) else None

# vector atlas: PER_ROW frames per row, each frame a bx x by block of RGB texels
rows = -(-(N - 1) // PER_ROW)
atlas = np.zeros((rows * by, PER_ROW * bx, 3), np.uint8)
atlas[..., :2] = 128
for k in range(N - 1):
    r, c = divmod(k, PER_ROW)
    atlas[r * by:(r + 1) * by, c * bx:(c + 1) * bx] = mv_all[k]
pb = io.BytesIO(); Image.fromarray(atlas, "RGB").save(pb, format="PNG", optimize=True)
sizes["mv"] = len(pb.getvalue())

total = sum(sizes.values())
nb = (N - 1) * bx * by
print(json.dumps(dict(key_q=QK, res_q=QR, speed=SPEED, total=total, total_mb=round(total / 1048576, 3), **sizes,
                      psnr=round(float(np.mean(ps)), 2), psnr_min=round(float(np.min(ps)), 2),
                      intra_pct=round(100 * stats["intra"] / nb, 1), zero_pct=round(100 * stats["zero"] / nb, 1),
                      moved_pct=round(100 * stats["moved"] / nb, 1), secs=round(time.time() - t0))), flush=True)

if WRITE:
    os.makedirs(os.path.join(OUT, "mc"), exist_ok=True)
    open(os.path.join(OUT, "mc", "key.avif"), "wb").write(keyb)
    open(os.path.join(OUT, "mc", "mv.png"), "wb").write(pb.getvalue())
    json.dump(dict(w=W, h=H, viewW=W0, viewH=H0, block=B, bx=bx, by=by, perRow=PER_ROW, frames=N,
                   key="key.avif", mv="mv.png", residuals=res_files), open(os.path.join(OUT, "mc", "mc.json"), "w"))
    np.save(os.path.join(OUT, "recon_last.npy"), recon)
