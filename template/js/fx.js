'use strict';
/* Graphic elements: all flat shapes (screen-print / poster style), with no dependence on images. */

/* ---------- Backgrounds ---------- */
// The screen's bounding rectangle in user coordinates under the current transform (backgrounds fill only the visible part)
function screenRect(c) {
  const m = c.getTransform(), dw = c.canvas.width, dh = c.canvas.height;     // uses the canvas's actual size (during 4K export the canvas is 3840×2160)
  if (m.a === 1 && m.b === 0 && m.c === 0 && m.d === 1 && m.e === 0 && m.f === 0 && dw === W && dh === H) return [0, 0, W, H];
  const iv = m.inverse(), P = [[0, 0], [dw, 0], [0, dh], [dw, dh]].map(([x, y]) => [iv.a * x + iv.c * y + iv.e, iv.b * x + iv.d * y + iv.f]);
  const xs = P.map(p => p[0]), ys = P.map(p => p[1]), x0 = Math.min(...xs) - 2, y0 = Math.min(...ys) - 2;
  return [x0, y0, Math.max(...xs) + 2 - x0, Math.max(...ys) + 2 - y0];
}
function fill(c, col) { c.fillStyle = col; c.fillRect(...screenRect(c)); }
function vgrad(c, stops, y0 = 0, y1 = H) {
  const g = c.createLinearGradient(0, y0, 0, y1);
  stops.forEach((s, i) => g.addColorStop(Array.isArray(s) ? s[0] : i / (stops.length - 1), Array.isArray(s) ? s[1] : s));
  c.fillStyle = g; c.fillRect(...screenRect(c));
}
function paper(c, a = 1) {
  c.save(); c.globalAlpha = a;
  c.drawImage(TEX.paper || PAPER, 0, 0, W, H); c.restore();
}
// Halftone gradient: the dots grow from r0 to r1 (along ang). The parameters don't change, so each set is cached as a half-resolution bitmap (redrawing thousands of dots every frame is too slow)
const _ht = new Map();
function halftone(c, x, y, w, h, col, step = 22, r0 = 0, r1 = 8, ang = Math.PI / 2, a = 1) {
  const key = [x, y, w, h, col, step, r0, r1, ang].join('|');
  let cv = _ht.get(key);
  if (!cv) {
    const S = .5;
    cv = canvas(Math.ceil(w * S) + 2, Math.ceil(h * S) + 2);
    const g = cv.getContext('2d'); g.scale(S, S); g.fillStyle = col; g.beginPath();
    const dx = Math.cos(ang), dy = Math.sin(ang), L = Math.abs(w * dx) + Math.abs(h * dy);
    for (let j = 0, yy = 0; yy <= h; yy += step * .866, j++) {
      for (let xx = (j % 2) * step / 2; xx <= w; xx += step) {
        const k = clamp(((xx - w / 2) * dx + (yy - h / 2) * dy) / L + .5);
        const r = lerp(r0, r1, k);
        if (r > .4) { g.moveTo(xx + r, yy); g.arc(xx, yy, r, 0, TAU); }
      }
    }
    g.fill();
    if (_ht.size > 40) _ht.delete(_ht.keys().next().value);
    _ht.set(key, cv);
  }
  c.save(); c.globalAlpha *= a; c.drawImage(cv, x, y, cv.width * 2, cv.height * 2); c.restore();
}
const _grainPat = new WeakMap();
function grain(c, t, a = .06) {
  let pats = _grainPat.get(c);
  if (!pats) _grainPat.set(c, pats = (TEX.grain || GRAIN).map(g => c.createPattern(g, 'repeat')));
  c.save(); c.globalAlpha = a * .5;
  c.fillStyle = pats[Math.floor(t * 24) % 4]; c.fillRect(0, 0, W, H); c.restore();
}
function vignette(c, a = .35, col = '#000') {
  const g = c.createRadialGradient(W / 2, H / 2, H * .35, W / 2, H / 2, H * 1.05);
  g.addColorStop(0, rgba(col, 0)); g.addColorStop(1, rgba(col, a));
  c.fillStyle = g; c.fillRect(0, 0, W, H);
}

/* ---------- Basic shapes ---------- */
function circle(c, x, y, r, col, a = 1) { if (r <= 0 || a <= 0) return; c.save(); c.globalAlpha *= a; c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.restore(); }
function ring(c, x, y, r, lw, col, a = 1, a0 = 0, a1 = TAU) {
  if (r <= 0 || a <= 0) return;
  c.save(); c.globalAlpha *= a; c.strokeStyle = col; c.lineWidth = lw; c.lineCap = 'round';
  c.beginPath(); c.arc(x, y, r, a0, a1); c.stroke(); c.restore();
}
function glow(c, x, y, r, col, a = 1) {
  if (a <= 0 || r <= 0) return;
  const g = c.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, rgba(col, a)); g.addColorStop(.35, rgba(col, a * .35)); g.addColorStop(1, rgba(col, 0));
  c.fillStyle = g; c.fillRect(x - r, y - r, r * 2, r * 2);
}
function sparkle(c, x, y, r, col = '#fff', a = 1, rot = 0) {
  if (a <= 0 || r <= 0) return;
  c.save(); c.globalAlpha *= a; c.fillStyle = col; c.translate(x, y); c.rotate(rot);
  c.beginPath(); c.moveTo(0, -r); c.quadraticCurveTo(0, 0, r, 0); c.quadraticCurveTo(0, 0, 0, r);
  c.quadraticCurveTo(0, 0, -r, 0); c.quadraticCurveTo(0, 0, 0, -r); c.fill(); c.restore();
}
function starPath(c, x, y, R, r = R * .45, n = 5, rot = -Math.PI / 2) {
  c.beginPath();
  for (let i = 0; i < n * 2; i++) { const a = rot + i * Math.PI / n, d = i % 2 ? r : R; c.lineTo(x + Math.cos(a) * d, y + Math.sin(a) * d); }
  c.closePath();
}
function heartPath(c, x, y, s) {
  c.beginPath();
  c.moveTo(x, y + s * .9);
  c.bezierCurveTo(x - s * 1.3, y + s * .05, x - s * 1, y - s * 1.1, x, y - s * .42);
  c.bezierCurveTo(x + s * 1, y - s * 1.1, x + s * 1.3, y + s * .05, x, y + s * .9);
  c.closePath();
}

// Any parametric curve f(k) → [x,y]
const curve = (f, n = 160) => Array.from({ length: n + 1 }, (_, i) => f(i / n));

/* ---------- Night sky ---------- */
function starfield(c, t, seed = 1, n = 220, o = {}) {
  const x0 = o.x ?? 0, y0 = o.y ?? 0, w = o.w ?? W, h = o.h ?? H, a = o.a ?? 1, col = o.col || '#ffffff';
  const drift = o.drift || 0;
  c.save(); c.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const appear = o.reveal ? clamp((o.reveal - hash(i, seed + 5)) * 6) : 1;
    if (appear <= 0) continue;
    const x = x0 + ((hash(i, seed) * w + drift * t * (.3 + hash(i, seed + 3))) % w + w) % w, y = y0 + hash(i, seed + 1) * h;
    const r = (.6 + hash(i, seed + 2) ** 3 * 2.6) * (o.size || 1);
    const tw = .55 + .45 * Math.sin(t * (1.5 + hash(i, seed + 4) * 3) + i);
    c.globalAlpha = a * tw * appear;
    c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
    if (r > 2.4) sparkle(c, x, y, r * 4, col, .5 * tw * appear * a);
  }
  c.restore();
}

/* ---------- Manga-style lines ---------- */
// Focus lines: pointing in from off screen towards (cx,cy), leaving a clear area of radius r
function focusLines(c, cx, cy, r, col, t, n = 90, a = 1) {
  c.save(); c.globalAlpha *= a; c.fillStyle = col; c.beginPath();
  for (let i = 0; i < n; i++) {
    const ang = (i + hash(i, Math.floor(t * 12)) * .8) / n * TAU, w = .004 + hash(i, 31 + Math.floor(t * 12)) * .012;
    const r0 = r * (1 + hash(i, 32 + Math.floor(t * 12)) * .5), r1 = 1600;
    c.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
    c.lineTo(cx + Math.cos(ang - w) * r1, cy + Math.sin(ang - w) * r1);
    c.lineTo(cx + Math.cos(ang + w) * r1, cy + Math.sin(ang + w) * r1);
  }
  c.fill(); c.restore();
}
// Speed lines: streaming horizontally
function speedLines(c, t, col, n = 40, speed = 3000, a = 1, seed = 3) {
  c.save(); c.globalAlpha *= a; c.fillStyle = col;
  for (let i = 0; i < n; i++) {
    const y = hash(i, seed) * H, len = 200 + hash(i, seed + 1) * 700, th = 1 + hash(i, seed + 2) ** 2 * 7;
    const x = W + len - ((t * speed * (.6 + hash(i, seed + 3)) + hash(i, seed + 4) * 4000) % (W + len * 2));
    c.fillRect(x, y, len, th);
  }
  c.restore();
}
// Rays (sun / burst)
function rays(c, x, y, n, r0, r1, rot, col, a = 1, wid = .5) {
  c.save(); c.globalAlpha *= a; c.fillStyle = col; c.beginPath();
  for (let i = 0; i < n; i++) {
    const a0 = rot + i / n * TAU, h = wid * Math.PI / n;
    c.moveTo(x + Math.cos(a0 - h) * r0, y + Math.sin(a0 - h) * r0);
    c.lineTo(x + Math.cos(a0 - h) * r1, y + Math.sin(a0 - h) * r1);
    c.lineTo(x + Math.cos(a0 + h) * r1, y + Math.sin(a0 + h) * r1);
    c.lineTo(x + Math.cos(a0 + h) * r0, y + Math.sin(a0 + h) * r0);
  }
  c.fill(); c.restore();
}


/* ---------- Camera ---------- */
// Scale the whole picture about (x, y) (everything drawn afterwards is scaled with it)
function zoomAt(c, s, x = W / 2, y = H / 2) { c.translate(x, y); c.scale(s, s); c.translate(-x, -y); }
