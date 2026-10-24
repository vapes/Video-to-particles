// mega-win.js — сцена «MEGA WIN» на 10 секунд, собранная кодом. Pixi 8.
// Ни одной внешней картинки: лучи, нити, монеты, звёзды, буквы и цифры рисуются
// в canvas при первом создании, дальше всё считается частицами и лентами каждый кадр.
// Сцена в координатах 1280×720 — масштабируй контейнер под свой экран.
import { Container, Sprite, Texture, ParticleContainer, Particle, MeshRope, Point, Graphics } from 'pixi.js';

const W = 1280, H = 720, CX = W / 2, TAU = Math.PI * 2;
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
const lerp = (a, b, k) => a + (b - a) * k;
const easeOutCubic = (t) => 1 - Math.pow(1 - clamp01(t), 3);
const easeInOut = (t) => { t = clamp01(t); return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; };
const easeOutBack = (t) => { t = clamp01(t); const c = 1.7; return 1 + (c + 1) * Math.pow(t - 1, 3) + c * Math.pow(t - 1, 2); };
// окно времени: 0 вне [a, b], плавный вход за fi секунд и выход за fo секунд
const win = (t, a, b, fi = 0.3, fo = 0.4) => (t < a || t > b ? 0 : Math.min(1, (t - a) / fi, (b - t) / fo));
const mix = (c1, c2, k) => {
  const r = lerp((c1 >> 16) & 255, (c2 >> 16) & 255, k), g = lerp((c1 >> 8) & 255, (c2 >> 8) & 255, k), b = lerp(c1 & 255, c2 & 255, k);
  return (r << 16) | (g << 8) | b;
};
const GOLD = 0xffc45e, GOLD_LIGHT = 0xffe7a8, PINK = 0xff4fd8, GREEN = 0x8cff4f, CYAN = 0x4ff0ff, ORANGE = 0xff7a2a, VIOLET = 0xa96bff, YELLOW = 0xffe14f;

// ---------------------------------------------------------------- текстуры (один раз на приложение)
let TEX = null;
function canvasTex(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  return Texture.from(c);
}
function radial(g, x, y, r0, r1, stops) {
  const gr = g.createRadialGradient(x, y, r0, x, y, r1);
  for (const [o, c] of stops) gr.addColorStop(o, c);
  return gr;
}
function starPath(g, cx, cy, n, r0, r1) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = (i / (n * 2)) * TAU - Math.PI / 2, r = i % 2 ? r1 : r0;
    g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  g.closePath();
}
function textures() {
  if (TEX) return TEX;
  TEX = {
    soft: canvasTex(64, 64, (g, w) => {
      g.fillStyle = radial(g, w / 2, w / 2, 0, w / 2, [[0, 'rgba(255,255,255,1)'], [0.22, 'rgba(255,255,255,0.8)'], [0.55, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']]);
      g.fillRect(0, 0, w, w);
    }),
    streak: canvasTex(128, 12, (g, w, h) => {
      const lg = g.createLinearGradient(0, 0, w, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.7, 'rgba(255,255,255,0.75)'); lg.addColorStop(1, 'rgba(255,255,255,1)');
      g.fillStyle = lg;
      g.beginPath(); g.moveTo(0, h / 2); g.quadraticCurveTo(w * 0.7, h * 0.15, w, h / 2); g.quadraticCurveTo(w * 0.7, h * 0.85, 0, h / 2); g.fill();
    }),
    coin: canvasTex(128, 128, (g, w) => {
      const c = w / 2;
      g.fillStyle = radial(g, c * 0.8, c * 0.7, 4, c, [[0, '#fff3b8'], [0.45, '#ffcf4a'], [0.85, '#c88a1c'], [1, '#8a5a10']]);
      g.beginPath(); g.arc(c, c, c - 2, 0, TAU); g.fill();
      g.lineWidth = 7; g.strokeStyle = '#a86e14'; g.beginPath(); g.arc(c, c, c - 14, 0, TAU); g.stroke();
      g.lineWidth = 3; g.strokeStyle = 'rgba(255,240,180,0.9)'; g.beginPath(); g.arc(c, c, c - 9, Math.PI * 1.05, Math.PI * 1.75); g.stroke();
      g.fillStyle = 'rgba(150,95,15,0.85)'; starPath(g, c, c + 2, 5, 30, 13); g.fill();
      g.fillStyle = 'rgba(255,236,160,0.9)'; starPath(g, c - 2, c, 5, 27, 11); g.fill();
    }),
    star: canvasTex(64, 64, (g, w) => {
      const lg = g.createLinearGradient(0, 0, w, w);
      lg.addColorStop(0, '#fff6c0'); lg.addColorStop(0.5, '#ffc93f'); lg.addColorStop(1, '#b8740f');
      g.fillStyle = lg; starPath(g, w / 2, w / 2 + 2, 5, w * 0.48, w * 0.2); g.fill();
    }),
    glint: canvasTex(64, 64, (g, w) => {
      const c = w / 2;
      g.fillStyle = radial(g, c, c, 0, c * 0.35, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
      g.fillRect(0, 0, w, w);
      for (const [sx, sy] of [[1, 0.09], [0.09, 1]]) {
        const gr = radial(g, c, c, 0, c, [[0, 'rgba(255,255,255,1)'], [1, 'rgba(255,255,255,0)']]);
        g.save(); g.translate(c, c); g.scale(sx, sy); g.translate(-c, -c); g.fillStyle = gr; g.fillRect(0, 0, w, w); g.restore();
      }
    }),
    glow: canvasTex(256, 256, (g, w) => {
      g.fillStyle = radial(g, w / 2, w / 2, 0, w / 2, [[0, 'rgba(255,255,255,1)'], [0.2, 'rgba(255,255,255,0.55)'], [0.5, 'rgba(255,255,255,0.15)'], [1, 'rgba(255,255,255,0)']]);
      g.fillRect(0, 0, w, w);
    }),
    rays: canvasTex(256, 256, (g, w) => {
      g.translate(w / 2, w / 2);
      const n = 26;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU, half = i % 2 ? 0.03 : 0.06;
        g.fillStyle = radial(g, 0, 0, w * 0.03, w * 0.5, [[0, `rgba(255,255,255,${i % 2 ? 0.5 : 0.9})`], [1, 'rgba(255,255,255,0)']]);
        g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, w * 0.5, a - half, a + half); g.closePath(); g.fill();
      }
    }),
    beam: canvasTex(64, 512, (g, w, h) => {
      // луч прожектора: узкий у основания, расширяется вверх и гаснет
      const lg = g.createLinearGradient(0, h, 0, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0.95)'); lg.addColorStop(0.6, 'rgba(255,255,255,0.35)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg;
      g.beginPath(); g.moveTo(w / 2 - 3, h); g.lineTo(0, 0); g.lineTo(w, 0); g.lineTo(w / 2 + 3, h); g.closePath(); g.fill();
    }),
    line: canvasTex(32, 16, (g, w, h) => {
      // поперечный профиль ленты: яркая середина, мягкие края
      const lg = g.createLinearGradient(0, 0, 0, h);
      lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.42, 'rgba(255,255,255,0.65)'); lg.addColorStop(0.5, 'rgba(255,255,255,1)');
      lg.addColorStop(0.58, 'rgba(255,255,255,0.65)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg; g.fillRect(0, 0, w, h);
    }),
    haze: canvasTex(32, 32, (g, w, h) => {
      const lg = g.createLinearGradient(0, 0, 0, h);
      lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,0.6)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg; g.fillRect(0, 0, w, h);
    }),
    flare: canvasTex(512, 24, (g, w, h) => {
      const lg = g.createLinearGradient(0, 0, w, 0);
      lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(0.5, 'rgba(255,255,255,1)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg; g.fillRect(0, h * 0.35, w, h * 0.3);
      g.fillStyle = radial(g, w / 2, h / 2, 0, h / 2, [[0, 'rgba(255,255,255,0.8)'], [1, 'rgba(255,255,255,0)']]);
      g.fillRect(0, 0, w, h);
    }),
  };
  return TEX;
}

// золотая буква или цифра обычным шрифтом: гладкий градиент, мягкая тень и свечение, без обводки
function goldGlyph(ch, size, font) {
  const probe = document.createElement('canvas').getContext('2d');
  probe.font = `bold ${size}px ${font}`;
  const tw = Math.ceil(probe.measureText(ch).width);
  const pad = Math.round(size * 0.22);
  const w = tw + pad * 2, h = Math.round(size * 1.25) + pad * 2;
  const tex = canvasTex(w, h, (g) => {
    g.font = `bold ${size}px ${font}`;
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    const x = pad, y = pad + size * 0.98;
    const lg = g.createLinearGradient(0, y - size * 0.75, 0, y);
    lg.addColorStop(0, '#fff7d6'); lg.addColorStop(0.45, '#ffd76a'); lg.addColorStop(1, '#e09a2a');
    g.fillStyle = lg;
    g.shadowColor = 'rgba(255,170,40,0.45)'; g.shadowBlur = size * 0.14;            // тёплое свечение
    g.fillText(ch, x, y);
    g.shadowColor = 'rgba(40,20,0,0.7)'; g.shadowBlur = size * 0.05; g.shadowOffsetY = size * 0.04;   // тень даёт объём
    g.fillText(ch, x, y);
    g.shadowColor = 'transparent'; g.shadowBlur = 0; g.shadowOffsetY = 0;
    g.fillText(ch, x, y);
  });
  return { tex, w: tw, h };
}

// ---------------------------------------------------------------- пулы частиц
class Pool {
  constructor(tex, n, blend = 'add') {
    this.pc = new ParticleContainer({ texture: tex, dynamicProperties: { position: true, rotation: true, vertex: true, color: true, uvs: false } });
    this.pc.blendMode = blend;
    this.items = [];
    for (let i = 0; i < n; i++) {
      const p = new Particle({ texture: tex, anchorX: 0.5, anchorY: 0.5 });
      this.items.push({ p, alive: false, life: 0, max: 1, x: 0, y: 0, vx: 0, vy: 0, g: 0, drag: 0, s: 1, s1: 1, r: 0, vr: 0, ph: 0, tint: 0xffffff, a: 1, tw: 0 });
    }
    this.next = 0;
    this.alive = 0;
  }
  spawn() {
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[this.next];
      this.next = (this.next + 1) % this.items.length;
      if (!it.alive) { it.alive = true; it.life = 0; it.g = 0; it.drag = 0; it.vr = 0; it.r = 0; it.tw = 0; it.a = 1; it.s1 = null; it.thick = 0; return it; }
    }
    return null;
  }
  step(dt, fn) {
    const list = this.pc.particleChildren;
    list.length = 0;
    for (const it of this.items) {
      if (!it.alive) continue;
      it.life += dt;
      const k = it.life / it.max;
      if (k >= 1) { it.alive = false; continue; }
      const d = 1 - it.drag * dt;
      it.vx *= d; it.vy *= d; it.vy += it.g * dt;
      it.x += it.vx * dt; it.y += it.vy * dt; it.r += it.vr * dt;
      fn(it, k, it.p);
      it.p.x = it.x; it.p.y = it.y;
      list.push(it.p);
    }
    this.alive = list.length;
    this.pc.update();
  }
}

// лента из нескольких нитей: каждая нить — MeshRope, форма задаётся функцией path(u, i) каждый кадр
class Ribbon {
  constructor(parent, { strands, tex, widths, tints, n = 56 }) {
    this.container = new Container();
    parent.addChild(this.container);
    this.ropes = [];
    for (let i = 0; i < strands; i++) {
      const points = Array.from({ length: n }, () => new Point());
      const rope = new MeshRope({ texture: tex, points, width: widths[i % widths.length] });
      rope.blendMode = 'add';
      rope.tint = tints[i % tints.length];
      this.container.addChild(rope);
      this.ropes.push({ rope, points });
    }
    this.container.visible = false;
  }
  set(alpha, path) {
    this.container.visible = alpha > 0.002;
    if (!this.container.visible) return;
    this.container.alpha = alpha;
    const out = [0, 0];
    this.ropes.forEach(({ points }, i) => {
      for (let j = 0; j < points.length; j++) {
        path(j / (points.length - 1), i, out);
        points[j].x = out[0]; points[j].y = out[1];
      }
    });
  }
  // случайная точка на случайной нити: откуда вылетают искры
  sample(out) {
    const { points } = this.ropes[(Math.random() * this.ropes.length) | 0];
    const p = points[(Math.random() * points.length) | 0];
    out[0] = p.x; out[1] = p.y;
    return out;
  }
}

export class MegaWin extends Container {
  static WIDTH = W;
  static HEIGHT = H;
  static DURATION = 10;

  /**
   * @param {object} [o]
   * @param {number}  [o.amount=1358856] итоговая сумма на счётчике
   * @param {number}  [o.density=1]      множитель частиц: 0.5 — экономно, 1.5 — максимум
   * @param {boolean} [o.loop=false]     повторять сцену каждые 10 с
   * @param {boolean} [o.background=true] тёмная подложка; false — сцена поверх твоей игры
   * @param {string}  [o.fontFamily]     шрифт надписи и цифр, по умолчанию системный; свой веб-шрифт загрузи заранее
   */
  constructor({ amount = 1358856, density = 1, loop = false, background = true, fontFamily = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif' } = {}) {
    super();
    const T = textures();
    this.amount = amount;
    this.density = density;
    this.loop = loop;
    this._t = 0;
    this._T = -1;          // время от play(); -1 — сцена не запущена
    this._acc = {};
    this._fired = new Set();
    this._shake = 0;
    this._shown = '';

    const root = (this._root = new Container());
    this.addChild(root);

    // подложка
    this._bg = new Graphics().rect(-40, -40, W + 80, H + 80).fill(0x050307);
    this._bg.visible = background;
    this._bgGlow = new Sprite(T.glow); this._bgGlow.anchor.set(0.5); this._bgGlow.position.set(CX, H * 0.45);
    this._bgGlow.blendMode = 'add'; this._bgGlow.tint = 0x6a3a08; this._bgGlow.scale.set(5.5, 3.6);
    root.addChild(this._bg, this._bgGlow);

    // лучи за надписью и прожекторы
    this._rays = new Sprite(T.rays); this._rays.anchor.set(0.5); this._rays.blendMode = 'add'; this._rays.tint = 0xffc25a;
    this._rays.position.set(CX, H * 0.3); this._rays.alpha = 0;
    root.addChild(this._rays);
    this._beams = new Container(); root.addChild(this._beams);
    this._beamList = [PINK, YELLOW, GREEN, PINK, YELLOW, GREEN].map((tint, i) => {
      const b = new Sprite(T.beam); b.anchor.set(0.5, 1); b.blendMode = 'add'; b.tint = tint;
      b.position.set(CX, H * 0.62); b.scale.set(3.2, 2.1); this._beams.addChild(b);
      return { b, base: -1.25 + i * 0.5, ph: i * 1.7 };
    });

    // частицы за надписью
    const D = Math.max(0.3, density);
    this._fw = new Pool(T.soft, Math.round(2000 * D));
    this._streaks = new Pool(T.streak, Math.round(1400 * D));
    this._dust = new Pool(T.soft, 200);
    root.addChild(this._fw.pc, this._streaks.pc, this._dust.pc);
    this._gold1 = new Ribbon(root, { strands: 12, tex: T.line, widths: [3, 2, 4, 1.5, 2.5, 2, 3.5, 1.5, 2, 3, 1.5, 2.5], tints: [0xffb648, 0xffd27a, 0xff9f2e, 0xffe2a0, 0xffc062] });
    this._goldHaze = new Ribbon(root, { strands: 2, tex: T.haze, widths: [42, 28], tints: [0x8a4d0a, 0x6a3a08] });
    this._gold2 = new Ribbon(root, { strands: 10, tex: T.line, widths: [3, 1.5, 4, 2, 2.5, 1.5, 3, 2, 5, 1.5], tints: [0xffb648, 0xffd27a, 0xffa53a, 0xffe6a8, 0xffc76a] });
    this._elec = new Ribbon(root, { strands: 6, tex: T.line, widths: [7, 3, 4.5, 7, 3, 4.5], tints: [CYAN, 0x9ff8ff, 0x3aa8ff, ORANGE, 0xffb36b, 0xff5a1a] });
    this._shell = new Pool(T.soft, Math.round(1300 * D));
    root.addChild(this._shell.pc);
    this._core = new Sprite(T.glow); this._core.anchor.set(0.5); this._core.position.set(CX, H * 0.47);
    this._core.blendMode = 'add'; this._core.tint = 0xffe2a0; root.addChild(this._core);

    // надпись и счётчик
    const text = (this._text = new Container());
    root.addChild(text);
    this._textGlow = new Sprite(T.glow); this._textGlow.anchor.set(0.5); this._textGlow.blendMode = 'add'; this._textGlow.tint = 0xb8700f;
    text.addChild(this._textGlow);
    const layout = (word, size) => {
      const glyphs = [...word].map((ch) => goldGlyph(ch, size, fontFamily));
      const gap = -size * 0.04;
      const total = glyphs.reduce((s, g) => s + g.w, 0) + gap * (glyphs.length - 1);
      let x = -total / 2;
      return glyphs.map((g) => {
        const s = new Sprite(g.tex); s.anchor.set(0.5);
        s.homeX = x + g.w / 2; x += g.w + gap;
        text.addChild(s);
        return s;
      });
    };
    this._mega = layout('MEGA', 214);
    this._win = layout('WIN', 222);
    this._digits = {};
    for (const ch of '0123456789,') this._digits[ch] = goldGlyph(ch, 128, fontFamily);
    this._digitW = Math.max(...[...'0123456789'].map((c) => this._digits[c].w)) * 0.92;
    this._counter = new Container(); text.addChild(this._counter);
    this._counterSprites = Array.from({ length: 16 }, () => { const s = new Sprite(Texture.EMPTY); s.anchor.set(0.5); this._counter.addChild(s); return s; });

    // частицы перед надписью
    this._coins = new Pool(T.coin, Math.round(520 * D), 'normal');
    this._stars = new Pool(T.star, Math.round(320 * D), 'normal');
    this._sparks = new Pool(T.soft, Math.round(1800 * D));
    this._glints = new Pool(T.glint, 80);
    root.addChild(this._coins.pc, this._stars.pc, this._sparks.pc, this._glints.pc);
    this._flash = new Sprite(T.glow); this._flash.anchor.set(0.5); this._flash.blendMode = 'add'; this._flash.alpha = 0;
    this._flare = new Sprite(T.flare); this._flare.anchor.set(0.5); this._flare.blendMode = 'add'; this._flare.alpha = 0;
    root.addChild(this._flash, this._flare);

    this._beams.visible = false; this._core.alpha = 0;
    this._pools = [this._fw, this._streaks, this._dust, this._shell, this._coins, this._stars, this._sparks, this._glints];
    this._tmp = [0, 0];
    this._hideAll();
  }

  /** Запустить сцену с начала. */
  play() {
    this._T = 0;
    this._fired.clear();
    this._acc = {};
    for (const p of this._pools) for (const it of p.items) it.alive = false;
  }

  /** Секунды от начала сцены. */
  get time() { return this._T; }

  /** Сколько частиц сейчас живо. */
  get particleCount() { return this._pools.reduce((s, p) => s + p.alive, 0); }

  /** Показать задний фон или нет (можно менять на лету). */
  set background(v) { this._bg.visible = !!v; }
  get background() { return this._bg.visible; }

  _hideAll() {
    for (const s of [...this._mega, ...this._win]) s.alpha = 0;
    this._counter.visible = false;
  }

  // испустить rate частиц в секунду, вызывая fn для каждой новой
  _emit(key, rate, dt, pool, fn) {
    this._acc[key] = (this._acc[key] || 0) + rate * dt * this.density;
    while (this._acc[key] >= 1) {
      this._acc[key] -= 1;
      const it = pool.spawn();
      if (!it) { this._acc[key] = 0; return; }
      fn(it);
    }
  }
  _once(key, T, at, fn) { if (T >= at && !this._fired.has(key)) { this._fired.add(key); fn(); } }
  _burst(n, pool, fn) { for (let i = 0, m = Math.round(n * this.density); i < m; i++) { const it = pool.spawn(); if (!it) return; fn(it, i); } }

  /** Вызывать каждый кадр. dt — секунды (в Pixi 8: ticker.deltaMS / 1000). */
  update(dt) {
    dt = Math.min(dt, 1 / 30);
    this._t += dt;
    const t = this._t;
    if (this._T >= 0) this._T += dt;
    let T = this._T;
    if (T > MegaWin.DURATION) {
      if (this.loop) { this.play(); T = 0; } else { T = MegaWin.DURATION; }
    }
    const R = (a, b) => a + (b - a) * Math.random();
    const on = T >= 0;

    // ---- непрерывные слои
    this._emit('dust', 22, dt, this._dust, (it) => {
      it.x = R(0, W); it.y = R(0, H); it.vx = R(-12, 12); it.vy = R(-22, -4);
      it.max = R(2.5, 5); it.s = R(0.04, 0.12); it.tint = mix(GOLD, GOLD_LIGHT, Math.random()); it.ph = R(0, TAU);
    });

    if (on) {
      // 0–2,3 с: звёздный взрыв лучей из центра
      const burstOn = win(T, 0, 2.35, 0.05, 0.5);
      this._once('burst0', T, 0, () => this._burst(260, this._streaks, (it) => {
        const a = R(0, TAU), sp = R(500, 1300);
        it.x = CX + Math.cos(a) * R(4, 60); it.y = H * 0.47 + Math.sin(a) * R(4, 60);
        it.vx = Math.cos(a) * sp; it.vy = Math.sin(a) * sp; it.drag = 0.9;
        it.max = R(0.9, 1.6); it.s = R(0.9, 1.6); it.tint = mix(0xff9f2e, GOLD_LIGHT, Math.random()); it.a = R(0.6, 1);
      }));
      if (burstOn > 0) {
        this._emit('rays', 520 * burstOn, dt, this._streaks, (it) => {
          const a = R(0, TAU), sp = R(320, 1100);
          it.x = CX + Math.cos(a) * R(4, 30); it.y = H * 0.47 + Math.sin(a) * R(4, 30);
          it.vx = Math.cos(a) * sp; it.vy = Math.sin(a) * sp; it.drag = 0.4;
          it.max = R(0.5, 1.15); it.s = R(0.6, 1.4); it.tint = mix(0xff9f2e, GOLD_LIGHT, Math.random()); it.a = R(0.5, 1);
        });
        this._emit('raydots', 150 * burstOn, dt, this._sparks, (it) => {
          const a = R(0, TAU), sp = R(80, 420);
          it.x = CX; it.y = H * 0.47; it.vx = Math.cos(a) * sp; it.vy = Math.sin(a) * sp; it.drag = 0.6;
          it.max = R(0.8, 1.8); it.s = R(0.1, 0.26); it.s1 = it.s; it.tint = GOLD_LIGHT; it.tw = 1;
        });
      }
      this._core.alpha = win(T, 0, 2.0, 0.05, 0.3) * (0.8 + 0.2 * Math.sin(t * 20));
      this._core.scale.set((0.35 + 0.15 * Math.sin(t * 9)) * (1 + 2.5 * win(T, 1.7, 2.1, 0.05, 0.3)));

      // 0,7–2,7 с: золотые волны нитей поперёк экрана
      const g1 = 0.75 * win(T, 0.65, 2.3, 0.5, 0.45);
      const grow = easeOutCubic((T - 0.65) / 0.9);
      this._gold1.set(g1, (u, i, out) => {
        const edge = Math.min(1, Math.abs(u - 0.5) * 2 / Math.max(0.05, 1 - grow * 0.95));   // волна выходит от краёв к центру
        const r1 = Math.sin(i * 12.9898) * 0.5 + 0.5, r2 = Math.sin(i * 78.233) * 0.5 + 0.5;   // свои параметры у каждой нити
        const amp = (55 + 50 * r1) * (0.35 + 0.65 * grow) * (0.55 + 0.45 * edge);
        out[0] = -80 + u * (W + 160);
        out[1] = H * 0.5 + Math.sin(u * TAU * (1.5 + 0.5 * r2) + t * (2.0 + r1) + i * 0.55) * amp
          + Math.sin(u * TAU * (3.5 + 2 * r1) - t * 3.1 + i) * (10 + 14 * r2) + (r2 - 0.5) * 30;
      });

      // 1,2 с: «M» в центре; 1,6–1,9 с: MEGA влетает из камеры
      const megaY = H * 0.47 - 0.11 * H * easeInOut((T - 2.65) / 0.35) - 0.16 * H * easeInOut((T - 5.4) / 0.5);
      const textScale = 1 - 0.1 * easeInOut((T - 5.4) / 0.5);
      this._mega.forEach((s, i) => {
        if (i === 0 && T >= 1.15 && T < 1.62) {
          const u = (T - 1.15) / 0.47;
          s.alpha = Math.min(1, u * 4); s.scale.set(0.6 + 0.15 * u); s.x = CX; s.y = H * 0.47;
          return;
        }
        const t0 = 1.62 + i * 0.045, u = (T - t0) / 0.24;
        if (u < 0) { if (!(i === 0 && T >= 1.15)) s.alpha = 0; return; }
        const k = easeOutCubic(u), first = i === 0;          // «M» уже в кадре: растёт из центра, остальные летят из камеры
        s.alpha = first ? 1 : Math.min(1, u * 3);
        s.scale.set(lerp(first ? 0.75 : 3.2, 1, k) * textScale);
        s.x = CX + s.homeX * lerp(first ? 0 : 2.4, 1, k) * textScale;
        s.y = megaY + (1 - k) * 40;
      });
      this._once('megaHit', T, 1.86, () => this._megaHit());

      // 2,75 с: WIN поднимается снизу
      const winY = H * 0.63 - 0.2 * H * easeInOut((T - 5.4) / 0.5);
      this._win.forEach((s, i) => {
        const t0 = 2.72 + i * 0.04, u = (T - t0) / 0.3;
        if (u < 0) { s.alpha = 0; return; }
        const k = easeOutBack(u);
        s.alpha = Math.min(1, u * 3);
        s.scale.set(lerp(2.0, 1, easeOutCubic(u)) * textScale);
        s.x = CX + s.homeX * textScale;
        s.y = lerp(H + 160, winY, k);
      });
      this._once('winHit', T, 3.0, () => { this._shake = 0.7; this._burst(140, this._sparks, (it) => this._spark(it, CX + R(-200, 200), H * 0.62 + R(-30, 30), R(0, TAU), R(150, 520))); });
      this._textGlow.position.set(CX, (megaY + winY) / 2);
      this._textGlow.scale.set(4.2 * textScale, 2.3 * textScale);
      this._textGlow.alpha = T > 1.7 ? 0.13 + 0.04 * Math.sin(t * 3) : 0;

      // 2,9–5,1 с: синие и оранжевые электрические ленты; с 4 с закручиваются вокруг надписи
      const el = win(T, 2.85, 4.95, 0.25, 0.3);
      const loopK = easeInOut((T - 3.7) / 0.5);
      const cy = H * 0.5;
      this._elec.set(el, (u, i, out) => {
        const hot = i >= 3, j = i % 3, side = hot ? Math.PI : 0;
        const wx = -60 + u * (W + 120);
        const wy = cy + Math.sin(u * TAU * 2.1 + t * (hot ? -4.2 : 4.6) + j * 0.8 + side) * (38 + j * 10) + (Math.random() - 0.5) * 7;
        const a = (hot ? -0.3 : 0.7) * Math.PI + u * TAU * (0.45 + 0.08 * j) + t * (1.4 + 0.35 * j) + j * 0.9;   // незамкнутая дуга: синяя сверху слева, оранжевая снизу справа
        const wob = Math.sin(a * 2 + t * 3.2 + j) * 34 + Math.sin(a * 5 - t * 6 + j * 2) * 10;
        const ex = CX + Math.cos(a) * (370 + j * 34 + wob);
        const ey = cy + Math.sin(a) * (185 + j * 22 + wob * 0.6) + (Math.random() - 0.5) * 6;
        out[0] = lerp(wx, ex, loopK); out[1] = lerp(wy, ey, loopK);
      });
      if (el > 0) this._emit('elecSparks', 70 * el, dt, this._sparks, (it) => {
        this._elec.sample(this._tmp);
        this._spark(it, this._tmp[0], this._tmp[1], R(0, TAU), R(20, 90));
        it.tint = Math.random() < 0.5 ? 0x9ff8ff : 0xffb36b; it.max = R(0.3, 0.6);
      });

      // монеты и звёзды
      if (T > 2.0 && T < 4.9) {
        this._emit('coinRain1', 9, dt, this._coins, (it) => this._coin(it, R(40, W - 40), -40, R(-40, 40), R(80, 200), 320, R(0.22, 0.42)));
        this._emit('starFall', 16, dt, this._stars, (it) => this._star(it, R(0, W), -20, R(-30, 30), R(60, 160)));
      }

      // 4,8–6,6 с: фейерверки и прожекторы
      const fwPlan = [[4.65, 0.22, 0.22, PINK], [4.8, 0.74, 0.2, GREEN], [4.98, 0.3, 0.5, GREEN], [5.15, 0.84, 0.44, PINK], [5.4, 0.12, 0.4, GREEN], [5.65, 0.62, 0.14, PINK], [5.9, 0.4, 0.26, VIOLET], [6.1, 0.88, 0.2, GREEN]];
      fwPlan.forEach(([at, fx, fy, col], n) => this._once('fw' + n, T, at, () => this._firework(fx * W, fy * H, col)));
      const bm = win(T, 4.6, 6.6, 0.3, 0.6);
      this._beams.visible = bm > 0;
      for (const { b, base, ph } of this._beamList) {
        b.rotation = base + Math.sin(t * 0.9 + ph) * 0.35;
        b.alpha = bm * (0.32 + 0.14 * Math.sin(t * 2.3 + ph));
      }

      // 4,9–5,6 с: фонтан монет из-под надписи
      if (T > 4.75 && T < 5.4) this._emit('fountain', 70, dt, this._coins, (it) => this._coin(it, CX + R(-80, 80), H * 0.76, R(-560, 560), R(-900, -560), 1500, R(0.34, 0.7)));

      // 5,5–10 с: золотые нити внизу, счётчик, дождь монет
      const g2 = 0.62 * win(T, 5.45, 10.5, 0.6, 0.5);
      this._gold2.set(g2, (u, i, out) => {
        const r1 = Math.sin(i * 12.9898) * 0.5 + 0.5, r2 = Math.sin(i * 78.233) * 0.5 + 0.5;
        out[0] = -100 + u * (W + 200);
        out[1] = H * 0.72 - (u - 0.5) * 160 + Math.sin(u * TAU * (0.9 + 0.5 * r1) + t * (1.0 + 0.6 * r2) + i * 0.7) * (60 + 60 * r2)
          + Math.sin(u * TAU * (2.4 + 1.6 * r2) - t * 1.8 + i * 1.3) * (14 + 24 * r1) + Math.sin(u * TAU * 7.0 + t * 3.0 + i) * 4;
      });
      this._goldHaze.set(g2 * 0.6, (u, i, out) => {
        out[0] = -100 + u * (W + 200);
        out[1] = H * 0.7 - (u - 0.5) * 140 + Math.sin(u * TAU * 1.15 + t * 1.25 + i * 0.5) * 84 + Math.sin(u * TAU * 2.9 - t * 1.8) * 22;
      });
      if (g2 > 0) this._emit('goldSparks', 260 * g2, dt, this._sparks, (it) => {
        this._gold2.sample(this._tmp);
        this._spark(it, this._tmp[0], this._tmp[1], R(0, TAU), R(10, 70));
        it.g = 40; it.max = R(0.6, 1.4); it.s = R(0.05, 0.13);
      });
      if (T > 5.6 && T < 9.7) this._emit('coinRain2', 42, dt, this._coins, (it) => {
        const depth = Math.random();
        this._coin(it, R(-20, W + 20), -60, R(-60, 60), lerp(160, 460, depth), lerp(300, 650, depth), lerp(0.2, 0.72, depth));
      });
      if (T > 6.0 && T < 9.7) this._emit('glints', 7, dt, this._glints, (it) => {
        it.x = CX + R(-420, 420); it.y = R(H * 0.12, H * 0.85); it.vx = 0; it.vy = R(-10, 10);
        it.max = R(0.35, 0.7); it.s = R(0.35, 0.8); it.tint = Math.random() < 0.3 ? 0xbfe8ff : 0xffffff; it.vr = R(-1, 1);
      });

      // счётчик
      this._counter.visible = T > 5.7;
      if (this._counter.visible) {
        const u = clamp01((T - 5.75) / 3.6);
        const value = Math.round(this.amount * (1 - Math.pow(1 - u, 6)));
        const pop = easeOutBack((T - 5.7) / 0.35);
        this._layoutCounter(value.toLocaleString('en-US'), H * 0.645, pop * (1 + 0.06 * win(T, 9.35, 9.8, 0.05, 0.4)));
      }

      // 6,8 с: лучи за надписью; 7,45 с: вспышка
      this._rays.alpha = win(T, 6.8, 10.5, 0.6, 0.5) * (0.28 + 0.06 * Math.sin(t * 1.7));
      this._rays.rotation = t * 0.12;
      this._rays.scale.set(5.2);
      const fl = win(T, 7.42, 8.0, 0.06, 0.5);
      this._flash.alpha = fl; this._flash.tint = 0xfff1c8;
      this._flash.position.set(W * 0.62, H * 0.66); this._flash.scale.set(1 + 4.2 * fl);
      this._flare.alpha = fl; this._flare.position.copyFrom(this._flash.position); this._flare.scale.set(3.4 * fl + 0.6, 2.0);
      this._once('flash', T, 7.45, () => { this._shake = 0.4; this._burst(120, this._sparks, (it) => this._spark(it, W * 0.62, H * 0.66, R(0, TAU), R(200, 700))); });

      // 8,75–9,45 с: неоновые полосы скорости
      const neon = win(T, 8.72, 9.3, 0.08, 0.2);
      if (neon > 0) this._emit('neon', 520 * neon, dt, this._streaks, (it) => {
        const a = R(0, TAU), sp = R(1500, 2600);
        it.x = CX + Math.cos(a) * R(30, 120); it.y = H * 0.45 + Math.sin(a) * R(20, 80);
        it.vx = Math.cos(a) * sp; it.vy = Math.sin(a) * sp;
        it.max = R(0.3, 0.5); it.s = R(1.6, 2.8); it.a = 1; it.thick = 0.9;
        it.tint = [PINK, CYAN, YELLOW, VIOLET, 0xff8a3a][(Math.random() * 5) | 0];
      });

      // 9,1–10 с: два искровых фонтана под счётчиком
      if (T > 9.1 && T < 9.95) for (const fx of [0.37, 0.63]) this._emit('fount' + fx, 240, dt, this._sparks, (it) => {
        it.x = fx * W + R(-14, 14); it.y = H * 0.92; it.vx = R(-90, 90); it.vy = R(-700, -420); it.g = 720;
        it.max = R(0.7, 1.1); it.s = R(0.13, 0.24); it.s1 = it.s * 0.5; it.tint = mix(GOLD, GOLD_LIGHT, Math.random()); it.tw = 1;
      });
    }

    // ---- шаг частиц
    this._dust.step(dt, (it, k, p) => {
      p.scaleX = p.scaleY = it.s; p.tint = it.tint;
      p.alpha = Math.sin(k * Math.PI) * (0.4 + 0.6 * Math.abs(Math.sin(t * 3 + it.ph)));
    });
    this._streaks.step(dt, (it, k, p) => {
      const sp = Math.hypot(it.vx, it.vy);
      p.rotation = Math.atan2(it.vy, it.vx);
      p.scaleX = (0.5 + sp / 300) * it.s * (0.5 + k * 1.6); p.scaleY = (it.thick || 0.45) * it.s;
      p.tint = it.tint; p.alpha = it.a * Math.min(1, k * 8) * (1 - k);
    });
    const dots = (it, k, p) => {
      const s = lerp(it.s, it.s1 ?? it.s, k);
      p.scaleX = p.scaleY = s; p.tint = it.tint;
      p.alpha = Math.min(1, k * 10) * (1 - k) * (it.tw ? 0.55 + 0.45 * Math.sin(it.life * 40 + it.x) : 1);
    };
    this._sparks.step(dt, dots);
    this._shell.step(dt, dots);
    this._fw.step(dt, (it, k, p) => {
      p.scaleX = p.scaleY = it.s * (1 - k * 0.5);
      p.tint = mix(0xffffff, it.tint, Math.min(1, k * 5));
      p.alpha = Math.min(1, (1 - k) * 1.4) * (0.65 + 0.35 * Math.sin(it.life * 30 + it.ph));
    });
    this._coins.step(dt, (it, k, p) => {
      it.ph += it.vr * dt;
      const c = Math.cos(it.ph), face = Math.max(0.12, Math.abs(c));
      p.scaleX = it.s * face; p.scaleY = it.s; p.rotation = it.r;
      const v = Math.round(255 * (0.5 + 0.5 * face));
      p.tint = (v << 16) | (v << 8) | v;
      p.alpha = Math.min(1, k * 12) * (k > 0.85 ? (1 - k) / 0.15 : 1);
    });
    this._stars.step(dt, (it, k, p) => {
      p.scaleX = it.s * Math.abs(Math.cos(it.life * 5 + it.ph)) + 0.05; p.scaleY = it.s; p.rotation = it.r;
      p.alpha = Math.min(1, k * 10) * (k > 0.8 ? (1 - k) / 0.2 : 1);
    });
    this._glints.step(dt, (it, k, p) => {
      const s = Math.sin(k * Math.PI);
      p.scaleX = p.scaleY = it.s * s; p.rotation = it.r; p.tint = it.tint; p.alpha = s;
    });

    // тряска на ударах
    this._shake = Math.max(0, this._shake - dt * 2.5);
    const sh = this._shake * this._shake * 16;
    this._root.position.set((Math.random() - 0.5) * 2 * sh, (Math.random() - 0.5) * 2 * sh);
  }

  // ---- кирпичики
  _spark(it, x, y, a, sp) {
    it.x = x; it.y = y; it.vx = Math.cos(a) * sp; it.vy = Math.sin(a) * sp; it.drag = 1.4; it.g = 60;
    it.max = 0.4 + Math.random() * 0.8; it.s = 0.06 + Math.random() * 0.12; it.s1 = it.s * 0.4;
    it.tint = mix(GOLD, GOLD_LIGHT, Math.random()); it.tw = Math.random() < 0.5 ? 1 : 0;
  }
  _coin(it, x, y, vx, vy, g, s) {
    it.x = x; it.y = y; it.vx = vx; it.vy = vy; it.g = g; it.drag = 0.05;
    it.s = s; it.ph = Math.random() * TAU; it.vr = (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 8);
    it.r = (Math.random() - 0.5) * 0.8; it.max = 3.5;
  }
  _star(it, x, y, vx, vy) {
    it.x = x; it.y = y; it.vx = vx; it.vy = vy; it.g = 30; it.drag = 0.2;
    it.s = 0.18 + Math.random() * 0.35; it.ph = Math.random() * TAU; it.vr = (Math.random() - 0.5) * 6; it.max = 4;
  }
  _megaHit() {
    const R = (a, b) => a + (b - a) * Math.random();
    this._shake = 1;
    // кольцо золотой пыли, разлетающееся сферой
    this._burst(1100, this._shell, (it) => {
      const a = R(0, TAU), shell = Math.random() < 0.75, sp = shell ? R(760, 860) : R(160, 760);
      it.x = CX + Math.cos(a) * 40; it.y = H * 0.47 + Math.sin(a) * 40;
      it.vx = Math.cos(a) * sp * 1.05; it.vy = Math.sin(a) * sp; it.drag = 2.2;
      it.max = R(1.3, 2.3); it.s = R(0.12, 0.3); it.s1 = it.s * 0.5; it.tint = mix(GOLD, GOLD_LIGHT, Math.random()); it.tw = 1;
    });
    this._burst(90, this._stars, (it) => { const a = R(0, TAU), sp = R(200, 700); this._star(it, CX, H * 0.47, Math.cos(a) * sp, Math.sin(a) * sp); it.drag = 1.2; });
    this._burst(26, this._coins, (it) => { const a = R(0, TAU), sp = R(450, 950); this._coin(it, CX, H * 0.47, Math.cos(a) * sp, Math.sin(a) * sp, 380, R(0.25, 0.5)); it.drag = 0.8; });
    this._burst(220, this._sparks, (it) => this._spark(it, CX + R(-60, 60), H * 0.47 + R(-30, 30), R(0, TAU), R(200, 900)));
  }
  _firework(x, y, col) {
    const R = (a, b) => a + (b - a) * Math.random();
    this._burst(380, this._fw, (it) => {
      const a = R(0, TAU), sp = R(120, 520) * (Math.random() < 0.65 ? 1 : 0.55);
      it.x = x; it.y = y; it.vx = Math.cos(a) * sp; it.vy = Math.sin(a) * sp; it.drag = 1.4; it.g = 80;
      it.max = R(1.3, 2.1); it.s = R(0.16, 0.28); it.tint = col; it.ph = R(0, TAU);
    });
    this._burst(1, this._fw, (it) => { it.x = x; it.y = y; it.vx = it.vy = 0; it.max = 0.45; it.s = 2.2; it.tint = 0xffffff; it.ph = 0; });
  }
  _layoutCounter(str, y, scale) {
    if (str !== this._shown) {
      this._shown = str;
      let x = 0;
      const xs = [];
      for (const ch of str) { const w = ch === ',' ? this._digits[','].w * 0.9 : this._digitW; xs.push(x + w / 2); x += w; }
      this._counterSprites.forEach((s, i) => {
        if (i < str.length) { s.visible = true; s.texture = this._digits[str[i]].tex; s.x = xs[i] - x / 2; s.y = 0; }
        else s.visible = false;
      });
    }
    this._counter.position.set(CX, y);
    this._counter.scale.set(scale);
  }

  destroy(options) {
    // общие текстуры не уничтожаем: их используют другие экземпляры; буквы и цифры — свои
    const own = [...this._mega, ...this._win].map((s) => s.texture).concat(Object.values(this._digits).map((d) => d.tex));
    super.destroy({ children: true, texture: false, textureSource: false, ...(typeof options === 'object' ? options : {}) });
    for (const tex of own) tex.destroy(true);
  }
}
