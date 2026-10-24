"""Write one tile-delta variant of the clip to disk (reuses tile_delta() from encode_clip.py).
usage: python3 clip_delta_write.py <frames_dir> <pts.txt> <out_dir> <tile> <max_thr> <mean_thr>"""
import ast, json, math, os, sys
import numpy as np
from PIL import Image
FR, PTS, OUT, T, MX, MN = sys.argv[1], sys.argv[2], sys.argv[3], int(sys.argv[4]), float(sys.argv[5]), float(sys.argv[6])
src = open(os.path.join(os.path.dirname(__file__), "encode_clip.py")).read()
tree = ast.parse(src)
ns = {}
exec("import gzip, hashlib, io, json, math, os\nimport numpy as np\nfrom PIL import Image\nQ, SPEED, PAD, ATLAS_MAX = 70, 6, 2, 2048", ns)
for node in tree.body:
    if isinstance(node, ast.FunctionDef) and node.name in ("avif", "dec", "psnr", "tile_delta"):
        exec(compile(ast.Module([node], []), "encode_clip", "exec"), ns)
pts = [float(x) for x in open(PTS).read().split()]
files = sorted(os.listdir(FR))
frames = [np.asarray(Image.open(os.path.join(FR, f)).convert("RGBA")) for f in files]
N = len(frames); H, W = frames[0].shape[:2]
duration = pts[-1] + (pts[-1] - pts[-2]); TICKS = int(round(duration * 60))
tick_map = [max(j for j in range(N) if pts[j] <= k / 60 + 1e-6) for k in range(TICKS)]
ns.update(frames=frames, N=N, H=H, W=W, tick_map=tick_map, OUT=OUT)
os.makedirs(os.path.join(OUT, "delta"), exist_ok=True)
r = ns["tile_delta"](T, MX, MN, write=True)
print(json.dumps(r))
