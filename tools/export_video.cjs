// Full-song export: render frame by frame → encode with ffmpeg → mux in data/audio/audio.m4a
//   node tools/export_video.cjs [version] [out.mp4] [fps=30] [workers] [--scale=2]  (--scale=2 → 4K; workers omitted: 3 at 1080p, 1 at 4K)
// Without a version, project.json's current is used; without an output file, it is <export_dir>/<slug>_<version>.mp4
// (export_dir defaults to data/export inside the workspace).
// Needs the preview server running (python tools/serve.py; set the port with MV_PORT) and ffmpeg on the PATH.
// The picture is a pure function of time, so the segments are rendered in parallel and simply concatenated; the result matches a single-worker render frame for frame.
// Only one export can run at a time: two together run out of memory and x264 fails to allocate. data/.export.lock records the one that is running.
// Memory needed per worker (measured: x264 preset slow + one headless Chrome): about 2 GB at 1080p, about 5 GB at 4K. When it runs short, x264 prints
// "malloc of size … failed" and the whole export fails — so 4K defaults to 1 worker; before using more, check that free memory covers "workers × 5 GB".
const fs = require('node:fs'), path = require('node:path'), { spawn } = require('node:child_process');
const { launch } = require('./cdp.cjs');
const { DATA, config, takeVersion, exportDir, pageURL } = require('./paths.cjs');
const [version, args] = takeVersion(process.argv.slice(2));
// Positional arguments: the one with an extension is the output file; the plain numbers are fps, then workers (no need to remember where the file goes: export_video.cjs 30 2 and export_video.cjs out.mp4 30 2 both work)
const pos = args.filter(a => !a.startsWith('--'));
const outArg = pos.find(a => isNaN(a)), [fpsArg, wArg] = pos.filter(a => !isNaN(a));
if (outArg && !/\.(mp4|mov|mkv)$/i.test(outArg)) { console.error(`The output file needs an extension (.mp4): ${outArg}`); process.exit(1); }
const out = path.resolve(outArg || path.join(exportDir(), `${config().slug || 'video'}_${version}.mp4`));
// --scale=2 → 3840×2160 (4K). The picture keeps the same logical coordinates; only the canvas is larger and everything is scaled up
const scale = +((args.find(a => a.startsWith('--scale=')) || '').split('=')[1] || 1);
const fps = +(fpsArg || 30), workers = +(wArg || (scale >= 2 ? 1 : 3));
// Segment files go next to the finished video (<video name>_parts/) and are deleted once merged
const seg = path.join(path.dirname(out), path.basename(out, path.extname(out)) + '_parts');
const PAGE = pageURL(version, 'export' + (scale !== 1 ? '&scale=' + scale : ''));
const AUDIO = path.join(DATA, 'audio', 'audio.m4a'), LOCK = path.join(DATA, '.export.lock');

// The headless Chromes and ffmpegs still open. When one worker fails the others are still running: shut them all down before exiting, otherwise mvcdp-* stays behind in data/tmp/ and segment files next to the finished video
const live = { pages: new Set(), ffs: new Set() };
let failed = false, jobs = [];
const shut = async p => { live.pages.delete(p); await p.close(); };

function lock() {
  try {
    const pid = +fs.readFileSync(LOCK, 'utf8');
    try { process.kill(pid, 0); throw new Error(`An export is already running (process ${pid}). Wait for it to finish before starting another.`); } catch (e) { if (e.code !== 'ESRCH') throw e; }
  } catch (e) { if (e.code !== 'ENOENT') throw e; }
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(LOCK, String(process.pid));
  process.on('exit', () => { try { fs.rmSync(LOCK, { force: true }); } catch {} });
}

// Confirm that this worker's page downloaded every js file and has the same number of shots (SEG entries) as the probe page (with several workers loading at once, a js file has been silently dropped before). If anything is missing, close this worker and reopen it.
// Scripts marked data-optional are data that may be absent (analysis.js before the audio analysis has been run)
const PAGE_CHECK = `(() => {
  const bad = [...document.scripts].filter(s => s.src && !s.dataset.optional).filter(s => { const e = performance.getEntriesByName(s.src)[0]; return !e || (e.responseStatus !== undefined && e.responseStatus !== 200); }).map(s => s.src.split('/').pop());
  return { bad, segs: SEG.length };
})()`;
async function launchChecked(tag, expect) {
  for (let i = 1; i <= 4; i++) {
    let p = null;
    try {
      p = await launch(PAGE);
      live.pages.add(p);
      if (failed) { await shut(p); throw new Error('stopped'); }
      const ck = await p.evaluate(PAGE_CHECK);
      if (!ck.bad.length && (!expect || ck.segs === expect)) return { p, segs: ck.segs };
      console.log(`[${tag}] page not fully loaded (missing ${ck.bad.join(', ') || '-'}, shots ${ck.segs}/${expect}), reopening ${i}/4`);
    } catch (e) { if (!failed) console.log(`[${tag}] launch failed: ${e.message}, reopening ${i}/4`); }
    if (p) await shut(p);
    if (failed) break;
    await new Promise(r => setTimeout(r, 3000));
  }
  throw new Error(`[${tag}] page still not fully loaded after four attempts`);
}

function encodeSegment(k, f0, f1, expect) {
  return (async () => {
    await new Promise(r => setTimeout(r, k * 4000));   // stagger the starts
    if (failed) throw new Error('stopped');
    const { p } = await launchChecked(k, expect);
    const file = path.join(seg, `seg_${k}.mp4`);
    const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-r', String(fps), file], { stdio: ['pipe', 'inherit', 'inherit'] });
    let ffErr = null;
    live.ffs.add(ff);
    ff.stdin.on('error', e => { ffErr = ffErr || e; });                 // keep node from crashing outright when ffmpeg fails midway
    ff.on('close', code => { live.ffs.delete(ff); if (code) ffErr = new Error(`ffmpeg worker ${k} exited with code ${code}${scale >= 2 || workers > 3 ? ' (if "malloc … failed" appears above, memory ran out: use fewer workers)' : ''}`); });
    const t0 = Date.now();
    for (let f = f0; f < f1; f++) {
      const url = await p.evaluate(`MV.frameAsync(${(f / fps).toFixed(5)}, 'image/jpeg', .95)`);
      const buf = Buffer.from(url.split(',')[1], 'base64');
      if (ffErr || failed) { await shut(p); throw ffErr || new Error('stopped'); }
      if (!ff.stdin.write(buf)) await new Promise(r => {       // wait for ffmpeg to catch up; whichever listener fires first removes the other (otherwise thousands pile up over a full song)
        const done = () => { ff.stdin.off('drain', done); ff.off('close', done); r(); };
        ff.stdin.once('drain', done); ff.once('close', done);
      });
      if ((f - f0) % 300 === 0) console.log(`[${k}] ${f - f0}/${f1 - f0}  ${((Date.now() - t0) / 1000).toFixed(0)}s`);
    }
    ff.stdin.end();
    if (ff.exitCode === null) await new Promise(r => ff.on('close', r));
    await shut(p);
    if (ffErr) throw ffErr;
    return file;
  })();
}

(async () => {
  lock();
  fs.mkdirSync(seg, { recursive: true });
  const { p: probe, segs } = await launchChecked('probe', 0);
  const dur = await probe.evaluate('MV.duration');
  await shut(probe);
  const total = Math.ceil(dur * fps), per = Math.ceil(total / workers);
  console.log(`${version}: ${total} frames @ ${fps}fps, ${1920 * scale}×${1080 * scale}, ${workers} workers, ${segs} shots → ${out}`);
  jobs = [...Array(workers)].map((_, k) => encodeSegment(k, k * per, Math.min(total, (k + 1) * per), segs));
  const files = await Promise.all(jobs);
  const list = path.join(seg, 'list.txt');
  fs.writeFileSync(list, files.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n'));
  const hasAudio = fs.existsSync(AUDIO);
  if (!hasAudio) console.log('Note: data/audio/audio.m4a is missing, so the exported video has no sound');
  await new Promise((res, rej) => spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', list,
    ...(hasAudio ? ['-i', AUDIO, '-map', '0:v', '-map', '1:a', '-c:a', 'copy', '-shortest'] : ['-map', '0:v']),
    '-c:v', 'copy', '-movflags', '+faststart', out], { stdio: 'inherit' })
    .on('close', code => (code ? rej(new Error('ffmpeg ' + code)) : res())));
  for (const f of [...files, list]) fs.rmSync(f, { force: true });
  try { fs.rmdirSync(seg); } catch {}
  console.log('done', out, (fs.statSync(out).size / 1e6).toFixed(0) + ' MB');
})().catch(async e => {
  console.error(e.message || e);
  failed = true;                                      // the other workers stop when they see this; wait for them to wind down (up to 30 s), then close whatever is still open and delete the segment files
  for (const ff of live.ffs) { try { ff.kill(); } catch {} }
  await Promise.race([Promise.allSettled(jobs), new Promise(r => setTimeout(r, 30000))]);
  await Promise.all([...live.pages].map(p => p.close().catch(() => {})));
  try { fs.rmSync(seg, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); } catch {}
  process.exit(1);
});
