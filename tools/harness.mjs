// Local test harness: serves the demo, runs it in headless Chromium (SwiftShader GL),
// checks rendered frames against the source PNGs, runs the benchmark, takes screenshots.
import http from 'http';
import fs from 'fs';
import path from 'path';
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import { PNG } from 'pngjs';

const SITE = path.resolve('packing-bench');
const FRAMES = path.resolve('work/frames');
const OUT = path.resolve('work/check');
fs.mkdirSync(OUT, { recursive: true });
const PIXI = fs.readFileSync('node_modules/pixi.js/dist/pixi.min.mjs');
const TYPES = { '.html': 'text/html; charset=utf-8', '.json': 'application/json', '.avif': 'image/avif', '.mp4': 'video/mp4', '.webm': 'video/webm' };

const pageHtml = () => { const raw = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  return raw.trimStart().toLowerCase().startsWith('<!doctype') ? raw
    : '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + raw + '</body></html>'; };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') {
    const body = pageHtml();
    res.writeHead(200, { 'content-type': TYPES['.html'] }); return res.end(body);
  }
  const f = path.join(SITE, p);
  if (!f.startsWith(SITE) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const data = fs.readFileSync(f);
  const range = req.headers.range;
  if (range) {
    const [s, e] = range.replace('bytes=', '').split('-');
    const start = +s, end = e ? +e : data.length - 1;
    res.writeHead(206, { 'content-type': TYPES[path.extname(f)], 'content-range': `bytes ${start}-${end}/${data.length}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1 });
    return res.end(data.subarray(start, end + 1));
  }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'accept-ranges': 'bytes' });
  res.end(data);
});
await new Promise((r) => server.listen(8765, r));

const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(), headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
});
const page = await browser.newPage();
await page.setViewport({ width: 420, height: 900, deviceScaleFactor: 2 });
await page.setRequestInterception(true);
page.on('request', (r) => {
  const u = r.url();
  if (u.includes('cdn.jsdelivr.net/npm/pixi.js')) return r.respond({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: PIXI });
  if (u.includes('fonts.g')) return r.abort();
  r.continue();
});
const logs = [];
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`));
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));

await page.goto('http://localhost:8765/', { waitUntil: 'load' });
try {
  await page.waitForFunction(() => window.__api && window.__api.player, { timeout: 30000 });
} catch (e) {
  console.log('LOAD FAILED', await page.evaluate(() => document.getElementById('what')?.textContent));
  console.log(logs.join('\n'));
  process.exit(1);
}
console.log('scrollWidth', await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]));
if (process.env.VIDEOCHECK) {
  await page.evaluate((s) => window.__api.show(s, 'video'), process.env.VIDEOCHECK === '1' ? 's2_shine' : process.env.VIDEOCHECK);
  await new Promise((r) => setTimeout(r, 2500));
  console.log('video', await page.evaluate(() => { const v = document.getElementById('vid'); return { paused: v.paused, t: v.currentTime.toFixed(2), hud: document.getElementById('hud').textContent, what: document.getElementById('what').textContent }; }));
  await page.screenshot({ path: path.join(OUT, 'video_mode.png') });
  const grab = () => page.evaluate(() => { const r = window.__api_renderer_pixels(); return r; });
  const sig = [];
  for (let k = 0; k < 3; k++) {
    await new Promise((r) => setTimeout(r, 700));
    const c = await page.evaluate(() => window.__api.capture(0));
    const buf = Buffer.from(c.b64, 'base64'); let h = 0; for (let i = 0; i < buf.length; i += 997) h += buf[i];
    sig.push([await page.evaluate(() => document.getElementById('vid').currentTime.toFixed(2)), h]);
    await page.evaluate(() => window.__api.resume());
  }
  console.log('texture signature over time', JSON.stringify(sig));
  await browser.close(); server.close(); process.exit(0);
}
if (process.env.QUICK) { await page.screenshot({ path: path.join(OUT, 'page_quick.png'), fullPage: true }); await browser.close(); server.close(); process.exit(0); }
console.log('mp4 support:', await page.evaluate(() => document.createElement('video').canPlayType('video/mp4; codecs="avc1.640020"')));

function psnr(cap, src) {
  // cap: RGBA as extracted (straight alpha), src: PNG RGBA (straight alpha); compare over gray
  let mse = 0;
  for (let i = 0; i < src.length; i += 4) {
    const ac = cap[i + 3] / 255, as = src[i + 3] / 255;
    for (let c = 0; c < 3; c++) {
      const a = cap[i + c] * ac + 128 * (1 - ac), b = src[i + c] * as + 128 * (1 - as);
      mse += (a - b) ** 2;
    }
  }
  mse /= (src.length / 4) * 3;
  return mse === 0 ? 99 : 10 * Math.log10(255 * 255 / mse);
}
if (process.env.WCCHECK) {
  await page.evaluate(() => window.__api.show('clip', 'wc'));
  await new Promise((r) => setTimeout(r, 1200));
  console.log('wc what:', await page.evaluate(() => document.getElementById('what').textContent));
  const srcFrames = fs.readdirSync('work/gem/frames').sort().map((f) => PNG.sync.read(fs.readFileSync(path.join('work/gem/frames', f))).data);
  for (let k = 0; k < 4; k++) {
    await new Promise((r) => setTimeout(r, 600 + k * 170));
    const c = await page.evaluate(() => window.__api.capture(0));
    const buf = Buffer.from(c.b64, 'base64');
    let best = [-1, 0];
    srcFrames.forEach((sf, i) => { const p = psnr(buf, sf); if (p > best[1]) best = [i, p]; });
    console.log('wc capture', k, 'best match frame', best[0], 'psnr', best[1].toFixed(2), c.width, c.height);
    await page.evaluate(() => window.__api.resume());
  }
  const errs = logs.filter((l) => l.startsWith('pageerror') || l.startsWith('error'));
  console.log(errs.join('\n'));
  await browser.close(); server.close(); process.exit(0);
}
const CLIP_TICKS = fs.existsSync('packing-bench/clip/seq/seq.json') ? JSON.parse(fs.readFileSync('packing-bench/clip/seq/seq.json')).ticks : null;
const readSrc = (scn, i) => scn === 'clip'
  ? PNG.sync.read(fs.readFileSync(path.resolve('work/gem/frames', `${String(CLIP_TICKS[i] + 1).padStart(4, '0')}.png`))).data
  : PNG.sync.read(fs.readFileSync(path.join(FRAMES, scn, `${String(i).padStart(4, '0')}.png`))).data;
const SCNS = (process.env.SCNS || 's1_sparkles,s2_shine,s3_bounce,clip').split(',');

const check = {};
for (const scn of SCNS) {
  const capFrames = scn === 'clip' ? [0, 1, 2, 37, 150, 299] : [0, 1, 37, 60, 119];
  for (const mode of ['seq', 'delta']) {
    await page.evaluate((s, m) => window.__api.show(s, m), scn, mode);
    const res = [];
    for (const i of capFrames) {
      const c = await page.evaluate((i) => window.__api.capture(i), i);
      const buf = Buffer.from(c.b64, 'base64');
      res.push(+psnr(buf, readSrc(scn, i)).toFixed(2));
      if (i === 60 || i === 37 || i === 150) {
        const png = new PNG({ width: c.width, height: c.height }); buf.copy(png.data);
        fs.writeFileSync(path.join(OUT, `${scn}_${mode}_${i}.png`), PNG.sync.write(png));
      }
    }
    await page.evaluate(() => window.__api.resume());
    check[`${scn}/${mode}`] = res;
    console.log('psnr', scn, mode, capFrames.join(','), '→', res.join(', '));
  }
}

await page.evaluate(() => window.__api.show('clip', 'delta'));
await new Promise((r) => setTimeout(r, 1500));
await page.screenshot({ path: path.join(OUT, 'page_top.png') });

const bench = {};
for (const scn of SCNS) {
  bench[scn] = await page.evaluate((s) => window.__api.bench(s), scn);
  const b = bench[scn];
  for (const m of Object.keys(b)) {
    const x = b[m];
    if (x.error) { console.log('bench', scn, m, 'ERROR', x.error); continue; }
    console.log('bench', scn, m.padEnd(5), `bytes ${(x.bytes / 1048576).toFixed(2)}MB decode ${x.decodeMs.toFixed(0)}ms prep ${x.prepMs.toFixed(0)}ms upload ${x.uploadMs.toFixed(0)}ms vram ${(x.vram / 1048576).toFixed(1)}MB work mean ${x.workMean.toFixed(2)} p95 ${x.workP95.toFixed(2)} max ${x.workMax.toFixed(1)} long ${x.longFrames} catchup ${x.catchup} dropped ${x.dropped}`);
  }
}
fs.writeFileSync(path.join(OUT, 'bench.json'), JSON.stringify({ check, bench }, null, 1));

// render the live table into the page and screenshot the full page
await page.evaluate((r) => { window.__lastBench = r; }, bench.s2_shine);
await page.screenshot({ path: path.join(OUT, 'page_full.png'), fullPage: true });
console.log(logs.filter((l) => !l.includes('Download the') ).slice(0, 20).join('\n'));
await browser.close();
server.close();
