"""How far can the black version go? (reference: AVIF q70 speed 6 sequence = 3.93 MB @ 40.4 dB)
1) AVIF with slower encoder (speed 2) on a sample of frames
2) AV1 video (SVT-AV1) with inter prediction at several CRFs -> size vs PSNR curve
"""
import glob, io, os, subprocess, sys, tempfile, time
import numpy as np
from PIL import Image

FR = sys.argv[1]
files = sorted(glob.glob(os.path.join(FR, "*.png")))
frames = [np.asarray(Image.open(f).convert("RGB")) for f in files]
N = len(frames)
M = 1048576


def psnr(a, b):
    mse = np.mean((a.astype(np.float32) - b.astype(np.float32)) ** 2)
    return 99.0 if mse == 0 else 10 * np.log10(255 ** 2 / mse)


def avif(img, q, speed):
    b = io.BytesIO(); img.save(b, format="AVIF", quality=q, speed=speed); return b.getvalue()


sample = list(range(0, N, 6))
for speed in (6, 2):
    for q in (70,):
        t = time.time(); tot = 0; ps = []
        for i in sample:
            b = avif(Image.fromarray(frames[i]), q, speed); tot += len(b)
            ps.append(psnr(frames[i], np.asarray(Image.open(io.BytesIO(b)).convert("RGB"))))
        print(f"avif speed{speed} q{q}: sample {tot / M:.3f} MB -> full est {tot * N / len(sample) / M:.2f} MB, psnr {np.mean(ps):.2f}  ({time.time() - t:.0f}s)", flush=True)

tmp = tempfile.mkdtemp()
for crf in (20, 28, 36):
    out = f"{tmp}/av1_{crf}.mkv"
    t = time.time()
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", "24", "-i", f"{FR}/%04d.png", "-c:v", "libsvtav1",
                    "-preset", "4", "-crf", str(crf), "-pix_fmt", "yuv420p", "-g", "240", out], check=True)
    d = tempfile.mkdtemp()
    subprocess.run(["ffmpeg", "-v", "error", "-i", out, f"{d}/%04d.png"], check=True)
    ps = [psnr(frames[i], np.asarray(Image.open(f"{d}/{i + 1:04d}.png").convert("RGB"))) for i in range(N)]
    print(f"av1 video crf{crf}: {os.path.getsize(out) / M:.2f} MB, psnr {np.mean(ps):.2f} (min {np.min(ps):.2f})  ({time.time() - t:.0f}s)", flush=True)
