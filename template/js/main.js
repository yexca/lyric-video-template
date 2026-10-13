'use strict';
/* Compositing, transitions, player, export interface */
I18N.apply();      // the player's own text (index.html, the start-up notes below); dictionaries: lang.<code>.js, see tools/i18n.js
const cv = document.getElementById('cv'), c = cv.getContext('2d');
if (RS !== 1) { cv.width = W * RS; cv.height = H * RS; }      // 4K export (?scale=2)
c.imageSmoothingQuality = 'high';
const au = document.getElementById('audio');
const DURATION = AU.d ? AU.d.duration : DURATION_FALLBACK;
SEG.sort((a, b) => a.t - b.t);
SEG.forEach((s, i) => { s.end = i + 1 < SEG.length ? SEG[i + 1].t : DURATION + 1; s.i = i; });
const SECTIONS = SEG.filter(s => s.sec);

function segAt(t) {
  let i = 0;
  while (i + 1 < SEG.length && SEG[i + 1].t <= t) i++;
  return i;
}
function drawSeg(g, s, t) {
  g.save();
  s.draw && s.draw(g, t, s);
  if (s.lyr) for (const cfg of s.lyr) lyric(g, t, cfg);
  s.over && s.over(g, t, s);
  g.restore();
}

/* ---------- Transitions ----------
 * On a shot, write cut: 'name' (omitted = hard cut), td = duration (seconds; omitted = the default below), col = colour of the edge / outline the transition draws.
 *   iris    a circle opens out (at: [x, y] = its centre)              heart  a heart opens out (at)        plus  a plus sign opens out (at)
 *   wipe    wipes across at a slant                                   pill   a long round-ended bar wipes across at a slant
 *   push    the new shot pushes the old one out (dir: 'left' default | 'right' | 'up' | 'down' = the way the old shot leaves)
 *   shutter shutter slats                                             blink  two bars close in from top and bottom, then open (col = the bars' colour)
 *   zoom    cross-fade + new shot settles back from slightly larger   fade  cross-fade (col = a wash of colour that rises midway; optional)
 *   punch   hard cut; the new shot drops back from slightly larger (z, default 1.06) while col washes in around the edges of the picture (the middle stays clear)
 *   flash   hard cut; col covers the whole screen, then fades away — a full-screen flash is harsh, so use it once or twice in a song at most; for "the moment it lands", try punch / heart first
 */
const TD = { cut: 0, flash: .35, iris: .5, heart: .55, plus: .55, wipe: .38, pill: .5, push: .32, shutter: .42, blink: .44, zoom: .3, fade: .6, punch: .32 };
const SHAPES = {
  heart(g, x, y, r) { heartPath(g, x, y - r * .12, r * 1.5); },                       // once r is large enough the whole picture lies inside the heart
  plus(g, x, y, r) {
    const w = r * .36;
    g.beginPath(); [[-w, -r], [w, -r], [w, -w], [r, -w], [r, w], [w, w], [w, r], [-w, r], [-w, w], [-r, w], [-r, -w], [-w, -w]].forEach(([a, b], i) => i ? g.lineTo(x + a, y + b) : g.moveTo(x + a, y + b));
    g.closePath();
  },
};
function transition(g, s, prev, t) {
  const td = s.td ?? TD[s.cut || 'cut'], dt = t - s.t;
  if (!prev || dt >= td || !td) { drawSeg(g, s, t); return s.cut === 'flash' && dt < td ? ['flash', 1 - dt / td] : null; }
  const k = E.inOut(clamp(dt / td)), col = s.col || C.cream;
  switch (s.cut) {
    case 'flash': drawSeg(g, s, t); return ['flash', 1 - dt / td];
    case 'iris': {
      drawSeg(g, prev, t);
      // The centre needn't be the middle of the picture (at: [x, y], picking up where the eye came to rest in the previous shot); the radius has to reach the farthest corner
      const [x, y] = s.at || [W / 2, H / 2], r = k * Math.max(1250, Math.hypot(Math.max(x, W - x), Math.max(y, H - y)) + 40);
      g.save(); g.beginPath(); g.arc(x, y, r, 0, TAU); g.clip(); drawSeg(g, s, t); g.restore();
      ring(g, x, y, r, 40 * (1 - k) + 6, col, 1);
      return null;
    }
    case 'heart': case 'plus': {                    // opens out from at like iris, but as a heart / plus sign
      drawSeg(g, prev, t);
      const [x, y] = s.at || [W / 2, H / 2], r = Math.pow(clamp(dt / td), 1.7) * 3400 + 2, path = SHAPES[s.cut];
      g.save(); path(g, x, y, r); g.clip(); drawSeg(g, s, t); g.restore();
      g.save(); g.lineJoin = 'round';
      path(g, x, y, r); g.strokeStyle = col; g.lineWidth = 44 * (1 - k) + 8; g.stroke();
      path(g, x, y, r); g.strokeStyle = '#ffffff'; g.lineWidth = 12 * (1 - k) + 2; g.stroke();
      g.restore();
      return null;
    }
    case 'wipe': {
      drawSeg(g, prev, t);
      const x = lerp(-400, W + 400, k), sl = 300;
      g.save(); g.beginPath(); g.moveTo(-10, -10); g.lineTo(x + sl, -10); g.lineTo(x - sl, H + 10); g.lineTo(-10, H + 10); g.closePath(); g.clip(); drawSeg(g, s, t); g.restore();
      g.save(); g.fillStyle = col; g.beginPath(); g.moveTo(x + sl, -10); g.lineTo(x + sl + 70, -10); g.lineTo(x - sl + 70, H + 10); g.lineTo(x - sl, H + 10); g.fill(); g.restore();
      return null;
    }
    case 'pill': {                                  // wipes across at a slant, with a long round-ended bar riding the dividing line (top half col, bottom half white)
      drawSeg(g, prev, t);
      const x = lerp(-520, W + 520, k), sl = 300, wd = 150, len = 1700, a = Math.atan2(sl * 2, H + 20);
      g.save(); g.beginPath(); g.moveTo(-10, -10); g.lineTo(x + sl, -10); g.lineTo(x - sl, H + 10); g.lineTo(-10, H + 10); g.closePath(); g.clip(); drawSeg(g, s, t); g.restore();
      g.save(); g.translate(x, H / 2); g.rotate(a);
      g.fillStyle = 'rgba(40,40,80,.16)'; g.beginPath(); g.roundRect(-wd / 2 + 16, -len / 2 + 10, wd, len, wd / 2); g.fill();
      g.save(); g.beginPath(); g.roundRect(-wd / 2, -len / 2, wd, len, wd / 2); g.clip();
      g.fillStyle = '#ffffff'; g.fillRect(-wd, -len, wd * 2, len * 2); g.fillStyle = col; g.fillRect(-wd, -len, wd * 2, len);
      g.fillStyle = 'rgba(255,255,255,.4)'; g.beginPath(); g.roundRect(-wd * .3, -len / 2 + 60, wd * .16, len - 120, wd * .08); g.fill();
      g.restore();
      g.lineWidth = 8; g.strokeStyle = C.ink || '#2a2f5b'; g.beginPath(); g.roundRect(-wd / 2, -len / 2, wd, len, wd / 2); g.stroke();
      g.restore();
      return null;
    }
    case 'push': {
      const d = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] }[s.dir || 'left'], dx = d[0] * W, dy = d[1] * H;
      // Each picture is clipped to its own screenful: the background fills (fill / vgrad) cover "the whole screen", so without the clip the new shot's background would paint over the old shot
      g.save(); g.translate(k * dx, k * dy); g.beginPath(); g.rect(0, 0, W, H); g.clip(); drawSeg(g, prev, t); g.restore();
      g.save(); g.translate((k - 1) * dx, (k - 1) * dy); g.beginPath(); g.rect(0, 0, W, H); g.clip(); drawSeg(g, s, t); g.restore();
      g.fillStyle = col;                            // the edge between the two pictures
      if (d[0]) g.fillRect((d[0] < 0 ? (1 - k) * W : k * W) - 14, 0, 28, H); else g.fillRect(0, (d[1] < 0 ? (1 - k) * H : k * H) - 14, W, 28);
      return null;
    }
    case 'shutter': {
      drawSeg(g, prev, t);
      g.save(); g.beginPath();
      for (let i = 0; i < 8; i++) { const kk = E.out(clamp(dt / td * 1.6 - i * .08)); g.rect(0, i * H / 8, W, H / 8 * kk + 1); }
      g.clip(); drawSeg(g, s, t); g.restore();
      return null;
    }
    case 'blink': {                                 // first half: the bars close over the old shot from top and bottom; second half: they open on the new shot
      const p = clamp(dt / td), close = p < .5, kk = close ? E.in(p * 2) : 1 - E.out(p * 2 - 1), h = kk * (H / 2 + 4);
      drawSeg(g, close ? prev : s, t);
      g.fillStyle = col; g.fillRect(0, 0, W, h); g.fillRect(0, H - h, W, h);
      return null;
    }
    case 'zoom': {
      drawSeg(g, prev, t);
      const [oc, og] = offscreen('zoom'); drawSeg(og, s, t);
      g.save(); g.globalAlpha = k; zoomAt(g, lerp(1.25, 1, k)); g.drawImage(oc, 0, 0, W, H); g.restore();
      return null;
    }
    case 'fade': {
      drawSeg(g, prev, t);
      const [oc, og] = offscreen('zoom'); drawSeg(og, s, t);
      g.save(); g.globalAlpha = k; g.drawImage(oc, 0, 0, W, H); g.restore();
      if (s.col) { g.save(); g.globalAlpha = Math.sin(k * Math.PI) * .3; g.fillStyle = s.col; g.fillRect(0, 0, W, H); g.restore(); }
      return null;
    }
    case 'punch': {
      const [x, y] = s.at || [W / 2, H / 2], ko = E.out(clamp(dt / td));
      g.save(); zoomAt(g, lerp(s.z ?? 1.06, 1, ko), x, y); drawSeg(g, s, t); g.restore();
      const gr = g.createRadialGradient(W / 2, H / 2, H * .42, W / 2, H / 2, H * 1.05);      // the colour washes in around the edges only; the middle stays clear
      gr.addColorStop(0, rgba(col, 0)); gr.addColorStop(1, rgba(col, .75 * (1 - ko)));
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      return null;
    }
    default: drawSeg(g, s, t); return null;
  }
}

/* ---------- Per frame ---------- */
let debug = false;
function render(t) {
  const i = segAt(t), s = SEG[i], prev = SEG[i - 1];
  c.setTransform(RS, 0, 0, RS, 0, 0); c.globalAlpha = 1; c.globalCompositeOperation = 'source-over'; c.filter = 'none'; c.imageSmoothingQuality = 'high';
  c.fillStyle = '#000'; c.fillRect(0, 0, W, H);
  // Drum hit impact: a slight zoom + shake
  const kick = AU.kick(t) * (s.shake ?? 1);
  c.save();
  if (kick > .02) {
    const f = Math.floor(t * 30);
    c.translate(W / 2 + (hash(f, 1) - .5) * kick * 10, H / 2 + (hash(f, 2) - .5) * kick * 10);
    c.scale(1 + kick * .018, 1 + kick * .018); c.translate(-W / 2, -H / 2);
  }
  const fl = transition(c, s, prev, t);
  c.restore();
  if (fl && fl[0] === 'flash') { c.save(); c.globalAlpha = fl[1] ** 2; c.fillStyle = s.col || '#ffffff'; c.fillRect(0, 0, W, H); c.restore(); }
  grain(c, t, .07);
  if (debug) {
    c.save(); c.fillStyle = 'rgba(0,0,0,.6)'; c.fillRect(0, 0, 620, 40);
    c.font = '20px monospace'; c.fillStyle = '#ff0'; c.textBaseline = 'middle';
    c.fillText(`${t.toFixed(2)}s  beat ${AU.beat(t).toFixed(1)}  #${i} ${s.name}`, 12, 20); c.restore();
  }
}

/* ---------- Player ----------
 * The clock is simply the audio's currentTime. With no audio (empty template, or the audio isn't prepared yet) the system clock stands in: the picture plays as usual, just without sound.
 */
let T = Q.has('t') ? +Q.get('t') : 0, playing = false, ready = false, dirty = true, silent = false, wall = 0;
const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const DUR = () => DURATION;
function setPlaying(v) {
  playing = v;
  document.getElementById('ppi').setAttribute('d', v ? 'M6 5h4v14H6zM14 5h4v14h-4z' : 'M7 5v14l12-7z');
  if (silent) { if (v && T >= DUR() - .05) T = 0; wall = performance.now() - T * 1000; return; }
  if (v) { au.currentTime = T; au.play().catch(() => {}); } else au.pause();
}
function seek(t) {
  T = clamp(t, 0, DUR() - .01); dirty = true;
  if (silent) wall = performance.now() - T * 1000; else au.currentTime = T;
}
function loop() {
  if (playing) {
    if (silent) { T = (performance.now() - wall) / 1000; if (T >= DUR() - .01) { T = DUR() - .01; setPlaying(false); } }
    else { T = au.currentTime; if (au.ended) setPlaying(false); }
    dirty = true;
  }
  if (dirty && ready) { render(T); updUI(); dirty = false; }
  requestAnimationFrame(loop);
}
function fit() {
  const s = Math.min(innerWidth / W, innerHeight / H);
  document.getElementById('stage').style.transform = `translate(-50%,-50%) scale(${s})`;
}
if (!EXPORT) { addEventListener('resize', fit); fit(); }

const bar = document.getElementById('bar');
const sceneLabel = t => SEG[segAt(t)].name;
// The progress bar is coloured by section: a shot that sets tint changes the colour from there on
function paintTrack() {
  let col = '#8c93c8';
  const stops = SEG.map(s => { col = s.tint || col; return `${col} ${s.t / DUR() * 100}%, ${col} ${Math.min(DUR(), s.end) / DUR() * 100}%`; }).join(', ');
  const gr = `linear-gradient(90deg, ${stops})`;
  bar.querySelector('.track').style.background = gr;
  const fillEl = bar.querySelector('.fill');
  fillEl.style.backgroundImage = gr; fillEl.style.backgroundSize = `${bar.clientWidth}px 100%`;
}
function buildMarks() {
  bar.querySelectorAll('.mk').forEach(m => m.remove());
  SECTIONS.forEach((s, i) => { if (!i) return; const m = document.createElement('div'); m.className = 'mk'; m.style.left = s.t / DUR() * 100 + '%'; bar.appendChild(m); });
  paintTrack();
}
function updUI() {
  const p = T / DUR() * 100;
  bar.querySelector('.fill').style.width = p + '%';
  bar.querySelector('.knob').style.left = p + '%';
  document.getElementById('time').textContent = `${fmt(T)} / ${fmt(DUR())}`;
  document.getElementById('scene').textContent = sceneLabel(T);
}
function barT(e) { const r = bar.getBoundingClientRect(); return clamp((e.clientX - r.left) / r.width) * DUR(); }
bar.addEventListener('pointerdown', e => {
  startOnce(); bar.setPointerCapture(e.pointerId); seek(barT(e));
  const mv = ev => seek(barT(ev));
  bar.addEventListener('pointermove', mv);
  bar.addEventListener('pointerup', () => bar.removeEventListener('pointermove', mv), { once: true });
});
bar.addEventListener('pointermove', e => {
  const tip = bar.querySelector('.tip'), t = barT(e);
  tip.textContent = `${fmt(t)}  ${sceneLabel(t)}`;
  tip.style.left = clamp(e.clientX - bar.getBoundingClientRect().left, 80, bar.clientWidth - 80) + 'px';
});
addEventListener('resize', paintTrack);

function setPill(id, on, label) { const b = document.getElementById(id); b.textContent = `${label} ${on ? 'ON' : 'OFF'}`; b.setAttribute('aria-pressed', String(on)); }
function toggleLyrics() { lyricsOn = !lyricsOn; setPill('lyr', lyricsOn, tr('Lyrics')); dirty = true; }
document.getElementById('pp').onclick = () => { startOnce(); setPlaying(!playing); };
document.getElementById('lyr').onclick = toggleLyrics;
setPill('lyr', lyricsOn, tr('Lyrics'));
document.getElementById('fs').onclick = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen();

let idleT = 0;
function poke() {
  document.getElementById('ui').classList.remove('idle'); document.body.classList.remove('nocursor');
  clearTimeout(idleT);
  idleT = setTimeout(() => { if (playing) { document.getElementById('ui').classList.add('idle'); document.body.classList.add('nocursor'); } }, 2200);
}
addEventListener('mousemove', poke);
addEventListener('keydown', e => {
  if (!ready || e.ctrlKey || e.metaKey || e.altKey) return;
  const k = e.key.toLowerCase(), sec = SECTIONS.find(s => s.key === e.key);
  if (e.code === 'Space') { e.preventDefault(); startOnce(); setPlaying(!playing); }
  else if (k === 'arrowright') seek(T + (e.shiftKey ? 1 : 5));
  else if (k === 'arrowleft') seek(T - (e.shiftKey ? 1 : 5));
  else if (sec) { startOnce(); seek(Math.max(0, sec.t - .3)); }
  else if (k === 'l') toggleLyrics();
  else if (k === 'f') document.getElementById('fs').click();
  else if (k === 'h') document.body.classList.toggle('clean');
  else if (k === 'd') { debug = !debug; dirty = true; }
  else return;
  poke();
});
const startEl = document.getElementById('start');
function startOnce() { startEl.classList.add('hide'); }
startEl.addEventListener('click', () => { if (!ready) return; startOnce(); setPlaying(true); });
document.getElementById('stage').addEventListener('click', () => { if (ready && startEl.classList.contains('hide')) setPlaying(!playing); });

/* ---------- Startup ---------- */
const note = s => { const e = document.getElementById('err'); e.textContent += (e.textContent ? '\n' : '') + s; };
async function prepareAudio() {
  const src = '../data/audio/audio.m4a';
  try {
    const r = await fetch(src);
    if (!r.ok) throw new Error(r.status);
    au.src = URL.createObjectURL(await r.blob());
    await new Promise((res, rej) => {
      if (au.readyState >= 1) return res();
      au.addEventListener('loadedmetadata', res, { once: true });
      au.addEventListener('error', () => rej(new Error('decode')), { once: true });
    });
  } catch (err) {
    silent = true;
    note(tr('No audio (data/audio/audio.m4a): playing without sound. Put the audio in ref/audio/, then run tools/audio.py'));
  }
}
// Every character that appears in the picture (fonts are downloaded as subsets on demand, and all of them must be ready before export)
function allText() {
  const s = new Set();
  const add = x => { for (const ch of String(x)) s.add(ch); };
  LYR.forEach(l => l[2].forEach(p => add(p[0])));
  SEG.forEach(g => (g.lyr || []).forEach(cfg => cfg.text && add([].concat(cfg.text).join(''))));
  add(TITLE1 + TITLE2 + EXTRA_TEXT + '0123456789,.:#→←—·「」『』《》？！ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz');
  return [...s].join('');
}
async function boot() {
  if (EXPORT) document.body.classList.add('export', 'clean');
  document.querySelector('#start .t1').textContent = TITLE1;
  document.querySelector('#start .t2').textContent = TITLE2;
  document.title = `${TITLE1} — ${location.pathname.split('/').filter(Boolean)[0] || ''}`;      // first path segment = the version folder's name
  const TEXT = allText();
  const settle = (p, ms = 20000) => Promise.race([Promise.resolve(p).catch(() => {}), new Promise(r => setTimeout(r, ms))]);
  await Promise.all([
    settle(loadManifest().then(() => loadImages()), 180000),
    settle(prepareTextures()),
    ...Object.keys(F).flatMap(f => [font(f, 40), font(f, 40, 500)]).map(f => settle(document.fonts.load(f, TEXT))),
    EXPORT ? null : settle(prepareAudio(), 30000),
  ]);
  await settle(document.fonts.ready, 5000);
  const miss = missingImages().filter(k => IMG[k].file);
  if (miss.length) await settle(loadImages(miss), 60000);
  window.MV_MISSING = missingImages();
  SEG.forEach(g => (g.lyr || []).forEach(cfg => sourceLine(cfg)));      // run through every shot's lyric configs once: line numbers that don't exist are caught right here
  window.MV_BAD_LINES = [...LBAD];
  if (typeof PREWARM === 'function') PREWARM();
  ready = true;
  buildMarks();
  const b = document.getElementById('play0'); b.disabled = false; b.textContent = tr('▶ Play');
  if (!AU.d) note(tr('No audio analysis data (data/derived/analysis.js): the beat is simulated at 120 BPM'));
  if (window.MV_MISSING.length) note(tr('Missing images: {0}', window.MV_MISSING.join(', ')));
  if (window.MV_BAD_LINES.length) note(tr('The storyboard refers to lines that do not exist: {0} (the lyrics now have lines 0–{1}). After merging or deleting lines, the line numbers in js/scenes.js have to be updated.', window.MV_BAD_LINES.join(', '), LYR.length - 1));
  if (Q.has('clean')) document.body.classList.add('clean');
  if (Q.has('t')) { startOnce(); seek(T); }
  render(T); updUI();
}
requestAnimationFrame(loop);

// Frame-by-frame export: await MV.ready; MV.frame(t) or await MV.frameAsync(t) (returns a dataURL)
window.MV = {
  ready: boot(),
  frame(t) { T = t; render(t); updUI(); },
  async frameAsync(t, type = 'image/jpeg', q = .92) { T = t; render(t); return cv.toDataURL(type, q); },
  seek(t) { startOnce(); seek(t); },
  get duration() { return DURATION; },
  sections: () => SECTIONS.map(s => [+s.t.toFixed(2), s.sec]),
  segs: () => SEG.map(s => [+s.t.toFixed(2), s.name]),
  get playing() { return playing; },
};
