// fire-coin-win.js — огненный выигрыш вокруг круглого символа. Pixi 8.
// Символ — одна статичная текстура, он стоит на месте. Огненное кольцо, взрыв искр,
// ударные волны, горящий край, блик и лучи считаются частицами каждый кадр.
// Текстуры частиц рисуются кодом один раз и общие для всех экземпляров.
import { Container, Sprite, Texture, ParticleContainer, Particle, Graphics } from 'pixi.js';

const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// цвет по жизни частицы: 0..1 -> 0xRRGGBB
function ramp(stops) {
  return (t) => {
    let i = 0;
    while (i < stops.length - 2 && t > stops[i + 1][0]) i++;
    const [t0, a] = stops[i], [t1, b] = stops[i + 1];
    const k = clamp01((t - t0) / (t1 - t0));
    const r = a[0] + (b[0] - a[0]) * k, g = a[1] + (b[1] - a[1]) * k, bl = a[2] + (b[2] - a[2]) * k;
    return ((r * 255) << 16) | ((g * 255) << 8) | (bl * 255);
  };
}
const FIRE = ramp([[0, [1, 0.97, 0.82]], [0.25, [1, 0.78, 0.32]], [0.6, [1, 0.42, 0.08]], [1, [0.55, 0.08, 0.02]]]);
const SPARK = ramp([[0, [1, 1, 0.92]], [0.4, [1, 0.85, 0.4]], [1, [1, 0.38, 0.06]]]);
const EMBER = ramp([[0, [1, 0.8, 0.45]], [1, [1, 0.35, 0.05]]]);

// ---------------------------------------------------------------- процедурные текстуры (один раз на приложение)
let TEX = null;
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return Texture.from(c);
}
function textures() {
  if (TEX) return TEX;
  const radial = (g, x, y, r0, r1, stops) => {
    const gr = g.createRadialGradient(x, y, r0, x, y, r1);
    for (const [o, c] of stops) gr.addColorStop(o, c);
    return gr;
  };
  TEX = {
    soft: canvasTex(64, 64, (g, w) => {
      g.fillStyle = radial(g, w / 2, w / 2, 0, w / 2, [[0, 'rgba(255,255,255,1)'], [0.25, 'rgba(255,255,255,0.75)'], [0.6, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']]);
      g.fillRect(0, 0, w, w);
    }),
    flame: canvasTex(64, 96, (g, w, h) => {
      g.fillStyle = radial(g, w / 2, h * 0.62, 0, w * 0.5, [[0, 'rgba(255,255,255,0.95)'], [0.5, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
      g.fillRect(0, 0, w, h);
      const lg = g.createLinearGradient(0, h * 0.62, 0, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0.35)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg; g.beginPath(); g.ellipse(w / 2, h * 0.4, w * 0.22, h * 0.36, 0, 0, Math.PI * 2); g.fill();
    }),
    streak: canvasTex(128, 24, (g, w, h) => {
      const lg = g.createLinearGradient(0, 0, w, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.75, 'rgba(255,255,255,0.7)'); lg.addColorStop(1, 'rgba(255,255,255,1)');
      g.fillStyle = lg;
      g.beginPath(); g.moveTo(0, h / 2); g.quadraticCurveTo(w * 0.7, h * 0.12, w, h / 2); g.quadraticCurveTo(w * 0.7, h * 0.88, 0, h / 2); g.fill();
    }),
    ring: canvasTex(256, 256, (g, w) => {
      g.fillStyle = radial(g, w / 2, w / 2, w * 0.36, w * 0.5, [[0, 'rgba(255,255,255,0)'], [0.55, 'rgba(255,255,255,0.15)'], [0.82, 'rgba(255,255,255,1)'], [0.9, 'rgba(255,255,255,0.35)'], [1, 'rgba(255,255,255,0)']]);
      g.fillRect(0, 0, w, w);
    }),
    rays: canvasTex(256, 256, (g, w) => {
      g.translate(w / 2, w / 2);
      const n = 22;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2, half = i % 2 ? 0.035 : 0.07;
        g.fillStyle = radial(g, 0, 0, w * 0.05, w * 0.5, [[0, `rgba(255,255,255,${i % 2 ? 0.55 : 0.9})`], [1, 'rgba(255,255,255,0)']]);
        g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, w * 0.5, a - half, a + half); g.closePath(); g.fill();
      }
    }),
    glow: canvasTex(256, 256, (g, w) => {
      g.fillStyle = radial(g, w / 2, w / 2, 0, w / 2, [[0, 'rgba(255,214,140,0.95)'], [0.35, 'rgba(255,150,40,0.45)'], [0.7, 'rgba(200,60,10,0.12)'], [1, 'rgba(120,20,0,0)']]);
      g.fillRect(0, 0, w, w);
    }),
    band: canvasTex(96, 512, (g, w, h) => {
      const lg = g.createLinearGradient(0, 0, w, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,250,235,0.85)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg; g.fillRect(0, 0, w, h);
    }),
  };
  return TEX;
}

// пул частиц фиксированного размера: без аллокаций во время анимации.
// В контейнер каждый кадр попадают только живые частицы, поэтому запас пула ничего не стоит.
function makePool(tex, n) {
  const pc = new ParticleContainer({
    texture: tex,
    dynamicProperties: { position: true, rotation: true, vertex: true, color: true, uvs: false },
  });
  pc.blendMode = 'add';
  const items = [];
  for (let i = 0; i < n; i++) {
    const p = new Particle({ texture: tex, anchorX: 0.5, anchorY: 0.5, alpha: 0 });
    p.scaleX = p.scaleY = 0;
    items.push({ p, life: 0, max: 1, alive: false, x: 0, y: 0, vx: 0, vy: 0, s: 1, r: 0, ph: 0 });
  }
  return { pc, items, next: 0, alive: 0 };
}

export class FireCoinWin extends Container {
  /**
   * @param {object} o
   * @param {Texture} o.coin          текстура круглого символа с прозрачным фоном
   * @param {number}  [o.diameter=400] диаметр символа в пикселях сцены
   * @param {number}  [o.density=1]    множитель частиц: 0.5 — экономно, 2 — максимум (можно менять на лету)
   * @param {boolean} [o.loop=false]   повторять выигрыш каждые 4,2 с
   * @param {boolean} [o.embers=true]  угольки, поднимающиеся вокруг символа
   * @param {number}  [o.seed=7]       зерно случайности: одинаковый выигрыш при каждом play()
   */
  constructor({ coin, diameter = 400, density = 1, loop = false, embers = true, seed = 7 } = {}) {
    super();
    const T = textures();
    this.density = density;
    this.loop = loop;
    this.R = diameter / 2;
    this._seed0 = seed;
    this._seed = seed;
    this._t = 0;
    this._win = -1;
    this._exploded = false;
    this._acc = { flame: 0, rim: 0, ember: 0 };
    this._shake = 0;
    this._embersOn = embers;

    // огонь за символом и перед ним в двух слоях; трясутся только они, символ неподвижен
    const back = new Container();
    const front = new Container();
    this._layers = [back, front];

    this._rays = new Sprite(T.rays); this._rays.anchor.set(0.5); this._rays.blendMode = 'add'; this._rays.tint = 0xffb347;
    this._glow = new Sprite(T.glow); this._glow.anchor.set(0.5); this._glow.blendMode = 'add';
    this._embers = makePool(T.soft, 220);
    this._back = makePool(T.flame, 2400);
    back.addChild(this._rays, this._glow, this._embers.pc, this._back.pc);

    const wrap = new Container();
    this._coin = new Sprite(coin); this._coin.anchor.set(0.5);
    this._coin.scale.set(diameter / coin.width);
    this._mask = new Graphics().circle(0, 0, this.R * 0.965).fill(0xffffff);
    this._band = new Sprite(T.band); this._band.anchor.set(0.5); this._band.blendMode = 'add';
    this._band.rotation = 0.42; this._band.height = diameter * 1.6; this._band.width = diameter * 0.3;
    this._band.mask = this._mask; this._band.visible = false;
    wrap.addChild(this._coin, this._mask, this._band);

    this._front = makePool(T.flame, 2400);
    this._burst = makePool(T.flame, 1400);
    this._sparks = makePool(T.streak, 1800);
    front.addChild(this._front.pc, this._burst.pc, this._sparks.pc);
    this._rings = [0, 1].map(() => { const s = new Sprite(T.ring); s.anchor.set(0.5); s.blendMode = 'add'; s.alpha = 0; front.addChild(s); return s; });
    this._flash = new Sprite(T.glow); this._flash.anchor.set(0.5); this._flash.blendMode = 'add'; this._flash.alpha = 0;
    this._flash.scale.set((diameter * 2.6) / 256);
    front.addChild(this._flash);
    this.addChild(back, wrap, front);
    this._pools = [this._embers, this._back, this._front, this._burst, this._sparks];
  }

  /** Запустить выигрыш с начала. */
  play() { this._win = this._t; this._seed = this._seed0; this._exploded = false; }

  /** Сколько частиц сейчас живо. */
  get particleCount() { return this._pools.reduce((s, p) => s + p.alive, 0); }

  /** Быстро прокрутить симуляцию вперёд, например чтобы кольцо было полным с первого кадра. */
  warmUp(seconds, step = 1 / 60) { for (let t = 0; t < seconds; t += step) this.update(step); }

  // детерминированный генератор: при каждом play() выигрыш выглядит одинаково
  _rnd() { let s = (this._seed = (this._seed + 0x6d2b79f5) | 0); let t = Math.imul(s ^ (s >>> 15), 1 | s); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  _r(a, b) { return a + (b - a) * this._rnd(); }

  _spawn(pl) {
    for (let i = 0; i < pl.items.length; i++) {
      const it = pl.items[pl.next];
      pl.next = (pl.next + 1) % pl.items.length;
      if (!it.alive) { it.alive = true; it.life = 0; return it; }
    }
    return null;
  }

  _orbit(phi, a) {
    const TILT = -0.32, B = 0.46;
    const ex = Math.cos(phi) * a, ey = Math.sin(phi) * a * B;
    return [ex * Math.cos(TILT) - ey * Math.sin(TILT), ex * Math.sin(TILT) + ey * Math.cos(TILT)];
  }

  _emitFlames(dt, rate) {
    this._acc.flame += rate * dt * this.density;
    while (this._acc.flame >= 1) {
      this._acc.flame -= 1;
      const head = this._rnd() < 0.5 ? 0 : Math.PI;
      const phi = this._t * 2.6 + head - Math.pow(this._rnd(), 1.6) * 1.1;   // шлейф отстаёт от головы кометы
      const a = this.R * this._r(1.12, 1.42);
      const [x, y] = this._orbit(phi, a);
      const it = this._spawn(Math.sin(phi) > 0 ? this._front : this._back);
      if (!it) continue;
      it.x = x + this._r(-20, 20); it.y = y + this._r(-20, 20);
      const [x2, y2] = this._orbit(phi + 0.05, a);
      const sp = this._r(60, 160), tl = Math.hypot(x2 - x, y2 - y) || 1;
      it.vx = ((x2 - x) / tl) * sp; it.vy = ((y2 - y) / tl) * sp - this._r(30, 90);
      it.max = this._r(0.5, 1.0); it.s = this._r(0.8, 1.6) * this.R / 200; it.r = this._r(-0.4, 0.4); it.ph = this._r(0, 6.28);
    }
  }

  _emitRim(dt, rate) {
    this._acc.rim += rate * dt * this.density;
    while (this._acc.rim >= 1) {
      this._acc.rim -= 1;
      const it = this._spawn(this._back);
      if (!it) continue;
      const a = this._r(0, Math.PI * 2), r = this.R * this._r(0.97, 1.06);
      it.x = Math.cos(a) * r; it.y = Math.sin(a) * r;
      it.vx = Math.cos(a) * this._r(30, 90); it.vy = Math.sin(a) * this._r(30, 90) - this._r(70, 170);
      it.max = this._r(0.4, 0.8); it.s = this._r(0.7, 1.3) * this.R / 200; it.r = 0; it.ph = this._r(0, 6.28);
    }
  }

  _emitEmbers(dt) {
    if (!this._embersOn) return;
    this._acc.ember += 32 * dt * this.density;
    const span = this.R * 1.75;
    while (this._acc.ember >= 1) {
      this._acc.ember -= 1;
      const it = this._spawn(this._embers);
      if (!it) continue;
      it.x = this._r(-span, span); it.y = span; it.vx = this._r(-12, 12); it.vy = this._r(-110, -45);
      it.max = this._r(4, 8); it.s = this._r(0.05, 0.16); it.ph = this._r(0, 6.28);
    }
  }

  _explode() {
    const R = this.R;
    for (let i = 0, n = Math.round(420 * this.density); i < n; i++) {
      const it = this._spawn(this._sparks); if (!it) break;
      const a = this._r(0, Math.PI * 2), sp = this._r(380, 1250) * R / 200;
      it.x = Math.cos(a) * R * 0.85; it.y = Math.sin(a) * R * 0.85;
      it.vx = Math.cos(a) * sp; it.vy = Math.sin(a) * sp - this._r(0, 220);
      it.max = this._r(0.5, 1.35); it.s = this._r(0.28, 0.55) * R / 200;
    }
    for (let i = 0, n = Math.round(320 * this.density); i < n; i++) {
      const it = this._spawn(this._burst); if (!it) break;
      const a = this._r(0, Math.PI * 2), sp = this._r(90, 330) * R / 200, r = R * this._r(0.9, 1.05);
      it.x = Math.cos(a) * r; it.y = Math.sin(a) * r;
      it.vx = Math.cos(a) * sp; it.vy = Math.sin(a) * sp - this._r(20, 120);
      it.max = this._r(0.55, 1.05); it.s = this._r(0.9, 1.7) * R / 200; it.r = a + Math.PI / 2; it.ph = this._r(0, 6.28);
    }
  }

  _stepPool(pl, dt, fn) {
    const list = pl.pc.particleChildren;
    list.length = 0;
    for (const it of pl.items) {
      if (!it.alive) continue;
      it.life += dt;
      const k = it.life / it.max;
      if (k >= 1) { it.alive = false; continue; }
      fn(it, k, dt);
      list.push(it.p);
    }
    pl.alive = list.length;
    pl.pc.update();
  }

  /** Вызывать каждый кадр. dt — секунды (в Pixi 8: ticker.deltaMS / 1000). */
  update(dt) {
    dt = Math.min(dt, 1 / 30);
    this._t += dt;
    const t = this._t, R = this.R, D = R * 2;
    let T = this._win >= 0 ? t - this._win : 99;
    if (this.loop && this._win >= 0 && T > 4.2) { this.play(); T = 0; }
    const winOn = T < 3.0;
    if (T >= 0.18 && !this._exploded && this._win >= 0) { this._exploded = true; this._explode(); this._shake = 1; }

    this._emitFlames(dt, winOn && T > 0.18 ? 900 : 300);
    this._emitRim(dt, winOn && T > 0.18 && T < 2.7 ? 520 : 0);
    this._emitEmbers(dt);

    const flame = (it, k, dt) => {
      it.vx *= 1 - 0.9 * dt; it.vy *= 1 - 0.9 * dt; it.vy -= 60 * dt;
      it.x += it.vx * dt + Math.sin(t * 9 + it.ph) * 18 * dt; it.y += it.vy * dt;
      const p = it.p, sz = it.s * Math.sin(Math.min(1, k * 1.6) * Math.PI * 0.5) * (1 - k * 0.55);
      p.x = it.x; p.y = it.y; p.scaleX = sz * 0.8; p.scaleY = sz * 1.15;
      p.rotation = it.r + Math.sin(t * 6 + it.ph) * 0.25;
      p.tint = FIRE(k); p.alpha = Math.min(1, k * 6) * (1 - k) * 0.9;
    };
    this._stepPool(this._back, dt, flame);
    this._stepPool(this._front, dt, flame);
    this._stepPool(this._burst, dt, (it, k, dt) => {
      it.vx *= 1 - 1.6 * dt; it.vy *= 1 - 1.6 * dt; it.vy -= 90 * dt;
      it.x += it.vx * dt; it.y += it.vy * dt;
      const p = it.p, sz = it.s * (0.55 + k * 0.9) * (1 - k * 0.3);
      p.x = it.x; p.y = it.y; p.scaleX = sz * 0.85; p.scaleY = sz * 1.1; p.rotation = it.r;
      p.tint = FIRE(Math.min(1, k * 1.15)); p.alpha = Math.min(1, k * 8) * Math.pow(1 - k, 1.4) * 0.75;
    });
    this._stepPool(this._sparks, dt, (it, k, dt) => {
      it.vx *= 1 - 2.1 * dt; it.vy *= 1 - 2.1 * dt; it.vy += 820 * dt * R / 200;
      it.x += it.vx * dt; it.y += it.vy * dt;
      const p = it.p, sp = Math.hypot(it.vx, it.vy);
      p.x = it.x; p.y = it.y; p.rotation = Math.atan2(it.vy, it.vx);
      p.scaleX = (0.18 + sp / (1100 * R / 200)) * it.s * 2.2; p.scaleY = it.s * (1 - k * 0.6);
      p.tint = SPARK(k); p.alpha = k < 0.6 ? 1 : (1 - k) / 0.4;
    });
    this._stepPool(this._embers, dt, (it, k, dt) => {
      it.x += (it.vx + Math.sin(t * 1.7 + it.ph) * 22) * dt; it.y += it.vy * dt;
      const p = it.p;
      p.x = it.x; p.y = it.y; p.scaleX = p.scaleY = it.s * (1 - k * 0.5);
      p.tint = EMBER(k); p.alpha = (0.35 + 0.65 * Math.abs(Math.sin(t * 7 + it.ph * 3))) * Math.min(1, k * 8) * (1 - k);
    });

    // блик
    if (T > 1.85 && T < 2.5) {
      const u = (T - 1.85) / 0.65;
      this._band.visible = true; this._band.x = (-1.1 + 2.2 * easeInOut(u)) * R; this._band.alpha = Math.sin(u * Math.PI);
    } else this._band.visible = false;

    // лучи, свечение, ударные волны, вспышка
    const pop = T >= 0.18 ? Math.max(0, 1 - (T - 0.18) / 1.6) : 0;
    this._rays.rotation = t * 0.22;
    this._rays.scale.set(((1.32 + 0.25 * pop) * D * 1.8) / 256);
    this._rays.alpha = 0.16 + 0.08 * Math.sin(t * 2.3) + 0.5 * pop;
    this._glow.scale.set((D * 2.1 + 27 * Math.sin(t * 3.1) * (R / 200) + 220 * pop * (R / 200)) / 256);
    this._glow.alpha = 0.75 + 0.25 * pop;
    this._rings.forEach((s, i) => {
      const u = (T - (0.18 + i * 0.09)) / (0.55 + i * 0.35);
      if (u < 0 || u > 1) { s.alpha = 0; return; }
      s.scale.set(((0.55 + 2.4 * easeOutCubic(u)) * D) / 256);
      s.alpha = (1 - u) * (i ? 0.55 : 0.95);
      s.tint = i ? 0xff9a3c : 0xffe3a0;
    });
    this._flash.alpha = T >= 0.18 && T < 0.5 ? (1 - (T - 0.18) / 0.32) * 0.55 : 0;

    // тряска огня на ударе: символ и позиция самого эффекта не двигаются
    this._shake = Math.max(0, this._shake - dt * 2.8);
    const sh = this._shake * this._shake * 14 * (R / 200);
    const sx = this._r(-sh, sh), sy = this._r(-sh, sh);
    for (const l of this._layers) l.position.set(sx, sy);
  }

  destroy(options) {
    // общие текстуры не уничтожаем: их используют другие экземпляры
    super.destroy({ children: true, texture: false, textureSource: false, ...(typeof options === 'object' ? options : {}) });
  }
}
