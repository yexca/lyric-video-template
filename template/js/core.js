'use strict';
/* Core utilities
 * The picture is a pure function of the audio time t: scrubbing, pausing and frame-by-frame export give exactly the same picture.
 * So nothing here keeps any state from the previous frame, and randomness comes from a deterministic hash.
 */
const W = 1920, H = 1080, TAU = Math.PI * 2;
const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
const lerp = (a, b, k) => a + (b - a) * k;
const prog = (t, a, b) => clamp((t - a) / (b - a));
const win = (t, a, b, fi = .3, fo = .3) => Math.min(prog(t, a, a + fi), 1 - prog(t, b - fo, b));
const E = {
  out: k => 1 - (1 - k) ** 3,
  out5: k => 1 - (1 - k) ** 5,
  in: k => k ** 3,
  inOut: k => k < .5 ? 4 * k ** 3 : 1 - (-2 * k + 2) ** 3 / 2,
  sine: k => -(Math.cos(Math.PI * k) - 1) / 2,
  back: k => { const c = 2.2; return 1 + (c + 1) * (k - 1) ** 3 + c * (k - 1) ** 2; },
  expo: k => k >= 1 ? 1 : 1 - 2 ** (-10 * k),
  elastic: k => k <= 0 ? 0 : k >= 1 ? 1 : 2 ** (-10 * k) * Math.sin((k * 10 - .75) * TAU / 3) + 1,
};
// Pops in over d seconds from t0 (0 → slight overshoot → 1): for scaling labels, icons and cards
const pop = (t, t0, d = .3) => E.back(prog(t, t0, t0 + d));

// Deterministic random
function hash(i, s = 0) {
  let h = (Math.floor(i) * 374761393 + Math.floor(s) * 668265263 + 1013904223) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const hr = (i, s, a, b) => lerp(a, b, hash(i, s));
function noise(x, s = 0) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash(i, s), hash(i + 1, s), u) * 2 - 1;
}

/* ---------- Colour ---------- */
const _rgb = {};
function rgb(hex) {
  if (_rgb[hex]) return _rgb[hex];
  const n = parseInt(hex.slice(1), 16);
  return (_rgb[hex] = [n >> 16 & 255, n >> 8 & 255, n & 255]);
}
const rgba = (hex, a) => `rgba(${rgb(hex).join(',')},${a})`;
function mix(a, b, k) {
  const A = rgb(a), B = rgb(b), k2 = clamp(k);
  return '#' + A.map((v, i) => Math.round(lerp(v, B[i], k2)).toString(16).padStart(2, '0')).join('');
}

/* ---------- Palette: neutral greys only, so the engine suggests no look. Each work defines its own colours in its own
 * version (add keys here or keep a palette of its own); the engine itself uses only bg / fg / mid / light / white. ---------- */
const C = {
  bg: '#ffffff', fg: '#111111', dark: '#3a3a3a', mid: '#8a8a8a', light: '#e4e4e4', white: '#ffffff', black: '#000000',
};

/* ---------- Audio analysis (tools/analyze.py → data/derived/analysis.js) ----------
 * With no analysis data yet (empty template): every band reads 0 and the beat runs at 120 BPM, so the picture still moves.
 */
const AU = {
  d: window.ANALYSIS || null,
  barOff: 0,          // which beat the bar's downbeat falls on (0–3); same as bar_offset in project.json, set by each version in its storyboard
  val(k, t) {
    if (!this.d) return 0;
    const a = this.d[k], f = t * this.d.fps, i = Math.floor(f);
    if (i < 0) return a[0];
    if (i >= a.length - 1) return a[a.length - 1];
    return lerp(a[i], a[i + 1], f - i);
  },
  avg(k, t, w = .15) { let s = 0; for (let i = 0; i < 5; i++) s += this.val(k, t - w + i * w / 2); return s / 5; },
  get P() { return 60 / (this.d ? this.d.bpm : 120); },
  get phase() { return this.d ? this.d.phase : 0; },
  beat(t) { return (t - this.phase) / this.P; },
  // A pulse once every `every` beats, decaying at rate k (off = beat offset)
  pulse(t, every = 1, off = 0, k = 8) {
    const b = this.beat(t) - off, r = ((b % every) + every) % every;
    return b < 0 ? 0 : Math.exp(-k * r * this.P);
  },
  bar(t) { return this.pulse(t, 4, this.barOff, 4); },
  kick(t) { return clamp((this.val('onset', t) - .25) * 1.6) * clamp(this.val('low', t) * 1.3); },
};
const BT = n => AU.phase + n * AU.P;

/* ---------- Lyric times (lyric-tool/lyrics.py → js/lyrics.js) ---------- */
const LYR = window.LYRICS || [];
// References to a line / phrase that doesn't exist (line numbers change once lines are merged or deleted in the timing tool) are recorded: reported at startup, and they block frame grabs and export.
// Otherwise the time would silently become 0 s and the shot order would go wrong with it. An empty template with no lyrics yet doesn't count.
const LBAD = new Set();
const _lpart = (i, k) => { const l = LYR[i], p = l && l[2][k < 0 ? l[2].length + k : k]; if (!p && LYR.length) LBAD.add(l ? `${i} (phrase ${k})` : String(i)); return p; };
const LT = (i, k = 0) => { const p = _lpart(i, k); return p ? p[1] : 0; };    // phrase starts being sung
const LE = (i, k = -1) => { const p = _lpart(i, k); return p ? p[2] : 0; };   // phrase's singing ends
const LL = i => { if (!LYR[i] && LYR.length) LBAD.add(String(i)); return LYR[i] ? LYR[i][1] : 0; };   // whole line over
// Fill progress 0..1 (interpolated across the 9 keyframes that follow the vocals)
function fillAt(part, t) {
  const k = part[3];
  if (t <= k[0]) return 0;
  if (t >= k[8]) return 1;
  for (let i = 0; i < 8; i++) if (t < k[i + 1]) return (i + (t - k[i]) / Math.max(1e-3, k[i + 1] - k[i])) / 8;
  return 1;
}
// The time at which progress reaches q (for characters appearing one by one)
// part[4] holds the time each character appears, taken from the per-mora timeline; q = i / character count lands exactly on character i
function timeAt(part, q) {
  const ct = part[4];
  if (ct && ct.length) {
    const n = ct.length, f = clamp(q) * n, i = Math.floor(f);
    if (i >= n) return part[2];
    return lerp(ct[i], i + 1 < n ? ct[i + 1] : part[2], f - i);
  }
  const k = part[3], f = clamp(q) * 8, i = Math.min(7, Math.floor(f));
  return lerp(k[i], k[i + 1], f - i);
}
// The moment character k of phrase pi in line li is sung: for tying events in the picture to characters (the graphic or label appears when that word is sung)
const LCT = (li, k, pi = 0) => { const p = _lpart(li, pi); return p ? timeAt(p, k / Array.from(p[0]).length) : 0; };
// Cuts land on beats: CUT(t) = the nearest beat before t; DOWN(t) = the next bar line after t (the downbeat, counting 4 beats to the bar from AU.barOff);
// LCUT(li, pi) = the nearest beat before this line starts being sung (the cut point when each line gets its own shot)
const CUT = t => BT(Math.floor(AU.beat(t) + 1e-6));
const DOWN = t => BT(Math.ceil((AU.beat(t) - AU.barOff) / 4 - 1e-6) * 4 + AU.barOff);
const LCUT = (li, pi = 0, lead = .04) => CUT(LT(li, pi) - lead);

/* ---------- Fonts (to change fonts, edit this table together with the font link in index.html; boot in main.js preloads from this table) ---------- */
const F = {
  // Noto Sans SC comes last: it covers any Simplified Chinese characters the Japanese fonts lack
  min: '"Shippori Mincho B1", "Yu Mincho", "Noto Sans SC", serif',
  dela: '"Dela Gothic One", "Zen Kaku Gothic New", "Noto Sans SC", sans-serif',
  goth: '"Zen Kaku Gothic New", "Yu Gothic", "Noto Sans SC", sans-serif',
  en: '"Cormorant Garamond", "Shippori Mincho B1", serif',
  sc: '"Noto Sans SC", "Microsoft YaHei", sans-serif',
};
const FW = { min: 800, dela: 400, goth: 700, en: '600 italic', sc: 500 };
const font = (f, size, w) => `${w ?? FW[f] ?? 700} ${size}px ${F[f] || f}`;

function txt(c, s, x, y, o = {}) {
  c.save();
  c.font = font(o.f || 'min', o.size || 48, o.w);
  c.textAlign = o.align || 'center';
  c.textBaseline = o.base || 'middle';
  c.letterSpacing = (o.ls || 0) + 'px';
  if (o.alpha != null) c.globalAlpha *= o.alpha;
  if (o.rot) { c.translate(x, y); c.rotate(o.rot); x = y = 0; }
  if (o.sh) { c.fillStyle = o.sh; c.fillText(s, x + (o.shx ?? o.size * .06), y + (o.shy ?? o.size * .06)); }
  if (o.stroke) { c.lineJoin = 'round'; c.lineWidth = o.sw || 6; c.strokeStyle = o.stroke; c.strokeText(s, x, y); }
  c.fillStyle = o.color || C.fg;
  c.fillText(s, x, y);
  c.restore();
}
const _mw = {};
function measure(c, s, size, f = 'min', w) {
  const key = s + '|' + size + '|' + f + '|' + w;
  if (_mw[key] != null) return _mw[key];
  c.save(); c.font = font(f, size, w); c.letterSpacing = '0px';
  const m = c.measureText(s).width; c.restore();
  return (_mw[key] = m);
}

/* ---------- Offscreen / textures ---------- */
function canvas(w, h) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; return cv; }
const OFF = {};
function offscreen(name, w = W, h = H) {
  let cv = OFF[name];
  if (!cv) cv = OFF[name] = canvas(w * RS, h * RS);       // allocated at render scale; drawn back at logical size when used
  const g = cv.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.filter = 'none'; g.imageSmoothingQuality = 'high';
  g.clearRect(0, 0, cv.width, cv.height);
  g.setTransform(RS, 0, 0, RS, 0, 0);
  return [cv, g];
}

// Film grain: 4 tiles in rotation. The black-and-white noise carries its own alpha, so plain source-over is enough (the overlay blend needs a full-screen copy on some GPU paths, which is slow)
const GRAIN = [];
for (let k = 0; k < 4; k++) {
  const cv = canvas(256, 256), g = cv.getContext('2d'), im = g.createImageData(256, 256);
  for (let i = 0; i < 256 * 256; i++) {
    const v = hash(i, 500 + k), w = v > .5 ? 255 : 0;
    im.data[i * 4] = im.data[i * 4 + 1] = im.data[i * 4 + 2] = w; im.data[i * 4 + 3] = Math.abs(v - .5) * 2 * 255;
  }
  g.putImageData(im, 0, 0);
  GRAIN.push(cv);
}
// Textures converted to ImageBitmaps (they stay in GPU memory; drawing a canvas directly re-uploads it every frame)
const TEX = {};
async function prepareTextures() {
  try {
    TEX.grain = await Promise.all(GRAIN.map(g => createImageBitmap(g)));
  } catch (e) { console.warn('ImageBitmap unavailable', e); }
}
// Halftone dot pattern
const DOT = {};
function dotPattern(c, col, step = 14, r = 3) {
  const key = col + step + '/' + r;
  if (!DOT[key]) {
    const cv = canvas(step, step), g = cv.getContext('2d');
    g.fillStyle = col; g.beginPath(); g.arc(step / 2, step / 2, r, 0, TAU); g.fill();
    DOT[key] = cv;
  }
  return c.createPattern(DOT[key], 'repeat');
}

const Q = new URLSearchParams(location.search);
const EXPORT = Q.has('export');
// Render scale (?scale=2 → a 3840×2160 canvas, for 4K export). All drawing still uses 1920×1080 logical coordinates, scaled up as a whole each frame
const RS = Math.max(1, Math.min(4, +(Q.get('scale') || 1)));
