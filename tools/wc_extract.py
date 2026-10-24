"""Demux an H.264 mp4 into what WebCodecs VideoDecoder needs, without re-encoding:
  <name>.bin   all encoded frames back to back (AVCC, length-prefixed NAL units)
  <name>.json  codec string, avcC description (base64), per-frame offset/size/key/timestamp

The SPS level in avcC is lowered to 4.0 when the stream declares more than the
picture needs (Gemini writes level 6.0 for 692x720), so mobile decoders accept it.

usage: python3 wc_extract.py <in.mp4> <out_dir> <name>
"""
import base64, json, os, sys
import av

src, out, name = sys.argv[1:4]
os.makedirs(out, exist_ok=True)
c = av.open(src)
vs = c.streams.video[0]
avcc = bytearray(vs.codec_context.extradata)
assert avcc[0] == 1, "expected avcC extradata"
w, h = vs.codec_context.width, vs.codec_context.height
level = avcc[3]
if level > 40 and w * h <= 1280 * 720:
    avcc[3] = 40
    # patch level_idc inside the first SPS too (byte 3 of the SPS NAL)
    n_sps = avcc[5] & 0x1F
    p = 6
    for _ in range(n_sps):
        ln = (avcc[p] << 8) | avcc[p + 1]
        sps = p + 2
        avcc[sps + 3] = 40
        p = sps + ln
codec = "avc1.%02x%02x%02x" % (avcc[1], avcc[2], avcc[3])

frames, blob = [], bytearray()
tb = vs.time_base
for pkt in c.demux(vs):
    if pkt.size == 0:
        continue
    data = bytes(pkt)
    frames.append([len(blob), len(data), 1 if pkt.is_keyframe else 0, int(round(pkt.pts * tb * 1_000_000))])
    blob += data
t0 = frames[0][3]
for f in frames:
    f[3] -= t0
open(os.path.join(out, f"{name}.bin"), "wb").write(blob)
meta = dict(codec=codec, description=base64.b64encode(bytes(avcc)).decode(), codedWidth=w, codedHeight=h,
            declaredLevel=level, frames=frames, duration=frames[-1][3] + (frames[-1][3] - frames[-2][3]))
json.dump(meta, open(os.path.join(out, f"{name}.json"), "w"), separators=(",", ":"))
print(codec, w, h, "frames", len(frames), "keyframes", sum(f[2] for f in frames), "bin", len(blob), "bytes")
