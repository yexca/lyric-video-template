'use strict';
// Project paths and configuration (shared by the Node tools; the Python side is tools/paths.py, with the same conventions).
const fs = require('node:fs'), path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const DATA = path.join(ROOT, 'data');
const VERSION_RE = /^v(\d+)_(\d+)$/;

function config() {
  const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'project.json'), 'utf8'));
  const local = path.join(ROOT, 'project.local.json');
  return fs.existsSync(local) ? { ...cfg, ...JSON.parse(fs.readFileSync(local, 'utf8')) } : cfg;
}

// The version name among the command-line arguments (v1_3 / template); if none is given, project.json's current is used. Returns [version, remaining arguments]
function takeVersion(args) {
  const i = args.findIndex(a => a === 'template' || VERSION_RE.test(a));
  const name = i >= 0 ? args[i] : (config().current || 'template');
  if (!fs.existsSync(path.join(ROOT, name, 'index.html'))) { console.error(`No such version: ${name}`); process.exit(1); }
  return [name, i >= 0 ? [...args.slice(0, i), ...args.slice(i + 1)] : args];
}

const fromRoot = p => (path.isAbsolute(p) ? p : path.join(ROOT, p));
const exportDir = () => fromRoot(config().export_dir || 'data/export');
const pageURL = (version, query = 'export') => `http://127.0.0.1:${process.env.MV_PORT || config().port || 8600}/${version}/index.html?${query}`;

module.exports = { ROOT, DATA, config, takeVersion, fromRoot, exportDir, pageURL };
