import http from 'http'; import fs from 'fs'; import path from 'path';
import chromium from '@sparticuz/chromium'; import puppeteer from 'puppeteer-core';
const SITE = path.resolve(process.env.SITE_DIR || 'fire-coin-win'); const OUT = path.resolve('work/vs'); fs.mkdirSync(OUT, { recursive: true });
const PIXI = fs.readFileSync('node_modules/pixi.js/dist/pixi.min.mjs');
const TYPES = { '.avif': 'image/avif', '.mp4': 'video/mp4', '.js': 'text/javascript' };
const pageHtml = () => { const raw = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  return raw.trimStart().toLowerCase().startsWith('<!doctype') ? raw
    : '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body>' + raw + '</body></html>'; };
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') { res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return res.end(pageHtml()); }
  const f = path.join(SITE, p); if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const data = fs.readFileSync(f); const type = TYPES[path.extname(f)] || 'application/octet-stream';
  if (req.headers.range) { const [s, e] = req.headers.range.replace('bytes=', '').split('-'); const st = +s, en = e ? +e : data.length - 1;
    res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${st}-${en}/${data.length}`, 'accept-ranges': 'bytes', 'content-length': en - st + 1 }); return res.end(data.subarray(st, en + 1)); }
  res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes' }); res.end(data);
});
await new Promise((r) => server.listen(8768, r));
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setViewport({ width: 420, height: 900, deviceScaleFactor: 2 });
await page.setRequestInterception(true);
page.on('request', (r) => { const u = r.url(); if (u.includes('cdn.jsdelivr.net/npm/pixi.js')) return r.respond({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: PIXI }); if (u.includes('fonts.g')) return r.abort(); r.continue(); });
const logs = []; page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`)); page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
await page.goto('http://localhost:8768/', { waitUntil: 'load' });
try { await page.waitForFunction(() => window.__vs, { timeout: 30000 }); } catch (e) { console.log('LOAD FAIL\n' + logs.join('\n')); process.exit(1); }
await new Promise((r) => setTimeout(r, 2000));
console.log('scrollWidth', await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]));
console.log('video', await page.evaluate(() => { const v = document.getElementById('vid'); return { paused: v.paused, t: v.currentTime.toFixed(2), w: v.videoWidth, h: v.videoHeight }; }));
for (let k = 0; k < 3; k++) { await new Promise((r) => setTimeout(r, 1500)); console.log('video t', await page.evaluate(() => { const v = document.getElementById('vid'); return [v.currentTime.toFixed(2), v.readyState, v.paused]; })); }
console.log('vram', await page.evaluate(() => document.getElementById('vram').textContent));
console.log('copy texts', await page.evaluate(() => [document.getElementById('code-usage').textContent.split('\n').length, document.getElementById('code-module').textContent.slice(0, 60)]));
const el = await page.$('#stage');
for (const t of [0.22, 0.6, 1.3]) { const n = await page.evaluate((t) => window.__vs.at(t), t); await el.screenshot({ path: path.join(OUT, `fx_${String(t).replace('.', '_')}.png`) }); console.log('t', t, 'particles', n); }
console.log('bench', JSON.stringify(await page.evaluate(() => window.__vs.bench(600))));
const vel = await page.$('.frame.video'); await vel.screenshot({ path: path.join(OUT, 'video.png') });
await page.screenshot({ path: path.join(OUT, 'page.png'), fullPage: true });
console.log(logs.filter((l) => !l.includes('GL Driver')).join('\n'));
await browser.close(); server.close();
