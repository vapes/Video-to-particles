"""Approximate 'what if the clip had a black / transparent background'.

The camera moves, so a static background plate does not work; instead the dark
reels are keyed out by brightness (they stay below luma ~90, the coin and fire are
far above). alpha = smoothstep(LO, HI, luma).

  black/NNNN.png  : RGB  = frame * alpha          (effect on pure black)
  alpha/NNNN.png  : RGBA = (frame, alpha), colour zeroed where alpha == 0
  black_h264/     : the black version pushed through H.264 at the source bitrate,
                    i.e. what a generator would hand you as a "black background" mp4
"""
import glob, os, subprocess, sys
import numpy as np
from PIL import Image

SRC, OUT = sys.argv[1], sys.argv[2]
LO, HI = 70.0, 130.0
for d in ("black", "alpha", "black_h264"):
    os.makedirs(os.path.join(OUT, d), exist_ok=True)

for f in sorted(glob.glob(os.path.join(SRC, "*.png"))):
    n = os.path.basename(f)
    F = np.asarray(Image.open(f).convert("RGB")).astype(np.float32)
    Y = 0.299 * F[..., 0] + 0.587 * F[..., 1] + 0.114 * F[..., 2]
    t = np.clip((Y - LO) / (HI - LO), 0, 1)
    a = t * t * (3 - 2 * t)
    black = (F * a[..., None]).round().astype(np.uint8)
    Image.fromarray(black, "RGB").save(os.path.join(OUT, "black", n))
    rgb = np.where(a[..., None] > 0, F, 0).round().astype(np.uint8)
    rgba = np.dstack([rgb, (a * 255).round().astype(np.uint8)])
    Image.fromarray(rgba, "RGBA").save(os.path.join(OUT, "alpha", n))

# simulate a generator's mp4 with black background: same bitrate as the source video stream
subprocess.run(["ffmpeg", "-v", "error", "-y", "-framerate", "24", "-i", os.path.join(OUT, "black", "%04d.png"),
                "-c:v", "libx264", "-b:v", "1650k", "-maxrate", "2000k", "-bufsize", "4000k", "-pix_fmt", "yuv420p",
                "-preset", "medium", os.path.join(OUT, "black_src.mp4")], check=True)
subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", os.path.join(OUT, "black_src.mp4"),
                os.path.join(OUT, "black_h264", "%04d.png")], check=True)
print("done")
