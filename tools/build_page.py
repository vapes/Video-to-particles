"""Assemble packing-bench/clip assets from the clip experiment and inject SUMMARY into the page."""
import json, os, re, shutil, subprocess, sys

ROOT = str(__import__("pathlib").Path(__file__).resolve().parents[1])   # repo root; experiment data lives in work/
R = json.load(open(f"{ROOT}/work/gem/out/results.json"))
synth = json.load(open(f"{ROOT}/work/summary_synth.json"))
for v in synth.values():
    v["video"]["vram"] = 512 * 1024 * 4

# best tile-delta variant by total size (what we ship in the demo)
best = min(R["delta_variants"], key=lambda d: d["total"])
print("best delta", best["tile"], best["label"], best["total"])

# video: smallest crf whose quality is within 0.5 dB of the AVIF sequence
target = R["seq"]["psnr"] - 0.5
ok = [v for v in R["video"] if v["psnr"] >= target]
vid = max(ok, key=lambda v: v["crf"]) if ok else min(R["video"], key=lambda v: v["crf"])
print("video crf", vid["crf"], vid["bytes"], round(vid["psnr"], 2), "seq psnr", round(R["seq"]["psnr"], 2))

site = f"{ROOT}/packing-bench/clip"
if "--write" in sys.argv:
    shutil.rmtree(site, ignore_errors=True)
    shutil.copytree(f"{ROOT}/work/gem/out/seq", f"{site}/seq")
    subprocess.run(["python3", f"{ROOT}/tools/clip_delta_write.py", f"{ROOT}/work/gem/frames", f"{ROOT}/work/gem/pts.txt",
                    site, str(best["tile"]), str(best["max_thr"]), str(best["mean_thr"])], check=True)
    shutil.copy(f"{ROOT}/work/gem/norot.mp4", f"{site}/video.mp4")   # original stream: no audio, rotation flag removed

summary = dict(synth)
summary["clip"] = dict(
    note=f"{R['w']}×{R['h']}, {R['unique']} кадров 24 fps, {R['duration']:.1f} с",
    seq=dict(bytes=R["seq"]["bytes"], naive60=R["seq"]["naive60_bytes"], psnr=round(R["seq"]["psnr"], 1), vram=R["seq"]["vram"]),
    delta=dict(bytes=best["total"], changed=round(best["changed_pct"], 1), psnr=round(best["psnr"], 1), vram=best["vram"],
               tile=best["tile"], label=best["label"]),
    video=dict(mp4=R["video_src_noaudio"], webm=R["video_src_noaudio"], vram=R["w"] * R["h"] * 4, original=True,
               reencode=[dict(crf=v["crf"], bytes=v["bytes"], psnr=round(v["psnr"], 1)) for v in R["video"]]),
)
json.dump(summary, open(f"{ROOT}/work/summary_all.json", "w"), indent=1)

p = f"{ROOT}/packing-bench/index.html"
s = open(p).read()
s = re.sub(r"const SUMMARY = .*?;\n", lambda m: "const SUMMARY = " + json.dumps(summary, ensure_ascii=False, separators=(",", ":")) + ";\n", s, count=1)
open(p, "w").write(s)
print("page updated")
