'use strict';
/* Kinetic lyrics engine: the lyrics are the main subject of the picture.
 * Each character appears at the moment it is sung (worked out per character from the fill keyframes in lyrics.js), never earlier.
 *
 * lyric(c, t, cfg)
 *   li          line number (index into LYR)
 *   parts       which phrases to use (default: all); each phrase is one row (horizontal) or one column (vertical)
 *   x, y        centre of the block; pos: [{x, y, size, dir, align, rot}] overrides per phrase
 *   dir         'h' horizontal | 'v' vertical (columns run right to left)
 *   size, f     font size, font (min / dela / goth)
 *   color, sh   text colour, flat drop shadow colour (a misregistered-print look); stroke / sw for a stroke
 *   hl          colour of the character being sung (fades back to color once sung)
 *   emph        { character: { s (scale), col, f } }
 *   anim        pop | drop | rise | stamp | slide | spin | type
 *   out         up | fade | fall | scatter | wipe | cut (the exit, after tOut)
 *   tIn, tOut   display window (default: from .05s before the line starts being sung until just before the next line starts)
 *   max         maximum length of a row / column; anything longer wraps after a particle
 *   bounce      size of the small hop on each beat
 *   fx(g, t, d) custom per-character transform, returns { dx, dy, s, r, a, col }
 */
let lyricsOn = true;
const VROT = 'ー〜…「」『』（）《》—―-';
const SMALL = 'ゃゅょっャュョッぁぃぅぇぉァィゥェォ';
const BREAK_AFTER = 'をはがのにでともへやらてだよさ';
const _lay = new WeakMap();

function splitRun(chars, widths, max) {
  const total = widths.reduce((a, b) => a + b, 0);
  if (total <= max) return [chars.map((_, i) => i)];
  const rows = Math.ceil(total / max), out = [];
  let start = 0;
  for (let r = 1; r < rows; r++) {
    const target = total * r / rows;
    let acc = 0, best = -1, bestScore = 1e9;
    for (let i = 0; i < chars.length - 1; i++) {
      acc += widths[i];
      if (i < start) continue;
      const score = Math.abs(acc - target) - (BREAK_AFTER.includes(chars[i]) ? widths[i] * 1.5 : 0) + (SMALL.includes(chars[i + 1]) || 'ー？、。」'.includes(chars[i + 1]) ? 1e5 : 0);
      if (score < bestScore) { bestScore = score; best = i; }
    }
    out.push(Array.from({ length: best + 1 - start }, (_, k) => start + k));
    start = best + 1;
  }
  out.push(Array.from({ length: chars.length - start }, (_, k) => start + k));
  return out;
}

// Text that isn't lyrics (titles etc.): text is a string or an array; characters appear one by one from t0, step seconds apart
function sourceLine(cfg) {
  if (!cfg.text) { if (!LYR[cfg.li] && LYR.length) LBAD.add(String(cfg.li)); return LYR[cfg.li]; }
  if (cfg._line) return cfg._line;
  const texts = [].concat(cfg.text), t0s = [].concat(cfg.t0 ?? 0), step = cfg.step ?? AU.P / 2, parts = [];
  texts.forEach((s, i) => {
    const n = Array.from(s).length, a = t0s[i] ?? (parts.length ? parts[parts.length - 1][2] + step * 2 : 0), b = a + n * step;
    parts.push([s, a, b, Array.from({ length: 9 }, (_, j) => a + (b - a) * j / 8)]);
  });
  return (cfg._line = [parts[0][1], parts[parts.length - 1][2], parts]);
}

function layout(c, cfg) {
  if (_lay.has(cfg)) return _lay.get(cfg);
  const line = sourceLine(cfg); if (!line) return [];
  const parts = cfg.parts || line[2].map((_, i) => i);
  const glyphs = [], blocks = [];
  parts.forEach((pi, n) => {
    const part = line[2][pi]; if (!part) return;
    const p = Object.assign({}, cfg, (cfg.pos && cfg.pos[n]) || {});
    const chars = Array.from(part[0]), dir = p.dir || 'h', f = p.f || 'min', size = p.size || 96;
    const em = ch => (p.emph && p.emph[ch]) || {};
    const ws = chars.map(ch => dir === 'h' ? measure(c, ch, size * (em(ch).s || 1), em(ch).f || f, em(ch).w) + (p.ls || 0) : size * (em(ch).s || 1) * (p.lh || 1.04));
    const runs = splitRun(chars, ws, p.max || (dir === 'h' ? W * .86 : H * .82));
    const rowGap = size * (p.gap || 1.25);
    const items = [];
    runs.forEach((run, r) => {
      const len = run.reduce((a, i) => a + ws[i], 0);
      let cur = p.align === 'left' || p.align === 'top' ? 0 : p.align === 'right' || p.align === 'bottom' ? -len : -len / 2;
      for (const i of run) {
        const s = size * (em(chars[i]).s || 1), ch = chars[i];
        const g = { ch, part, pi, i, n: chars.length, f: em(ch).f || f, w: em(ch).w, size: s, col: em(ch).col || p.color || C.ink,
          q: dir === 'h' ? cur + ws[i] / 2 : cur + ws[i] / 2, r, rot: 0, ox: 0, oy: 0, p };
        if (dir === 'v') {
          if (VROT.includes(ch)) g.rot = Math.PI / 2;
          if (SMALL.includes(ch)) { g.ox = s * .1; g.oy = -s * .1; }
          if ('、。'.includes(ch)) { g.ox = s * .32; g.oy = -s * .32; }
        }
        cur += ws[i];
        items.push(g);
      }
    });
    const nr = runs.length;
    for (const g of items) {
      const across = (g.r - (nr - 1) / 2) * rowGap;
      if (dir === 'h') { g.lx = g.q; g.ly = across; } else { g.lx = -across; g.ly = g.q; }
      g.t = timeAt(part, g.i / g.n);
    }
    blocks.push({ p, items, dir, nr, rowGap });
  });
  // Several phrases: without pos they are laid out one after another along the direction (horizontal: top to bottom; vertical: right to left)
  const sgap = (cfg.size || 96) * (cfg.sgap ?? .15);
  let total = 0;
  blocks.forEach(b => { b.extent = b.nr * b.rowGap; total += b.extent; });
  total += (blocks.length - 1) * sgap;
  let acc = -total / 2;
  blocks.forEach((b, n) => {
    const own = cfg.pos && cfg.pos[n];
    const mid = acc + b.extent / 2; acc += b.extent + sgap;
    const bx = own && own.x != null ? own.x : (cfg.dir === 'v' ? (cfg.x ?? W / 2) - mid : (cfg.x ?? W / 2));
    const by = own && own.y != null ? own.y : (cfg.dir === 'v' ? (cfg.y ?? H / 2) : (cfg.y ?? H / 2) + mid);
    for (const g of b.items) {
      g.x = bx + g.lx; g.y = by + g.ly; g.brot = b.p.rot || 0; g.bx = bx; g.by = by;
      if (b.p.arc) {      // text set along an arc: arc = { cx, cy, r, a (centre angle) }
        const A = b.p.arc, ang = A.a + (g.lx) / A.r * (A.dir || 1), rr = A.r - g.ly;
        g.x = A.cx + Math.cos(ang) * rr; g.y = A.cy + Math.sin(ang) * rr; g.rot = ang + Math.PI / 2 * (A.dir || 1); g.brot = 0;
      }
      glyphs.push(g);
    }
  });
  if (cfg.place) glyphs.forEach((g, i) => cfg.place(g, i));
  _lay.set(cfg, glyphs);
  return glyphs;
}

function lyricWindow(cfg) {
  const line = sourceLine(cfg); if (!line) return [0, 0];
  const parts = cfg.parts || line[2].map((_, i) => i);
  const nextStart = !cfg.text && LYR[cfg.li + 1] ? LYR[cfg.li + 1][0] : line[1] + 1.5;
  const t0 = cfg.tIn ?? line[2][parts[0]][1] - .05;
  const t1 = cfg.tOut ?? Math.min(nextStart - .08, line[1] + 1.2);
  return [t0, t1];
}

function lyric(c, t, cfg) {
  if (!lyricsOn && !cfg.always) return;
  const [t0, t1] = lyricWindow(cfg);
  if (t < t0 - .1 || t > t1 + 1.2) return;
  const G = layout(c, cfg), anim = cfg.anim || 'pop', out = cfg.out || 'up';
  const bounce = (cfg.bounce ?? .03) * AU.pulse(t, 1, 0, 12);
  c.save();
  if (cfg.alpha != null) c.globalAlpha *= cfg.alpha;
  for (const g of G) {
    const d = t - g.t + (cfg.lead || 0);
    if (d < 0) { if (cfg.ghost) drawGlyph(c, g, 0, 0, 1, 0, cfg.ghost, g.col, true); continue; }
    const k = clamp(d / (cfg.dur || .22));
    let dx = 0, dy = 0, s = 1, r = 0, a = clamp(d / .05), col = g.col;
    if (anim === 'pop') s = lerp(1.8, 1, E.back(k));
    else if (anim === 'drop') { dy = -g.size * .9 * (1 - E.out(k)); a = clamp(d / .1); }
    else if (anim === 'rise') { dy = g.size * .5 * (1 - E.out(k)); a = clamp(d / .15); }
    else if (anim === 'stamp') { s = lerp(2.8, 1, E.out5(k)); r = (hash(g.i, g.pi + 3) - .5) * .3 * (1 - k); }
    else if (anim === 'slide') { dx = g.size * 1.4 * (1 - E.out(k)); a = clamp(d / .08); }
    else if (anim === 'spin') { r = -1.4 * (1 - E.out(k)); s = lerp(.2, 1, E.back(k)); }
    if (cfg.hl) col = mix(cfg.hl, g.col, clamp((d - .1) / .4));
    // Exit
    const dOut = t - t1 - (out === 'wipe' ? (g.x - W * .1) / W * .35 : g.i * .012);
    if (dOut > 0) {
      const ko = clamp(dOut / (cfg.outDur || .35));
      if (out === 'cut') a = 0;
      else if (out === 'fade') a *= 1 - ko;
      else if (out === 'up') { dy -= g.size * .7 * E.in(ko); a *= 1 - ko; }
      else if (out === 'wipe') { s *= 1 - E.in(ko); }
      else if (out === 'fall') { dy += ko * ko * 900; r += (hash(g.i, g.pi) - .5) * 3 * ko; a *= 1 - clamp((ko - .6) / .4); }
      else if (out === 'scatter') {
        const ang = hash(g.i, g.pi + 11) * TAU;
        dx += Math.cos(ang) * 900 * E.out(ko); dy += Math.sin(ang) * 600 * E.out(ko) + ko * ko * 300; r += (hash(g.i, 12) - .5) * 6 * ko; a *= 1 - ko;
      }
      if (ko >= 1 || a <= 0) continue;
    }
    if (cfg.fx) { const m = cfg.fx(g, t, d); if (m) { dx += m.dx || 0; dy += m.dy || 0; s *= m.s ?? 1; r += m.r || 0; a *= m.a ?? 1; if (m.col) col = m.col; } }
    s *= 1 + bounce;
    drawGlyph(c, g, dx, dy, s, r, a, col, false, cfg, anim === 'stamp' && d < .12 ? 1 - d / .12 : 0);
  }
  c.restore();
}

function drawGlyph(c, g, dx, dy, s, r, a, col, ghost, cfg = g.p, split = 0) {
  if (a <= 0 || s <= 0) return;
  c.save();
  if (g.brot) { c.translate(g.bx, g.by); c.rotate(g.brot); c.translate(-g.bx, -g.by); }
  c.translate(g.x + g.ox + dx, g.y + g.oy + dy); c.rotate(g.rot + r); c.scale(s, s);
  c.globalAlpha *= a;
  c.font = font(g.f, g.size, g.w); c.textAlign = 'center'; c.textBaseline = 'middle';
  if (ghost) { c.globalAlpha = typeof a === 'number' ? a : .15; c.fillStyle = typeof ghost === 'string' ? ghost : col; c.fillText(g.ch, 0, 0); c.restore(); return; }
  const p = g.p;
  if (split > 0) {     // colour plates out of register at the instant the stamp lands
    c.globalAlpha = a * split * .8;
    c.fillStyle = '#18e0ff'; c.fillText(g.ch, -g.size * .06 * split, 0);
    c.fillStyle = '#ff2e88'; c.fillText(g.ch, g.size * .06 * split, 0);
    c.globalAlpha = a;
  }
  if (p.sh) { c.fillStyle = p.sh; c.fillText(g.ch, g.size * (p.shx ?? .055), g.size * (p.shy ?? .055)); }
  if (p.stroke) { c.lineJoin = 'round'; c.lineWidth = p.sw || g.size * .1; c.strokeStyle = p.stroke; c.strokeText(g.ch, 0, 0); }
  c.fillStyle = col; c.fillText(g.ch, 0, 0);
  c.restore();
}

// A one-line caption (lyrics written on a ledge / caption strip at the bottom of the picture): this line's phrases are laid out left to right in a single row; returns a config for lyric().
// o: x (centre of the row, default: centre of the picture), y (default: 91% of the picture height), width (the most the row may take up, default: 81% of the picture width), maxSize (font size cap, default 78),
//    size (set the font size directly), parts (use only these phrases), ls (letter spacing); everything else is merged into the config as is (f, color, stroke, hl, anim, tOut…)
function CAP(li, o = {}) {
  const parts = (LYR[li] ? LYR[li][2] : []).filter((_, i) => !o.parts || o.parts.includes(i)), n = parts.reduce((a, p) => a + Array.from(p[0]).length, 0);
  const ls = o.ls || 0, size = o.size || Math.min(o.maxSize || 78, Math.floor((o.width || W * .81) / Math.max(1, n + parts.length - 1) - ls)), gap = size * .7;
  const ws = parts.map(p => Array.from(p[0]).length * (size + ls)), total = ws.reduce((a, b) => a + b, 0) + gap * (parts.length - 1);
  let x = (o.x ?? W / 2) - total / 2;
  const pos = ws.map(w => { const p = { x: x + w / 2, y: o.y ?? Math.round(H * .91) }; x += w + gap; return p; });
  return Object.assign({ li, size, pos, max: W, out: 'fade', outDur: .18 }, o);
}
// Your own text (not lyrics) popping in one character at a time: one character every step seconds from t0. Call it inside draw(), so it moves together with panels and labels.
// o: size, f, w (font weight), color, stroke, sw, alpha, ls, align ('left' | 'right', default: centred). The characters used must be listed in EXTRA_TEXT
function typeOn(c, s, x, y, t, t0, step, o = {}) {
  const chars = Array.from(s), size = o.size || 48, f = o.f || 'goth', w = o.w;
  const ws = chars.map(ch => measure(c, ch, size, f, w) + (o.ls || 0)), total = ws.reduce((a, b) => a + b, 0);
  let cx = o.align === 'left' ? x : o.align === 'right' ? x - total : x - total / 2;
  chars.forEach((ch, i) => {
    const d = t - t0 - i * step;
    if (d > 0) { const k = E.back(clamp(d / .2)); c.save(); c.translate(cx + ws[i] / 2, y); c.scale(k, k); txt(c, ch, 0, 0, { f, size, w, color: o.color, stroke: o.stroke, sw: o.sw, alpha: o.alpha }); c.restore(); }
    cx += ws[i];
  });
}
// Whether a line has appeared yet (for syncing imagery in the picture to it): returns the seconds since character k of that phrase appeared
function charAge(li, pi, k, t) {
  const part = LYR[li] && LYR[li][2][pi]; if (!part) return -1;
  return t - timeAt(part, k / Array.from(part[0]).length);
}
