// Lyric-overlap check (text over text): scans frame by frame and lists the time spans where lyrics are covered by other text / another line of lyrics, or are covering a face.
//   node tools/overlap.cjs              current version, whole song
//   node tools/overlap.cjs v1_2 150 165 the given version, 150–165 s only
//   node tools/overlap.cjs --all        also list the ones that only flash by (< .3 s)
//   node tools/overlap.cjs --contrast   also check where the text colour is too close to the colour behind it (slower)
// Needs the preview server running (python tools/serve.py; set the port with MV_PORT). The rules are in tools/overlap_probe.js.
const fs = require('node:fs'), path = require('node:path');
const { launch } = require('./cdp.cjs');
const { takeVersion, pageURL } = require('./paths.cjs');
const [version, args] = takeVersion(process.argv.slice(2));
const all = args.includes('--all'), contrast = args.includes('--contrast');
const ts = args.filter(a => !a.startsWith('--')).map(Number);
const fmt = s => `${Math.floor(s / 60)}:${(s % 60).toFixed(2).padStart(5, '0')}`;
(async () => {
  const p = await launch(pageURL(version));
  await p.evaluate(fs.readFileSync(path.join(__dirname, 'overlap_probe.js'), 'utf8'));
  const [t0, t1] = ts.length >= 2 ? ts : [0, await p.evaluate('MV.duration')];
  const segs = await p.evaluate('MV.segs()');
  const name = t => { let n = ''; for (const [s, nm] of segs) if (s <= t) n = nm; return n; };
  const list = [];
  for (let a = t0; a < t1; a += 20) list.push(...await p.evaluate(`OVERLAP.run(${a}, ${Math.min(a + 20, t1) - 1e-6}, 1 / 8, { minDur: ${all ? 0 : .3}, contrast: ${contrast} })`));
  if (!list.length) console.log(`${version}: no overlaps found (${fmt(t0)} – ${fmt(t1)})`);
  for (const [a, b, k, A, ch] of list) console.log(`${fmt(a)} – ${fmt(b)}  ${name(a).padEnd(18)}  ${k.padEnd(14)}  over "${ch}"  max ${A} px²`);
  await p.close();
  process.exit(list.length ? 2 : 0);
})().catch(e => { console.error(e); process.exit(1); });
