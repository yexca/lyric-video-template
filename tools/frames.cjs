// Frame grabs at given times (for checking the picture):
//   node tools/frames.cjs 10 20.5 30                  -> data/checks/<version>/f_<t>.jpg
//   node tools/frames.cjs v1_2 --sheet 0 4 8 12 ...   -> data/checks/<version>/sheet.jpg (thumbnails in 4 columns, with times)
// Without a version, project.json's current is used. Needs the preview server running (python tools/serve.py; set the port with MV_PORT).
const fs = require('node:fs'), path = require('node:path');
const { launch } = require('./cdp.cjs');
const { DATA, takeVersion, pageURL } = require('./paths.cjs');
const [version, args] = takeVersion(process.argv.slice(2));
const sheet = args.includes('--sheet'), ts = args.filter(a => !a.startsWith('--')).map(Number);
const out = path.join(DATA, 'checks', version), rel = `data/checks/${version}`;
fs.mkdirSync(out, { recursive: true });
(async () => {
  const p = await launch(pageURL(version));
  if (sheet) {
    const url = await p.evaluate(`(async () => {
      const ts = ${JSON.stringify(ts)}, cols = 4, w = 480, h = 270, s = document.createElement('canvas');
      s.width = cols * w; s.height = Math.ceil(ts.length / cols) * h;
      const g = s.getContext('2d'), cv = document.getElementById('cv');
      ts.forEach((t, i) => { MV.frame(t); const x = (i % cols) * w, y = Math.floor(i / cols) * h; g.drawImage(cv, x, y, w, h);
        g.font = '16px monospace'; g.fillStyle = '#000'; g.fillRect(x, y, 70, 22); g.fillStyle = '#ff0'; g.fillText(t.toFixed(2), x + 5, y + 16); });
      return s.toDataURL('image/jpeg', .85);
    })()`);
    fs.writeFileSync(path.join(out, 'sheet.jpg'), Buffer.from(url.split(',')[1], 'base64'));
    console.log(`${rel}/sheet.jpg`);
  } else {
    for (const t of ts) {
      const url = await p.evaluate(`MV.frameAsync(${t}, 'image/jpeg', .9)`);
      fs.writeFileSync(path.join(out, `f_${t}.jpg`), Buffer.from(url.split(',')[1], 'base64'));
      console.log(`${rel}/f_${t}.jpg`);
    }
  }
  await p.close();
})().catch(e => { console.error(e); process.exit(1); });
