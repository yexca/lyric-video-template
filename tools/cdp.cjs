// Minimal CDP driver: opens the page in the local Chrome, headless, with no dependency on Playwright / Puppeteer (Node 22+ has WebSocket built in).
const { spawn } = require('node:child_process');
const fs = require('node:fs'), path = require('node:path');
const { config, fromRoot } = require('./paths.cjs');

const CHROME = process.env.CHROME || [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
].find(p => fs.existsSync(p));

// Chrome's temporary profile directory: 100–250 MB per worker, deleted after use. Defaults to data/tmp/ inside the workspace (not the system temp directory: no data leaves the workspace)
function tmpRoot() {
  const dir = fromRoot(config().tmp_dir || 'data/tmp');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

async function launch(url, { width = 1920, height = 1080 } = {}) {
  const port = 9300 + Math.floor(Math.random() * 500);
  const dir = fs.mkdtempSync(path.join(tmpRoot(), 'mvcdp-'));
  const proc = spawn(CHROME, [`--remote-debugging-port=${port}`, `--user-data-dir=${dir}`, '--headless=new', '--hide-scrollbars',
    '--autoplay-policy=no-user-gesture-required', '--mute-audio', `--window-size=${width},${height}`, 'about:blank'], { stdio: 'ignore' });
  let ws = null;
  // On close, wait for Chrome to really exit before deleting the temporary profile directory (with retries): straight after kill, Chrome still holds
  // the files and the delete fails, leaving a 100–250 MB mvcdp-* behind each time — enough to fill the disk within days. Callers must await p.close(); the failed-start branch also closes before throwing
  const close = () => new Promise(res => {
    try { if (ws) ws.close(); } catch {}
    let done = false;
    const rm = () => { if (done) return; done = true; try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 15, retryDelay: 300 }); } catch {} res(); };
    if (proc.exitCode !== null) return rm();
    proc.once('exit', () => setTimeout(rm, 400));
    proc.kill();
    setTimeout(rm, 10000);
  });
  let tabs;
  for (let i = 0; i < 300; i++) {           // wait up to 30 s (Chrome starts slowly when the machine is busy)
    try { tabs = await (await fetch(`http://127.0.0.1:${port}/json`)).json(); if (tabs.length) break; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  const tab = (tabs || []).find(t => t.type === 'page');
  // Chrome didn't come up: close it before throwing. Otherwise this Chrome and its temporary directory stay behind, and node can't exit while the child process is still attached (the export has finished but never ends, and keeps holding the lock)
  if (!tab) { await close(); throw new Error('Chrome did not start (no answer on the debugging port within 30 s)'); }
  ws = new WebSocket(tab.webSocketDebuggerUrl);
  await new Promise(r => ws.addEventListener('open', r, { once: true }));
  let id = 0; const pending = new Map();
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
  });
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  const evaluate = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await send('Page.enable');
  await send('Page.navigate', { url });
  for (let i = 0; i < 1200; i++) {          // wait up to 2 minutes (loading is slower when several workers start at once)
    try { if (await evaluate('!!(window.MV && window.MV.ready)')) break; } catch {}
    await new Promise(r => setTimeout(r, 100));
  }
  try {
    await evaluate('MV.ready');
    const missing = await evaluate('window.MV_MISSING');
    if (missing.length && !process.env.MV_ALLOW_MISSING) throw new Error('images failed to load: ' + missing.join(', '));
    const badLines = await evaluate('window.MV_BAD_LINES');       // the storyboard refers to lines that don't exist: their times become 0 s and the shot order goes wrong with them
    if (badLines.length && !process.env.MV_ALLOW_MISSING) throw new Error(`the storyboard refers to line numbers that do not exist: ${badLines.join(', ')}. Fix them in js/scenes.js`);   // MV_ALLOW_MISSING=1 can be set for previews (an export needs everything present)
  } catch (e) { await close(); throw e; }
  return { send, evaluate, close };
}
module.exports = { launch };
