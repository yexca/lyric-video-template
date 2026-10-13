"""Preview server: every version and every tool on one port (with HTTP Range support, which seeking in the audio needs).

    python tools/serve.py [port]          # defaults to port in project.json; can be run from any directory

    http://127.0.0.1:8600/                 version list (versions.html)
    http://127.0.0.1:8600/v1_1/            one version
    http://127.0.0.1:8600/lyric-tool/      lyric timing
    http://127.0.0.1:8600/pic-tool/        the image page: overview and comparison
    These three tool pages and the video page's player are written in English and also have a Simplified Chinese UI (tools/i18n.js + each page's lang.zh-cn.js); the text returned by the endpoints below is English only.

Endpoints (requests from this machine only)
  GET  /__project          project info: title, current version, all versions
  GET  /__ls?dir=data/img  list images (only data/img, data/candidates, data/checks and ref/images are allowed)
  GET  /__thumb?f=data/img/a.png&w=320[&m=mtime]
                           thumbnail (WebP, no wider or taller than w; w must be one of the values in THUMB_W). Generated on the first request, stored in data/thumbs/<w>/,
                           and regenerated when the source file has changed. With m, the browser can cache it indefinitely (m changes whenever the file does).
                           Needs Pillow; if it isn't installed, or this image can't be scaled down, the original is served instead.
  GET  /__usage?v=v1_3     when each image of this version is on screen: {sig, data}. data is what the image page measured and stored last time
                           (data/derived/usage/<version>.json; null if never measured); sig is computed from this version's storyboard files, and a sig different from data.sig means it is time to re-measure.
  POST /__usage?v=v1_3     body = what the image page measured (JSON) → stored in data/derived/usage/<version>.json.
  POST /__pic_use          body = {"version", "no", "rev"} or {"version", "no", "cand": "hero/03.png"}, optionally with "as": alias
                           → switch this version to that revision of the image (pic.py use); a candidate is first added to the image pool (pic.py add; one that was added before is not added again).
  POST /__save_timing      body = the full text of the timeline (UTF-8) → back up to lyrics/backup/ first, write lyrics/timing.txt,
                           then run lyric-tool/lyrics.py --sync-kana: update lyrics/kana.txt from the timeline and regenerate lyrics.js.
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import threading
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, quote, urlsplit

from paths import CANDIDATES, DERIVED, IMAGE_EXT, LYRICS, PICS, ROOT, THUMBS, TIMING, USAGE, config, versions

try:
    from PIL import Image, features
    THUMB_W = (320, 640, 1024) if features.check('webp') else ()
except ImportError:                 # Pillow not installed: the image page uses the originals
    THUMB_W = ()

BACKUP = LYRICS / 'backup'
LISTABLE = ('data/img', 'data/candidates', 'data/checks', 'ref/images')
_thumb_locks, _thumb_guard = {}, threading.Lock()
_pic_lock = threading.Lock()        # swapping images on the image page: one change at a time (pics.json and images.json are each rewritten whole)
PIC_PY = ROOT / 'pic-tool' / 'pic.py'


def usage_sig(version):
    """Signature of this version's storyboard, used to tell whether it has changed: the count and the latest modification time of the page, the scripts in js/ and the beat data. Swapping an image (images.json) doesn't count: appearance times are recorded by key name."""
    files = [ROOT / version / 'index.html', DERIVED / 'analysis.js', *sorted((ROOT / version / 'js').glob('*.js'))]
    times = [f.stat().st_mtime_ns for f in files if f.is_file()]
    return f'{len(times)}.{max(times, default=0):x}'


def run_pic(*args):
    """Run pic.py; returns (whether it succeeded, what it printed)."""
    r = subprocess.run([sys.executable, str(PIC_PY), *map(str, args)], capture_output=True, text=True, encoding='utf-8', errors='replace',
                       timeout=60, env={**os.environ, 'PYTHONIOENCODING': 'utf-8'})
    return r.returncode == 0, (r.stdout + r.stderr).strip()


def pic_use(req):
    """A click on "Use this" on the image page. Returns (HTTP status, the content sent back to the page)."""
    version, no, alias = req.get('version'), req.get('no'), req.get('as') or None
    if version not in versions() + ['template'] or not isinstance(no, int):
        return 400, {'ok': False, 'msg': 'Invalid version or number'}
    with _pic_lock:
        if req.get('cand'):
            src = (CANDIDATES / str(req['cand'])).resolve()
            if not (src.is_file() and src.is_relative_to(CANDIDATES) and src.suffix.lower() in IMAGE_EXT):
                return 400, {'ok': False, 'msg': f"No such candidate: {req['cand']}"}
            pic = next((p for p in json.loads(PICS.read_text('utf-8'))['pics'] if p['no'] == no), None)
            if pic is None:
                return 400, {'ok': False, 'msg': f'#{no} is not registered'}
            ok, msg = run_pic('add', src, '--key', pic['key'], '--to', 'none', '--note', 'picked on the image page')
            if not ok:
                return 500, {'ok': False, 'msg': msg}
            digest = hashlib.sha1(src.read_bytes()).hexdigest()
            hit = next(((p, r) for p in json.loads(PICS.read_text('utf-8'))['pics'] for r in p['revs'] if r['sha1'] == digest), None)
            if hit is None or hit[0]['no'] != no:        # the same file was added earlier under a different number
                return 409, {'ok': False, 'msg': f"This candidate is already in the pool as #{hit[0]['no']} {hit[0]['key']}, not #{no}" if hit else msg}
            rev = hit[1]['rev']
        else:
            rev = req.get('rev')
        if not isinstance(rev, int):
            return 400, {'ok': False, 'msg': 'A revision or a candidate is required'}
        ok, msg = run_pic('use', version, no, rev, *(['--as', alias] if alias else []))
    return (200 if ok else 500), {'ok': ok, 'msg': msg, 'rev': rev}


def thumb(src, width):
    """Scale src (an image in the workspace) down to a WebP no larger than width: data/thumbs/<width>/<path>.<mtime>.webp. Reused as is when it already exists."""
    stem = src.relative_to(ROOT).as_posix().replace('/', '__')
    dst = THUMBS / str(width) / f'{stem}.{src.stat().st_mtime_ns:x}.webp'
    if dst.exists():
        return dst
    with _thumb_guard:
        lock = _thumb_locks.setdefault(dst, threading.Lock())
    with lock:                      # two simultaneous requests for the same image: make it only once
        if dst.exists():
            return dst
        dst.parent.mkdir(parents=True, exist_ok=True)
        for old in dst.parent.iterdir():        # the source file has changed: discard the earlier thumbnail
            if old.name.startswith(stem + '.') and old.name.count('.') == dst.name.count('.'):
                try:
                    old.unlink()
                except OSError:
                    pass
        tmp = dst.with_suffix('.tmp')
        with Image.open(src) as im:
            im.draft(None, (width, width))
            if im.mode not in ('RGB', 'RGBA'):
                im = im.convert('RGBA')
            im.thumbnail((width, width), Image.LANCZOS, reducing_gap=2.0)
            im.save(tmp, 'WEBP', quality=82, method=4)
        os.replace(tmp, dst)
    return dst


class Server(ThreadingHTTPServer):
    # On Windows only 5 connections are queued by default; when several headless Chrome workers load at once, the excess connections are simply dropped,
    # and a js file that never arrived raises no error either. Raise the queue to 256
    request_queue_size = 256
    daemon_threads = True


class Handler(SimpleHTTPRequestHandler):
    extensions_map = {**SimpleHTTPRequestHandler.extensions_map,
                      '.js': 'text/javascript', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8'}
    _remaining = _immutable = None

    def send_head(self):
        url = urlsplit(self.path)
        self._remaining = self._immutable = None
        if url.path == '/__thumb':
            if not self._thumb(parse_qs(url.query)):
                self.send_error(404)
                return None
        elif url.path == '/':
            self.path = '/versions.html'
        elif url.path == '/__project':
            return self._json(200, self._project())
        elif url.path == '/__ls':
            return self._ls(parse_qs(url.query).get('dir', [''])[0])
        elif url.path == '/__usage':
            return self._usage(parse_qs(url.query))
        rng = self.headers.get('Range')
        path = self.translate_path(self.path)
        m = re.match(r'bytes=(\d*)-(\d*)$', rng or '')
        if not m or not os.path.isfile(path):
            return super().send_head()
        size = os.path.getsize(path)
        start = int(m.group(1)) if m.group(1) else max(0, size - int(m.group(2)))
        end = int(m.group(2)) if m.group(1) and m.group(2) else size - 1
        end = min(end, size - 1)
        if start > end:
            self.send_error(416)
            return None
        f = open(path, 'rb')
        f.seek(start)
        self.send_response(206)
        self.send_header('Content-Type', self.guess_type(path))
        self.send_header('Content-Range', f'bytes {start}-{end}/{size}')
        self.send_header('Content-Length', str(end - start + 1))
        self.end_headers()
        self._remaining = end - start + 1
        return f

    def copyfile(self, source, outputfile):
        remaining = getattr(self, '_remaining', None)
        if remaining is None:
            return super().copyfile(source, outputfile)
        while remaining > 0:
            buf = source.read(min(65536, remaining))
            if not buf:
                break
            outputfile.write(buf)
            remaining -= len(buf)

    def end_headers(self):
        self.send_header('Accept-Ranges', 'bytes')
        if self._immutable:
            self.send_header('Cache-Control', 'max-age=31536000, immutable')
        elif urlsplit(self.path).path.endswith(('.html', '.js', '.css', '.txt', '.json', '/')) or self.path.startswith('/__'):
            self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

    def _local(self):
        return self.client_address[0] in ('127.0.0.1', '::1')

    def _json(self, code, obj):
        """Send JSON. For a GET it is called from send_head; the None it returns means the response has already been written."""
        body = json.dumps(obj, ensure_ascii=False).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)
        return None

    def _project(self):
        cfg = config()
        return {'title': cfg.get('title', ''), 'slug': cfg.get('slug', ''), 'current': cfg.get('current', 'template'),
                'versions': versions(), 'bar_offset': cfg.get('bar_offset', 0), 'thumbs': list(THUMB_W)}

    def _thumb(self, q):
        """Point self.path at the thumbnail (or at the original, if one can't be made); it is then served like any ordinary file. Returns False for a bad path."""
        rel = q.get('f', [''])[0]
        src = (ROOT / rel).resolve()
        if not (self._local() and src.is_file() and src.suffix.lower() in IMAGE_EXT
                and any(src.is_relative_to(ROOT / d) for d in LISTABLE)):
            return False
        out = src
        if q.get('w', [''])[0] in map(str, THUMB_W):
            try:
                out = thumb(src, int(q['w'][0]))
                self._immutable = 'm' in q
            except Exception as e:      # broken file, still being written, unknown format: serve the original and let the browser try
                self.log_message('thumb %s: %s', rel, e)
        self.path = '/' + quote(out.relative_to(ROOT).as_posix())
        return True

    def _ls(self, rel):
        rel = rel.strip('/')
        if not self._local() or rel not in LISTABLE:
            return self._json(403, {'ok': False, 'msg': 'not listable'})
        base, out = ROOT / rel, []
        if base.is_dir():
            for p in sorted(base.rglob('*')):
                if p.is_file() and p.suffix.lower() in IMAGE_EXT:
                    st = p.stat()
                    out.append({'path': p.relative_to(base).as_posix(), 'size': st.st_size, 'mtime': int(st.st_mtime)})
        return self._json(200, {'ok': True, 'dir': rel, 'files': out})

    def _usage(self, q, body=None):
        """GET: return the stored appearance times; POST (body = what the image page measured): store them."""
        version = q.get('v', [''])[0]
        if not self._local() or version not in versions() + ['template']:
            return self._json(403, {'ok': False, 'msg': 'no such version'})
        path = USAGE / f'{version}.json'
        if body is not None:
            data = json.loads(body)
            if not isinstance(data, dict) or not isinstance(data.get('keys'), dict):
                return self._json(400, {'ok': False, 'msg': 'not a usage file'})
            USAGE.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')) + '\n', 'utf-8', newline='\n')
            return self._json(200, {'ok': True})
        try:
            data = json.loads(path.read_text('utf-8'))
        except (OSError, ValueError):
            data = None
        return self._json(200, {'ok': True, 'sig': usage_sig(version), 'data': data})

    def do_POST(self):
        url = urlsplit(self.path)
        if url.path not in ('/__save_timing', '/__usage', '/__pic_use'):
            return self._json(404, {'ok': False, 'msg': 'unknown endpoint'})
        if not self._local():
            return self._json(403, {'ok': False, 'msg': 'local only'})
        n = int(self.headers.get('Content-Length') or 0)
        if not 0 < n < 2_000_000:
            return self._json(400, {'ok': False, 'msg': 'bad length'})
        text = self.rfile.read(n).decode('utf-8')
        if url.path != '/__save_timing':
            try:
                return self._usage(parse_qs(url.query), text) if url.path == '/__usage' else self._json(*pic_use(json.loads(text)))
            except (ValueError, AttributeError, OSError, subprocess.TimeoutExpired) as e:
                return self._json(400, {'ok': False, 'msg': str(e)})
        if '## ' not in text:
            return self._json(400, {'ok': False, 'msg': 'not a timing file'})
        BACKUP.mkdir(parents=True, exist_ok=True)
        if TIMING.exists():
            shutil.copy2(TIMING, BACKUP / f"timing_{time.strftime('%Y%m%d_%H%M%S')}.txt")
        TIMING.write_text(text.replace('\r\n', '\n'), 'utf-8', newline='\n')
        r = subprocess.run([sys.executable, str(ROOT / 'lyric-tool' / 'lyrics.py'), '--sync-kana'], capture_output=True, text=True, encoding='utf-8', timeout=180)
        msg = (r.stdout + r.stderr).strip()
        return self._json(200 if r.returncode == 0 else 500, {'ok': r.returncode == 0, 'msg': msg})


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else int(config().get('port', 8600))
    print(f'serving {ROOT} on http://127.0.0.1:{port}/   (lyric-tool: /lyric-tool/  pic-tool: /pic-tool/)')
    Server(('127.0.0.1', port), partial(Handler, directory=str(ROOT))).serve_forever()
