'use strict';
/* Images
 * - The files all live in ../data/img/ (the image pool, not in git). Which images this version uses, their numbers and the pool file behind each are listed in images.json (in git,
 *   maintained by pic-tool/pic.py). This file holds only picture parameters: the figure's focus point, which cropping is centred on.
 * - The picture refers to images by key (card(c, 'hero', …)), never by file name: redrawing an image only changes images.json and leaves the storyboard alone.
 * - A key with no image (failed to load, or not generated yet) is drawn as a numbered placeholder, so nothing is ever left blank.
 */
const IMG = {
  // key: { fx, fy focus point (0..1), face: [x, y, zoom] face close-up, placeholder: true = has no image by design (for examples; not counted as missing at export) }
  demo: { fx: .5, fy: .5, placeholder: true },
};
const IMG_DIR = '../data/img/';

// Read images.json and merge numbers and file names into IMG; keys in the manifest with no parameters above get the default focus point (dead centre)
async function loadManifest() {
  let list = [];
  try {
    const r = await fetch('images.json', { cache: 'no-store' });
    if (r.ok) list = await r.json();
  } catch (e) { console.warn('Cannot read images.json (the page has to be opened through tools/serve.py)', e); }
  for (const it of list) { const k = it.as || it.key; IMG[k] = Object.assign(IMG[k] || { fx: .5, fy: .5 }, { no: it.no, file: it.file }); }     // as: another revision of the same image, referred to by an alias
}

// Resolves only once everything has loaded; failures are retried a few times (during export several Chromes load at once and one occasionally times out)
function loadImages(keys = Object.keys(IMG).filter(k => IMG[k].file), tries = 3) {
  return Promise.all(keys.map(k => new Promise(res => {
    const im = new Image();
    // Decode once into an ImageBitmap: when an <img> is drawn directly the browser may drop its decode cache and decode again on the next draw (one frame stalls for hundreds of milliseconds)
    im.onload = async () => {
      try { IMG[k].img = await createImageBitmap(im); }
      catch { const cv = canvas(im.naturalWidth, im.naturalHeight); cv.getContext('2d').drawImage(im, 0, 0); IMG[k].img = cv; }
      IMG[k].mips = await buildMips(IMG[k].img);
      res();
    };
    im.onerror = () => {
      if (tries > 1) setTimeout(() => loadImages([k], tries - 1).then(res), 400);
      else { console.warn('missing', k, IMG[k].file); res(); }
    };
    im.src = IMG_DIR + IMG[k].file;
  })));
}
// Keys that should have an image but don't (must be empty before export; placeholder ones don't count)
const missingImages = () => Object.keys(IMG).filter(k => !IMG[k].img && !IMG[k].placeholder);

/* Downscaled copies (1/2, 1/4, 1/8, high-quality resampling): when a large image is shrunk a long way in one step the canvas samples only a few pixels, and edges turn blurry and ragged.
 * Drawing picks the level (mip) closest to the actual display size, so small sizes stay sharp too. */
async function buildMips(src) {
  const out = [];
  let w = src.width, h = src.height;
  while (Math.min(w, h) > 160) {
    w = Math.round(w / 2); h = Math.round(h / 2);
    try { out.push(await createImageBitmap(src, { resizeWidth: w, resizeHeight: h, resizeQuality: 'high' })); }
    catch { const cv = canvas(w, h), g = cv.getContext('2d'); g.imageSmoothingQuality = 'high'; g.drawImage(out[out.length - 1] || src, 0, 0, w, h); out.push(cv); }
  }
  return out;
}
// How many device pixels a width of dw (in user coordinates) actually covers under the current transform
function devScale(c) { const m = c.getTransform(); return Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || 1; }
// Pick the smallest image that is still at least as wide as the target display width
function pick(m, dw, c) {
  const need = dw * devScale(c);
  let best = m.img;
  if (m.mips) for (const im of m.mips) if (im.width >= need) best = im; else break;
  return best;
}

// Duotone (a dark → light gradient map), cached per (image, dark colour, light colour)
const DUO = {};
function duotone(key, dark, light) {
  const id = key + dark + light;
  if (DUO[id]) return DUO[id];
  const src = IMG[key] && IMG[key].img;
  if (!src) return null;
  const w = 960, h = Math.round(960 * src.height / src.width), cv = canvas(w, h), g = cv.getContext('2d');
  g.drawImage(src, 0, 0, w, h);
  const im = g.getImageData(0, 0, w, h), d = im.data, A = rgb(dark), B = rgb(light);
  for (let i = 0; i < d.length; i += 4) {
    let l = (d[i] * .3 + d[i + 1] * .59 + d[i + 2] * .11) / 255;
    l = clamp((l - .08) / .84); l = l * l * (3 - 2 * l);
    d[i] = A[0] + (B[0] - A[0]) * l; d[i + 1] = A[1] + (B[1] - A[1]) * l; d[i + 2] = A[2] + (B[2] - A[2]) * l;
  }
  g.putImageData(im, 0, 0);
  return (DUO[id] = cv);
}

// Cover-fit the image into (x,y,w,h) around its focus point; zoom>1 enlarges, fx/fy can be overridden
function drawCover(c, key, x, y, w, h, o = {}) {
  const m = IMG[key]; if (!m) return;
  const src = o.duo ? duotone(key, o.duo[0], o.duo[1]) : m.img;
  if (!src) return;
  const sw = src.width, sh = src.height;
  const z = o.zoom || 1, s = Math.max(w / sw, h / sh) * z;
  const fx = o.fx ?? m.fx, fy = o.fy ?? m.fy;
  let dx = x + w / 2 - fx * sw * s, dy = y + h / 2 - fy * sh * s;
  dx = Math.min(x, Math.max(x + w - sw * s, dx)); dy = Math.min(y, Math.max(y + h - sh * s, dy));
  c.drawImage(o.duo ? src : pick(m, sw * s, c), dx, dy, sw * s, sh * s);
}

// Placeholder: a plain grey box with a cross, the number (the key name while there is no number yet) and the key. Drawn w×h, centred on (0,0)
function placeholder(c, key, w, h, o = {}) {
  const m = IMG[key] || {}, s = Math.min(w, h);
  c.fillStyle = o.col || C.light; c.fillRect(-w / 2, -h / 2, w, h);
  c.save(); c.strokeStyle = C.mid; c.lineWidth = 2;
  c.beginPath(); c.moveTo(-w / 2, -h / 2); c.lineTo(w / 2, h / 2); c.moveTo(w / 2, -h / 2); c.lineTo(-w / 2, h / 2); c.stroke();
  c.lineWidth = 4; c.strokeRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 4); c.restore();
  c.fillStyle = o.col || C.light; c.fillRect(-s * .36, -s * .17, s * .72, s * .46);      // a clear patch behind the text
  txt(c, m.no != null ? '#' + m.no : key, 0, -s * .03, { f: 'goth', w: 700, size: m.no != null ? s * .2 : Math.min(s * .11, w * 1.2 / Math.max(4, key.length)), color: C.dark });
  txt(c, m.no != null ? key : 'no image', 0, s * .17, { f: 'goth', w: 500, size: s * .06, color: C.mid });
}

/* Card: shape = rect | round | circle | heart | tear | para (slanted sides) | polaroid
 * o: rot, scale, border (white border), bcol, shadow (flat drop shadow colour), shx/shy, zoom, face (use the face focus point), duo, alpha, tone (a colour laid over the image), dots, line, label (text under a polaroid)
 */
function cardPath(c, shape, w, h, o) {
  c.beginPath();
  if (shape === 'circle') c.ellipse(0, 0, w / 2, h / 2, 0, 0, TAU);
  else if (shape === 'round') c.roundRect(-w / 2, -h / 2, w, h, o.radius ?? Math.min(w, h) * .08);
  else if (shape === 'heart') { const s = Math.min(w, h) * .5; c.moveTo(0, s * .95); c.bezierCurveTo(-s * 1.35, s * .05, -s * 1.05, -s * 1.12, 0, -s * .45); c.bezierCurveTo(s * 1.05, -s * 1.12, s * 1.35, s * .05, 0, s * .95); c.closePath(); }
  else if (shape === 'tear') { const r = w / 2; c.moveTo(0, -h / 2); c.bezierCurveTo(r * .5, -h * .2, r, h / 2 - r * 1.2, r, h / 2 - r); c.arc(0, h / 2 - r, r, 0, Math.PI); c.bezierCurveTo(-r, h / 2 - r * 1.2, -r * .5, -h * .2, 0, -h / 2); c.closePath(); }
  else if (shape === 'para') { const k = o.skew ?? h * .22; c.moveTo(-w / 2 + k, -h / 2); c.lineTo(w / 2, -h / 2); c.lineTo(w / 2 - k, h / 2); c.lineTo(-w / 2, h / 2); c.closePath(); }
  else c.rect(-w / 2, -h / 2, w, h);
}
function card(c, key, x, y, w, h, o = {}) {
  const shape = o.shape || 'rect';
  c.save();
  c.translate(x, y); if (o.rot) c.rotate(o.rot); if (o.scale) c.scale(o.scale, o.scale);
  if (o.alpha != null) c.globalAlpha *= o.alpha;
  const pol = shape === 'polaroid', bw = o.border ?? (pol ? w * .05 : 0);
  const iw = w, ih = h;
  // Frame
  const fw = w + bw * 2, fh = pol ? h + bw * 2 + h * .2 : h + bw * 2, fy = pol ? h * .1 : 0;
  if (o.shadow) {
    c.save(); c.translate(o.shx ?? 14, (o.shy ?? 14) + fy); c.fillStyle = o.shadow;
    cardPath(c, pol ? 'rect' : shape, fw, fh, o); c.fill(); c.restore();
  }
  if (bw) { c.save(); c.translate(0, fy); c.fillStyle = o.bcol || C.white; cardPath(c, pol ? 'rect' : shape, fw, fh, o); c.fill(); c.restore(); }
  // Image
  c.save();
  cardPath(c, pol ? 'rect' : shape, iw, ih, o); c.clip();
  const m = IMG[key];
  if (m && m.img) {
    const f = o.face ? m.face : null;
    drawCover(c, key, -iw / 2, -ih / 2, iw, ih, { zoom: (f ? f[2] : 1) * (o.zoom || 1), fx: f ? f[0] : o.fx, fy: f ? f[1] : o.fy, duo: o.duo });
  } else placeholder(c, key, iw, ih, o);
  if (o.tone) { c.fillStyle = o.tone; c.globalCompositeOperation = o.toneOp || 'source-over'; c.fillRect(-iw / 2, -ih / 2, iw, ih); }
  if (o.dots) { c.globalAlpha = o.dots; c.fillStyle = dotPattern(c, o.dotCol || '#ffffff', 10, 1.6); c.fillRect(-iw / 2, -ih / 2, iw, ih); }
  c.restore();
  if (o.line) { c.lineWidth = o.lw || 4; c.strokeStyle = o.line; cardPath(c, pol ? 'rect' : shape, iw, ih, o); c.stroke(); }
  if (pol && o.label) txt(c, o.label, 0, ih / 2 + bw + h * .1, { f: 'goth', size: Math.max(16, h * .075), color: C.fg, w: 700 });
  c.restore();
}
