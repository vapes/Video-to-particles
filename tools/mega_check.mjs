// Headless check of mega-win/: loads the page, renders stills at given seconds, benchmarks the simulation.
import http from 'http'; import fs from 'fs'; import path from 'path';
import chromium from '@sparticuz/chromium'; import puppeteer from 'puppeteer-core';
const ROOT = path.resolve('.'); const OUT = path.resolve('work/mega'); fs.mkdirSync(OUT, { recursive: true });
const PIXI = fs.readFileSync('node_modules/pixi.js/dist/pixi.min.mjs');
const TYPES = { '.html': 'text/html; charset=utf-8', '.mp4': 'video/mp4', '.js': 'text/javascript', '.avif': 'image/avif' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(ROOT, p); if (!f.startsWith(ROOT) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const data = fs.readFileSync(f); const type = TYPES[path.extname(f)] || 'application/octet-stream';
  if (req.headers.range) { const [s, e] = req.headers.range.replace('bytes=', '').split('-'); const st = +s, en = e ? +e : data.length - 1;
    res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${st}-${en}/${data.length}`, 'accept-ranges': 'bytes', 'content-length': en - st + 1 }); return res.end(data.subarray(st, en + 1)); }
  res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes' }); res.end(data);
});
await new Promise((r) => server.listen(8769, r));
const browser = await puppeteer.launch({ executablePath: await chromium.executablePath(), headless: true,
  args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage();
await page.setViewport({ width: Number(process.env.VW || 900), height: 1000, deviceScaleFactor: Number(process.env.DPR || 1) });
await page.setRequestInterception(true);
page.on('request', (r) => { const u = r.url(); if (u.includes('cdn.jsdelivr.net/npm/pixi.js')) return r.respond({ status: 200, contentType: 'text/javascript', headers: { 'access-control-allow-origin': '*' }, body: PIXI }); if (u.includes('fonts.g')) return r.abort(); r.continue(); });
const logs = []; page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`)); page.on('pageerror', (e) => logs.push('pageerror: ' + e.message));
await page.goto(`http://localhost:8769/${process.env.PAGE || 'mega-win/'}`, { waitUntil: 'load' });
if (process.env.PAGE && process.env.PAGE !== 'mega-win/') {
  await new Promise((r) => setTimeout(r, 2500));
  console.log('links', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('a')].map((a) => a.getAttribute('href')))));
  console.log(logs.filter((l) => !l.includes('GL Driver')).join('\n')); await browser.close(); server.close(); process.exit(0);
}
try { await page.waitForFunction(() => window.__mw, { timeout: 30000 }); } catch (e) { console.log('LOAD FAIL\n' + logs.join('\n')); process.exit(1); }
await new Promise((r) => setTimeout(r, 1500));
console.log('scrollWidth', await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]));
console.log('vram', await page.evaluate(() => document.getElementById('vram').textContent));
const el = await page.$('#stage');
for (const t of (process.env.TIMES || '0.3,1.3,1.8,2.3,3.0,3.6,4.2,5.0,5.8,6.7,7.5,8.3,9.0,9.5').split(',').map(Number)) {
  const n = await page.evaluate((t) => window.__mw.at(t), t);
  await el.screenshot({ path: path.join(OUT, `t${t.toFixed(1)}.png`) });
  console.log('t', t, 'particles', n);
}
console.log('bench', JSON.stringify(await page.evaluate(() => window.__mw.bench())));
await page.evaluate(() => window.__mw.resume());
if (process.env.FULL) await page.screenshot({ path: path.join(OUT, 'page.png'), fullPage: true });
console.log(logs.filter((l) => !l.includes('GL Driver')).join('\n'));
await browser.close(); server.close();
