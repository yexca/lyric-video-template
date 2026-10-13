'use strict';
/* Lyric-overlap check: frame by frame, records where every lyric character is and where other text (txt) and text boxes (bubble) are, and finds the places with "text over text".
 * Injected into the page and run by tools/overlap.cjs (or paste the whole thing into the browser console, then OVERLAP.run(150, 165)).
 *  - Positions are all converted to canvas pixels (current transform included); text is measured by the glyph's actual ink extent (actualBoundingBox), not its full cell.
 *  - Tracks clip: parts that are clipped away and invisible don't count (something drawn inside a box, the bit that sticks out of it).
 *  - Not counted: anything with alpha < .35 (faint watermarks, large background lettering); bubble/txt with backdrop: true (the lyrics are meant to be written inside those).
 *  - Two lines of lyrics covering each other are reported too (lyric×lyric).
 *  - Lyrics covering a face are reported too (face:…): for a figure image with a transparent background the head position is estimated from the alpha channel (roughly the top 1/5 of the figure's height, centred on the opaque pixels);
 *    for a card with face: true the middle block is taken. It counts only when lyrics cover more than 12% of the head's area.
 *  - Only things drawn in the same shot are compared: during a transition the old and new shots overlap by design, so that doesn't count.
 *  - With contrast: true it also checks for "text too close to the colour behind it": before each character is drawn, the pixels already painted underneath it are read
 *    and the contrast (WCAG) between text colour and background is computed; with a stroke, whichever of text colour and stroke colour contrasts more is used; below 1.6 is reported as contrast.
 *  - Two drawing functions the engine doesn't have, which are checked as well when a version adds them (js/props.js); names and parameters follow the convention here:
 *      bubble(c, x, y, w, h, tx, ty, col, o)   a text box centred on (x, y), w wide and h high
 *      sticker(c, key, x, y, h, o)             a figure image with a transparent background, bottom-edge midpoint at (x, y), height h; IMG[key].head = [x0, y0, x1, y1] (0..1) can give the head region directly
 *    When a version doesn't define these two functions, the corresponding checks are skipped automatically.
 */
(() => {
  for (const name of ['bubble', 'sticker']) if (typeof window[name] !== 'function') window[name] = () => {};
  const CP = CanvasRenderingContext2D.prototype;
  let rec = null, S = new WeakMap(), seg = null;
  const full = c => c.canvas && c.canvas.width === W && c.canvas.height === H;
  const st = c => { let s = S.get(c); if (!s) S.set(c, s = { clip: null, stack: [], path: [] }); return s; };
  const xf = (c, pts) => { const m = c.getTransform(); return pts.map(([x, y]) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f]); };
  const aabb = pts => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const [x, y] of pts) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
    return [x0, y0, x1, y1];
  };
  const box = (c, x0, y0, x1, y1) => aabb(xf(c, [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]));
  const isect = (a, b) => !a ? b : !b ? a : [Math.max(a[0], b[0]), Math.max(a[1], b[1]), Math.min(a[2], b[2]), Math.min(a[3], b[3])];
  const area = b => (b[2] > b[0] && b[3] > b[1] ? (b[2] - b[0]) * (b[3] - b[1]) : 0);
  const clipped = (c, b) => isect(isect(st(c).clip, b), [0, 0, W, H]);     // off-screen parts don't count

  // ---- clip tracking: the path's bounding box; save/restore in pairs ----
  const hook = (name, f) => { const o = CP[name]; CP[name] = function (...a) { if (rec && full(this)) f(this, a); return o.apply(this, a); }; };
  const pts = (c, list) => { st(c).path.push(...xf(c, list)); };
  hook('beginPath', c => { st(c).path = []; });
  hook('rect', (c, [x, y, w, h]) => pts(c, [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]));
  hook('roundRect', (c, [x, y, w, h]) => pts(c, [[x, y], [x + w, y], [x, y + h], [x + w, y + h]]));
  hook('arc', (c, [x, y, r]) => pts(c, [[x - r, y - r], [x + r, y - r], [x - r, y + r], [x + r, y + r]]));
  hook('ellipse', (c, [x, y, rx, ry]) => { const r = Math.max(rx, ry); pts(c, [[x - r, y - r], [x + r, y - r], [x - r, y + r], [x + r, y + r]]); });
  hook('moveTo', (c, [x, y]) => pts(c, [[x, y]]));
  hook('lineTo', (c, [x, y]) => pts(c, [[x, y]]));
  hook('quadraticCurveTo', (c, a) => pts(c, [[a[0], a[1]], [a[2], a[3]]]));
  hook('bezierCurveTo', (c, a) => pts(c, [[a[0], a[1]], [a[2], a[3]], [a[4], a[5]]]));
  hook('clip', (c, a) => { const s = st(c); if (!(a[0] instanceof Path2D) && s.path.length) s.clip = isect(s.clip, aabb(s.path)); });
  hook('save', c => { const s = st(c); s.stack.push(s.clip); });
  hook('restore', c => { const s = st(c); s.clip = s.stack.length ? s.stack.pop() : null; });

  const ink = (c, s) => { const m = c.measureText(s); return [-m.actualBoundingBoxLeft, -m.actualBoundingBoxAscent, m.actualBoundingBoxRight, m.actualBoundingBoxDescent]; };

  // ---- contrast ----
  let CONTRAST = false;
  const lum = col => {     // '#rrggbb' or rgb()/rgba() (alpha ignored)
    let rgb;
    const m = String(col).match(/^#([0-9a-f]{6})$/i), m2 = String(col).match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
    if (m) rgb = [0, 2, 4].map(i => parseInt(m[1].slice(i, i + 2), 16));
    else if (m2) rgb = [m2[1], m2[2], m2[3]].map(Number);
    else return null;
    const v = rgb.map(u => u / 255).map(u => (u <= .03928 ? u / 12.92 : ((u + .055) / 1.055) ** 2.4));
    return .2126 * v[0] + .7152 * v[1] + .0722 * v[2];
  };
  const ratio = (a, b) => (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  function bgLum(c, b) {
    const x0 = Math.max(0, Math.floor(b[0])), y0 = Math.max(0, Math.floor(b[1])), x1 = Math.min(W, Math.ceil(b[2])), y1 = Math.min(H, Math.ceil(b[3]));
    if (x1 - x0 < 4 || y1 - y0 < 4) return null;
    const d = c.getImageData(x0, y0, x1 - x0, y1 - y0).data, L = [];
    for (let i = 0; i < d.length; i += 4 * 7) {
      const v = [d[i], d[i + 1], d[i + 2]].map(u => u / 255).map(u => (u <= .03928 ? u / 12.92 : ((u + .055) / 1.055) ** 2.4));
      L.push(.2126 * v[0] + .7152 * v[1] + .0722 * v[2]);
    }
    L.sort((a, b) => a - b); return L[L.length >> 1];
  }

  // ---- lyrics ----
  const _dg = window.drawGlyph;
  window.drawGlyph = function (c, g, dx, dy, s, r, a, col, ghost) {
    if (rec && full(c) && !ghost && a * c.globalAlpha > .3 && s > 0) {
      c.save();
      if (g.brot) { c.translate(g.bx, g.by); c.rotate(g.brot); c.translate(-g.bx, -g.by); }
      c.translate(g.x + g.ox + dx, g.y + g.oy + dy); c.rotate(g.rot + r); c.scale(s, s);
      c.font = font(g.f, g.size, g.w); c.textAlign = 'center'; c.textBaseline = 'middle';
      const [x0, y0, x1, y1] = ink(c, g.ch);
      const gb = clipped(c, box(c, x0, y0, x1, y1));
      rec.lyr.push({ b: gb, ch: g.ch, p: g.p, seg });
      c.restore();
      if (CONTRAST && area(gb) > 400 && c.canvas === document.getElementById('cv')) {
        const p = g.p, fg = lum(col), sk = p.stroke ? lum(p.stroke) : null, bg = bgLum(c, gb);
        const r = fg == null || bg == null ? 99 : Math.max(ratio(fg, bg), sk != null ? ratio(sk, bg) : 0);
        if (r < 1.6) rec.low.push({ seg, ch: g.ch, r });
      }
    }
    return _dg.apply(this, arguments);
  };
  // ---- text boxes (optional) ----
  const _bb = window.bubble;
  window.bubble = function (c, x, y, w, h, tx, ty, col, o = {}) {
    if (rec && full(c) && !o.backdrop && c.globalAlpha >= .35) {
      const k = o.spiky ? 1.25 : 1;
      rec.obj.push({ seg, k: 'bubble', b: clipped(c, box(c, x - w / 2 * k, y - h / 2 * k, x + w / 2 * k, y + h / 2 * k)) });
    }
    return _bb.apply(this, arguments);
  };
  // ---- other text ----
  const _tx = window.txt;
  window.txt = function (c, s, x, y, o = {}) {
    s = String(s);
    if (rec && full(c) && !o.backdrop && s.trim() && c.globalAlpha * (o.alpha ?? 1) >= .35 && !/rgba\([^)]*,\s*0?\.[0-3]\d*\)/.test(String(o.color || ''))) {
      c.save();
      c.font = font(o.f || 'min', o.size || 48, o.w); c.textAlign = o.align || 'center'; c.textBaseline = o.base || 'middle'; c.letterSpacing = (o.ls || 0) + 'px';
      let X = x, Y = y; if (o.rot) { c.translate(x, y); c.rotate(o.rot); X = Y = 0; }
      const [x0, y0, x1, y1] = ink(c, s);
      rec.obj.push({ seg, k: 'txt"' + s.slice(0, 12) + '"', b: clipped(c, box(c, X + x0, Y + y0, X + x1, Y + y1)) });
      c.restore();
    }
    return _tx.apply(this, arguments);
  };

  // which shot is being drawn right now
  const _ds = window.drawSeg;
  window.drawSeg = function (g, s) { const old = seg; seg = s; try { return _ds.apply(this, arguments); } finally { seg = old; } };

  // ---- lyrics covering a face: the head of a figure image / the centre of a card ----
  const HEAD = {};
  function headOf(key) {
    if (IMG[key] && IMG[key].head) return IMG[key].head;      // a head region given by the version (half-length figures, where estimating from the height is off) is used as is
    if (HEAD[key] !== undefined) return HEAD[key];
    const m = IMG[key]; if (!m || !m.img) return (HEAD[key] = null);
    const h = 200, w = Math.max(1, Math.round(h * m.img.width / m.img.height)), cv = document.createElement('canvas');
    cv.width = w; cv.height = h; const g = cv.getContext('2d'); g.drawImage(m.img, 0, 0, w, h);
    const a = g.getImageData(0, 0, w, h).data, on = (x, y) => a[(y * w + x) * 4 + 3] > 128;
    let top = -1, bot = -1;
    for (let y = 0; y < h && top < 0; y++) for (let x = 0; x < w; x++) if (on(x, y)) { top = y; break; }
    for (let y = h - 1; y >= 0 && bot < 0; y--) for (let x = 0; x < w; x++) if (on(x, y)) { bot = y; break; }
    if (top < 0) return (HEAD[key] = null);
    const hb = bot - top; let sx = 0, n = 0;
    for (let y = Math.round(top + hb * .04); y <= top + hb * .18; y++) for (let x = 0; x < w; x++) if (on(x, y)) { sx += x; n++; }
    const cx = n ? sx / n : w / 2, r = hb * .1;
    return (HEAD[key] = [(cx - r) / w, top / h, (cx + r) / w, (top + hb * .2) / h]);
  }
  const _st = window.sticker;
  window.sticker = function (c, key, x, y, h, o = {}) {
    const hd = rec && full(c) && c.globalAlpha * (o.alpha ?? 1) >= .5 && headOf(key);
    if (hd) {
      const m = IMG[key], w = h * m.img.width / m.img.height, sq = o.squash || 0;
      c.save(); c.translate(x, y - (o.hop || 0)); if (o.rot) c.rotate(o.rot); c.scale((o.flip ? -1 : 1) * (1 + sq * .12), 1 - sq * .12);
      rec.face.push({ seg, k: 'face:' + key, b: clipped(c, box(c, -w / 2 + hd[0] * w, -h + hd[1] * h, -w / 2 + hd[2] * w, -h + hd[3] * h)) });
      c.restore();
    }
    return _st.apply(this, arguments);
  };
  const _cd = window.card;
  window.card = function (c, key, x, y, w, h, o = {}) {
    if (rec && full(c) && o.face && c.globalAlpha * (o.alpha ?? 1) >= .5) {
      c.save(); c.translate(x, y); if (o.rot) c.rotate(o.rot); if (o.scale) c.scale(o.scale, o.scale);
      rec.face.push({ seg, k: 'face:' + key, b: clipped(c, box(c, -w * .22, -h * .22, w * .22, h * .22)) });
      c.restore();
    }
    return _cd.apply(this, arguments);
  };

  function frame(t, minArea) {
    rec = { lyr: [], obj: [], face: [], low: [] }; S = new WeakMap();
    try { MV.frame(t); } finally { var R = rec; rec = null; }
    const hits = {};
    const add = (k, A, ch) => { const h = hits[k] || (hits[k] = { area: 0, chars: '' }); h.area += A; h.chars += ch; };
    for (const o of R.obj) for (const g of R.lyr) { if (o.seg !== g.seg) continue; const A = area(isect(o.b, g.b)); if (A > minArea) add(o.k, A, g.ch); }
    for (const l of R.low) add('contrast', 1e3, l.ch);
    for (const f of R.face) {
      const fa = area(f.b); if (!fa) continue;
      let A = 0, ch = ''; for (const g of R.lyr) { if (f.seg !== g.seg) continue; const a = area(isect(f.b, g.b)); if (a > 0) { A += a; ch += g.ch; } }
      if (A / fa > .12) add(f.k, A, ch);
    }
    for (let i = 0; i < R.lyr.length; i++) for (let j = i + 1; j < R.lyr.length; j++) {
      const a = R.lyr[i], b = R.lyr[j]; if (a.p === b.p || a.seg !== b.seg) continue;
      const A = area(isect(a.b, b.b)); if (A > minArea) add('lyric×lyric', A, a.ch + b.ch);
    }
    return hits;
  }
  // Returns [[start, end, what, max overlap area px², characters covered], …]; flashes shorter than minDur seconds aren't reported
  function run(t0, t1, step = 1 / 8, { minArea = 80, minDur = .3, contrast = false } = {}) {
    CONTRAST = contrast;
    const open = {}, out = [];
    const close = k => { const x = open[k]; delete open[k]; if (x.t1 - x.t0 + step >= minDur) out.push([+x.t0.toFixed(2), +x.t1.toFixed(2), k, Math.round(x.max), [...new Set(x.chars)].join('').slice(0, 20)]); };
    for (let t = t0; t <= t1; t += step) {
      const hits = frame(t, minArea);
      for (const k of Object.keys(open)) if (!hits[k] && t - open[k].t1 > step * 1.5) close(k);
      for (const [k, v] of Object.entries(hits)) {
        const x = open[k] || (open[k] = { t0: t, t1: t, max: 0, chars: '' });
        x.t1 = t; x.max = Math.max(x.max, v.area); x.chars += v.chars;
      }
    }
    Object.keys(open).forEach(close);
    return out.sort((a, b) => a[0] - b[0]);
  }
  window.OVERLAP = { frame, run };
})();
