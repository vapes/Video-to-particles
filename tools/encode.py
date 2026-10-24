"""Encode each test animation three ways and measure size + quality.

  1. Baseline: plain AVIF frame sequence (per-frame files and 2048x2048 spritesheets)
  2. Tile-delta: keyframe AVIF + atlases of changed tiles (AVIF) + ops table
  3. Video: stacked-alpha H.264 MP4 (+ VP9 WebM fallback), for reference

Quality is checked by reconstructing exactly what the player shows and
computing PSNR against the source frames (composited over a gray background).

usage: python3 encode.py <frames_dir> <out_dir> [quality]
"""
import gzip, hashlib, io, json, os, subprocess, sys, tempfile
import numpy as np
from PIL import Image

FR = sys.argv[1]
OUT = sys.argv[2]
Q = int(sys.argv[3]) if len(sys.argv) > 3 else 70
SPEED = 6
N = 120
ATLAS_MAX = 2048
THRESH = 2          # max abs channel difference that still counts as "unchanged"
PAD = 2             # extruded padding around each tile in the atlas (lossy-codec bleed guard)


def avif_bytes(img):
    b = io.BytesIO()
    img.save(b, format="AVIF", quality=Q, speed=SPEED)
    return b.getvalue()


def decode(b):
    return np.asarray(Image.open(io.BytesIO(b)).convert("RGBA"))


def over_gray(rgba):
    a = rgba[..., 3:4].astype(np.float32) / 255
    return rgba[..., :3].astype(np.float32) * a + 128 * (1 - a)


def psnr(a, b):
    mse = np.mean((over_gray(a) - over_gray(b)) ** 2)
    return 99.0 if mse == 0 else 10 * np.log10(255 ** 2 / mse)


def load_frames(name):
    d = os.path.join(FR, name)
    return [np.asarray(Image.open(os.path.join(d, f"{i:04d}.png")).convert("RGBA")) for i in range(N)]


# ---------------------------------------------------------------- baseline
def baseline(name, frames, out):
    os.makedirs(out, exist_ok=True)
    h, w = frames[0].shape[:2]
    per_frame, png, webp, ps = 0, 0, 0, []
    for i, f in enumerate(frames):
        im = Image.fromarray(f, "RGBA")
        b = avif_bytes(im)
        per_frame += len(b)
        ps.append(psnr(f, decode(b)))
        p = io.BytesIO(); im.save(p, format="PNG", optimize=True); png += len(p.getvalue())
        q = io.BytesIO(); im.save(q, format="WEBP", quality=80, method=4); webp += len(q.getvalue())

    # spritesheets: what a Pixi game would actually ship
    cols = ATLAS_MAX // w
    per_sheet = cols * (ATLAS_MAX // h)
    sheets, sheet_bytes = [], 0
    for s in range(0, N, per_sheet):
        chunk = frames[s:s + per_sheet]
        rows = (len(chunk) + cols - 1) // cols
        sheet = np.zeros((rows * h, cols * w, 4), np.uint8)
        for k, f in enumerate(chunk):
            r, c = divmod(k, cols)
            sheet[r * h:(r + 1) * h, c * w:(c + 1) * w] = f
        b = avif_bytes(Image.fromarray(sheet, "RGBA"))
        fn = f"sheet_{len(sheets)}.avif"
        open(os.path.join(out, fn), "wb").write(b)
        sheets.append(dict(file=fn, w=cols * w, h=rows * h, frames=len(chunk)))
        sheet_bytes += len(b)
    meta = dict(w=w, h=h, cols=cols, perSheet=per_sheet, frames=N, sheets=sheets)
    json.dump(meta, open(os.path.join(out, "seq.json"), "w"))
    vram = sum(s["w"] * s["h"] * 4 for s in sheets)
    return dict(per_frame_avif=per_frame, sheets_avif=sheet_bytes, png=png, webp=webp,
                psnr_mean=float(np.mean(ps)), psnr_min=float(np.min(ps)), vram=vram, files=len(sheets) + 1)


# ---------------------------------------------------------------- tile delta
def tile_delta(name, frames, out, T, write=True):
    h, w = frames[0].shape[:2]
    tx, ty = w // T, h // T
    cell = T + 2 * PAD
    per_row = ATLAS_MAX // cell
    per_atlas = per_row * (ATLAS_MAX // cell)

    canvas = frames[0].copy()           # what the player has on screen (source-space model)
    uniq, tiles = {}, []                # hash -> global cell index ; list of padded tiles
    ops_frames = [[]]                   # frame 0 = keyframe
    changed_counts = []
    for i in range(1, N):
        f = frames[i]
        ops = []
        for y in range(ty):
            for x in range(tx):
                ys, xs = slice(y * T, (y + 1) * T), slice(x * T, (x + 1) * T)
                src = f[ys, xs]
                if np.max(np.abs(src.astype(np.int16) - canvas[ys, xs].astype(np.int16))) <= THRESH:
                    continue
                key = hashlib.blake2b(src.tobytes(), digest_size=12).digest()
                if key not in uniq:
                    uniq[key] = len(tiles)
                    tiles.append(np.pad(src, ((PAD, PAD), (PAD, PAD), (0, 0)), mode="edge"))
                g = uniq[key]
                ops += [g // per_atlas, g % per_atlas, y * tx + x]
                canvas[ys, xs] = src
        ops_frames.append(ops)
        changed_counts.append(len(ops) // 3)

    # pack atlases
    atlases, atlas_bytes, decoded = [], 0, []
    for a0 in range(0, len(tiles), per_atlas):
        chunk = tiles[a0:a0 + per_atlas]
        rows = (len(chunk) + per_row - 1) // per_row
        cols = min(per_row, len(chunk))
        img = np.zeros((rows * cell, cols * cell, 4), np.uint8)
        for k, t in enumerate(chunk):
            r, c = divmod(k, per_row)
            img[r * cell:(r + 1) * cell, c * cell:(c + 1) * cell] = t
        b = avif_bytes(Image.fromarray(img, "RGBA"))
        fn = f"atlas_{len(atlases)}.avif"
        if write:
            open(os.path.join(out, fn), "wb").write(b)
        atlases.append(dict(file=fn, w=img.shape[1], h=img.shape[0], cols=per_row))
        atlas_bytes += len(b)
        decoded.append(decode(b))

    keyb = avif_bytes(Image.fromarray(frames[0], "RGBA"))
    key_dec = decode(keyb)
    meta = dict(w=w, h=h, tile=T, pad=PAD, cell=cell, perRow=per_row, perAtlas=per_atlas,
                frames=N, key="key.avif", atlases=atlases, ops=ops_frames)
    js = json.dumps(meta, separators=(",", ":")).encode()
    if write:
        os.makedirs(out, exist_ok=True)
        open(os.path.join(out, "key.avif"), "wb").write(keyb)
        open(os.path.join(out, "delta.json"), "wb").write(js)

    # simulate the player on the *decoded* atlases to measure real quality
    screen = key_dec.copy()
    ps = [psnr(frames[0], screen)]
    for i in range(1, N):
        o = ops_frames[i]
        for k in range(0, len(o), 3):
            a, c, dst = o[k:k + 3]
            r, cc = divmod(c, per_row)
            dy, dx = divmod(dst, tx)
            screen[dy * T:(dy + 1) * T, dx * T:(dx + 1) * T] = \
                decoded[a][r * cell + PAD:r * cell + PAD + T, cc * cell + PAD:cc * cell + PAD + T]
        ps.append(psnr(frames[i], screen))

    total_ops = sum(changed_counts)
    vram = w * h * 4 * 2 + sum(a["w"] * a["h"] * 4 for a in atlases)   # key + render texture + atlases
    return dict(tile=T, key=len(keyb), atlases=atlas_bytes, n_atlases=len(atlases), unique_tiles=len(tiles),
                json=len(js), json_gz=len(gzip.compress(js, 9)),
                total=len(keyb) + atlas_bytes + len(gzip.compress(js, 9)),
                changed_pct_mean=100 * total_ops / ((N - 1) * tx * ty),
                ops_max=max(changed_counts), psnr_mean=float(np.mean(ps)), psnr_min=float(np.min(ps)),
                vram=vram, files=len(atlases) + 2)


# ---------------------------------------------------------------- video
def video(name, frames, out, crf264=20, crf_vp9=32):
    h, w = frames[0].shape[:2]
    tmp = tempfile.mkdtemp()
    for i, f in enumerate(frames):
        a = f[..., 3:4].astype(np.float32) / 255
        top = (f[..., :3].astype(np.float32) * a).astype(np.uint8)          # premultiplied colour
        bot = np.repeat(f[..., 3:4], 3, axis=2)                             # alpha as gray
        Image.fromarray(np.vstack([top, bot]), "RGB").save(os.path.join(tmp, f"{i:04d}.png"))
    mp4 = os.path.join(out, "video.mp4")
    webm = os.path.join(out, "video.webm")
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", "60", "-i", f"{tmp}/%04d.png",
                    "-c:v", "libx264", "-preset", "slow", "-crf", str(crf264), "-pix_fmt", "yuv420p",
                    "-profile:v", "high", "-movflags", "+faststart", "-an", mp4], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-framerate", "60", "-i", f"{tmp}/%04d.png",
                    "-c:v", "libvpx-vp9", "-crf", str(crf_vp9), "-b:v", "0", "-row-mt", "1",
                    "-pix_fmt", "yuv420p", "-an", webm], check=True)

    def video_psnr(path):
        dec = tempfile.mkdtemp()
        subprocess.run(["ffmpeg", "-loglevel", "error", "-i", path, f"{dec}/%04d.png"], check=True)
        ps = []
        for i in range(N):
            v = np.asarray(Image.open(f"{dec}/{i + 1:04d}.png").convert("RGB")).astype(np.float32)
            rgb_p, a = v[:h], v[h:, :, 0:1] / 255
            shown = rgb_p + 128 * (1 - a)                                   # premultiplied over gray
            mse = np.mean((over_gray(frames[i]) - shown) ** 2)
            ps.append(99.0 if mse == 0 else 10 * np.log10(255 ** 2 / mse))
        return float(np.mean(ps)), float(np.min(ps))

    p264 = video_psnr(mp4)
    pvp9 = video_psnr(webm)
    return dict(mp4=os.path.getsize(mp4), webm=os.path.getsize(webm),
                psnr_mp4_mean=p264[0], psnr_mp4_min=p264[1], psnr_webm_mean=pvp9[0], psnr_webm_min=pvp9[1],
                vram=w * h * 2 * 4)


def main():
    results = {}
    names = sys.argv[4].split(",") if len(sys.argv) > 4 else ["s1_sparkles", "s2_shine", "s3_bounce"]
    for name in names:
        frames = load_frames(name)
        o = os.path.join(OUT, name)
        os.makedirs(os.path.join(o, "seq"), exist_ok=True)
        os.makedirs(os.path.join(o, "delta"), exist_ok=True)
        r = dict(baseline=baseline(name, frames, os.path.join(o, "seq")))
        print(name, "baseline", r["baseline"], flush=True)
        r["delta_by_tile"] = {}
        for T in (16, 32, 64):
            d = tile_delta(name, frames, os.path.join(o, "delta"), T, write=False)
            r["delta_by_tile"][T] = d
            print(name, "delta", T, d, flush=True)
        best = min(r["delta_by_tile"].values(), key=lambda d: d["total"])["tile"]
        r["delta"] = tile_delta(name, frames, os.path.join(o, "delta"), 32, write=True)
        r["best_tile"] = best
        r["video"] = video(name, frames, o)
        print(name, "video", r["video"], flush=True)
        results[name] = r
    json.dump(results, open(os.path.join(OUT, "results.json"), "w"), indent=1)


if __name__ == "__main__":
    main()
