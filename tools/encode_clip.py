"""Run the sequence / tile-delta / video experiment on a real clip.

usage: python3 encode_clip.py <frames_dir> <pts.txt> <src.mp4> <out_dir>

The clip is 24 fps; the game ticks at 60 Hz. Each 60 Hz tick shows the last
source frame whose timestamp is <= tick time, so only unique frames are stored.
"""
import gzip, hashlib, io, json, math, os, subprocess, sys, tempfile, time
import numpy as np
from PIL import Image

FR, PTS, SRC, OUT = sys.argv[1:5]
Q, SPEED, PAD, ATLAS_MAX = 70, 6, 2, 2048
os.makedirs(OUT, exist_ok=True)

pts = [float(x) for x in open(PTS).read().split()]
files = sorted(os.listdir(FR))
frames = [np.asarray(Image.open(os.path.join(FR, f)).convert("RGBA")) for f in files]
N = len(frames)
H, W = frames[0].shape[:2]
frame_dur = pts[-1] - pts[-2]
duration = pts[-1] + frame_dur
TICKS = int(round(duration * 60))
tick_map = []
for k in range(TICKS):
    t = k / 60
    i = max(j for j in range(N) if pts[j] <= t + 1e-6)
    tick_map.append(i)
print(f"{W}x{H}, {N} unique frames, {duration:.3f}s -> {TICKS} ticks @60Hz", flush=True)


def avif(img):
    b = io.BytesIO(); img.save(b, format="AVIF", quality=Q, speed=SPEED); return b.getvalue()


def dec(b):
    return np.asarray(Image.open(io.BytesIO(b)).convert("RGBA"))


def over_gray(x):
    x = x.astype(np.float32)
    a = x[..., 3:4] / 255 if x.shape[-1] == 4 else 1.0
    return x[..., :3] * a + 128 * (1 - a)


def psnr(a, b):
    mse = np.mean((over_gray(a) - over_gray(b)) ** 2)
    return 99.0 if mse == 0 else 10 * np.log10(255 ** 2 / mse)


R = dict(w=W, h=H, unique=N, ticks=TICKS, duration=duration)

# ---------------------------------------------------------------- sequence
t0 = time.time()
os.makedirs(os.path.join(OUT, "seq"), exist_ok=True)
sizes, ps, png = [], [], 0
for i, f in enumerate(frames):
    b = avif(Image.fromarray(f, "RGBA"))
    open(os.path.join(OUT, "seq", f"f{i:03d}.avif"), "wb").write(b)
    sizes.append(len(b)); ps.append(psnr(f, dec(b)))
    p = io.BytesIO(); Image.fromarray(f[..., :3]).save(p, format="PNG"); png += len(p.getvalue())
json.dump(dict(w=W, h=H, cols=1, perSheet=1, frames=N, ticks=tick_map,
               sheets=[dict(file=f"f{i:03d}.avif", w=W, h=H, frames=1) for i in range(N)]),
          open(os.path.join(OUT, "seq", "seq.json"), "w"))
R["seq"] = dict(bytes=sum(sizes), naive60_bytes=sum(sizes[i] for i in tick_map), png=png,
                psnr=float(np.mean(ps)), psnr_min=float(np.min(ps)),
                vram=N * W * H * 4, naive60_vram=TICKS * W * H * 4)
print("seq", {k: v for k, v in R["seq"].items()}, f"{time.time() - t0:.0f}s", flush=True)


# ---------------------------------------------------------------- tile delta
def tile_delta(T, max_thr, mean_thr, write=False):
    tx, ty = math.ceil(W / T), math.ceil(H / T)
    pw, ph = tx * T, ty * T
    padded = [np.pad(f, ((0, ph - H), (0, pw - W), (0, 0)), mode="edge") for f in frames]
    cell = T + 2 * PAD
    per_row = ATLAS_MAX // cell
    per_atlas = per_row * (ATLAS_MAX // cell)
    canvas = padded[0].copy()
    uniq, tiles, ops_frames, changed = {}, [], [[]], []
    for i in range(1, N):
        f = padded[i].astype(np.int16)
        d = np.abs(f - canvas.astype(np.int16))
        dt = d.reshape(ty, T, tx, T, 4)
        tmax = dt.max(axis=(1, 3, 4))
        tmean = dt.mean(axis=(1, 3, 4))
        ch = (tmax > max_thr) | (tmean > mean_thr)
        ops = []
        for y, x in zip(*np.nonzero(ch)):
            src = padded[i][y * T:(y + 1) * T, x * T:(x + 1) * T]
            key = hashlib.blake2b(src.tobytes(), digest_size=12).digest()
            if key not in uniq:
                uniq[key] = len(tiles)
                tiles.append(np.pad(src, ((PAD, PAD), (PAD, PAD), (0, 0)), mode="edge"))
            g = uniq[key]
            ops += [g // per_atlas, g % per_atlas, int(y * tx + x)]
            canvas[y * T:(y + 1) * T, x * T:(x + 1) * T] = src
        ops_frames.append(ops)
        changed.append(int(ch.sum()))

    atlases, abytes, decoded = [], 0, []
    for a0 in range(0, len(tiles), per_atlas):
        chunk = tiles[a0:a0 + per_atlas]
        rows = (len(chunk) + per_row - 1) // per_row
        cols = min(per_row, len(chunk))
        img = np.zeros((rows * cell, cols * cell, 4), np.uint8)
        for k, t in enumerate(chunk):
            r, c = divmod(k, per_row)
            img[r * cell:(r + 1) * cell, c * cell:(c + 1) * cell] = t
        b = avif(Image.fromarray(img, "RGBA"))
        fn = f"atlas_{len(atlases)}.avif"
        if write:
            open(os.path.join(OUT, "delta", fn), "wb").write(b)
        atlases.append(dict(file=fn, w=img.shape[1], h=img.shape[0], cols=per_row))
        abytes += len(b); decoded.append(dec(b))
    keyb = avif(Image.fromarray(padded[0], "RGBA"))
    meta = dict(w=pw, h=ph, viewW=W, viewH=H, tile=T, pad=PAD, cell=cell, perRow=per_row, perAtlas=per_atlas,
                frames=N, ticks=tick_map, key="key.avif", atlases=atlases, ops=ops_frames)
    js = json.dumps(meta, separators=(",", ":")).encode()
    if write:
        open(os.path.join(OUT, "delta", "key.avif"), "wb").write(keyb)
        open(os.path.join(OUT, "delta", "delta.json"), "wb").write(js)
    # quality of what the player really shows
    screen = dec(keyb).copy()
    ps = [psnr(padded[0][:H, :W], screen[:H, :W])]
    for i in range(1, N):
        o = ops_frames[i]
        for k in range(0, len(o), 3):
            a, c, dst = o[k:k + 3]
            r, cc = divmod(c, per_row)
            dy, dx = divmod(dst, tx)
            screen[dy * T:(dy + 1) * T, dx * T:(dx + 1) * T] = \
                decoded[a][r * cell + PAD:r * cell + PAD + T, cc * cell + PAD:cc * cell + PAD + T]
        ps.append(psnr(frames[i], screen[:H, :W]))
    gz = len(gzip.compress(js, 9))
    return dict(tile=T, max_thr=max_thr, mean_thr=mean_thr, total=len(keyb) + abytes + gz, key=len(keyb),
                atlases=abytes, n_atlases=len(atlases), json_gz=gz, unique_tiles=len(tiles),
                changed_pct=100 * sum(changed) / ((N - 1) * tx * ty), ops_max=max(changed),
                psnr=float(np.mean(ps)), psnr_min=float(np.min(ps)),
                vram=pw * ph * 4 * 2 + sum(a["w"] * a["h"] * 4 for a in atlases))


os.makedirs(os.path.join(OUT, "delta"), exist_ok=True)
R["delta_variants"] = []
for T in [int(t) for t in os.environ.get("TILES", "16,32,64").split(",")]:
    for (mx, mn, label) in ((2, 255, "strict"), (16, 2.0, "lenient")):
        t0 = time.time()
        d = tile_delta(T, mx, mn)
        d["label"] = label
        R["delta_variants"].append(d)
        print("delta", {k: (round(v, 2) if isinstance(v, float) else v) for k, v in d.items()}, f"{time.time() - t0:.0f}s", flush=True)

# ---------------------------------------------------------------- video
tmp = tempfile.mkdtemp()
R["video_src_noaudio"] = None
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", SRC, "-an", "-c:v", "copy", f"{tmp}/noaudio.mp4"], check=True)
R["video_src_noaudio"] = os.path.getsize(f"{tmp}/noaudio.mp4")
R["video"] = []
HAS_ALPHA = any(f[..., 3].min() < 255 for f in frames)
vin = FR
if HAS_ALPHA:   # stacked alpha: premultiplied colour on top, alpha as gray below
    vin = f"{tmp}/stacked"; os.makedirs(vin)
    for i, f in enumerate(frames):
        a = f[..., 3:4].astype(np.float32) / 255
        top = (f[..., :3].astype(np.float32) * a).round().astype(np.uint8)
        Image.fromarray(np.vstack([top, np.repeat(f[..., 3:4], 3, axis=2)]), "RGB").save(f"{vin}/{i + 1:04d}.png")
R["video_alpha"] = HAS_ALPHA
for crf in [int(c) for c in os.environ.get("CRFS", "16,20,24").split(",")]:
    out = f"{tmp}/v{crf}.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", "24", "-i", f"{vin}/%04d.png", "-c:v", "libx264",
                    "-preset", "slow", "-crf", str(crf), "-pix_fmt", "yuv420p", "-profile:v", "high",
                    "-movflags", "+faststart", "-an", out], check=True)
    d2 = tempfile.mkdtemp()
    subprocess.run(["ffmpeg", "-v", "error", "-i", out, f"{d2}/%04d.png"], check=True)
    ps = []
    for i in range(N):
        v = np.asarray(Image.open(f"{d2}/{i + 1:04d}.png").convert("RGB")).astype(np.float32)
        if HAS_ALPHA:
            top, al = v[:H], v[H:, :, 0:1] / 255
            shown = top + 128 * (1 - al)
            mse = np.mean((over_gray(frames[i]) - shown) ** 2)
            ps.append(99.0 if mse == 0 else 10 * np.log10(255 ** 2 / mse))
        else:
            ps.append(psnr(frames[i], v))
    R["video"].append(dict(crf=crf, bytes=os.path.getsize(out), psnr=float(np.mean(ps)), psnr_min=float(np.min(ps)), path=out))
    print("video", R["video"][-1], flush=True)

json.dump(R, open(os.path.join(OUT, "results.json"), "w"), indent=1)
