import sys, os, tempfile, json
sys.argv = ["x", "work/frames", "work/tune", "70"]
sys.path.insert(0, "tools")
import encode as E
res = {}
for name in ["s1_sparkles", "s2_shine", "s3_bounce"]:
    fr = E.load_frames(name)
    for crf264, crf9 in [(16, 26), (12, 20)]:
        o = f"work/tune/{name}_{crf264}"; os.makedirs(o, exist_ok=True)
        r = E.video(name, fr, o, crf264=crf264, crf_vp9=crf9)
        print(name, crf264, crf9, {k: (round(v, 2) if isinstance(v, float) else v) for k, v in r.items()}, flush=True)
