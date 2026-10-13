"""Project paths and configuration: every Python tool takes its paths from here instead of building its own.

Directory layout (details in docs/usage.md)
- ref/    Source material supplied by the user (lyrics, audio, reference images). Read-only for the tools: nothing is written here.
- data/   Non-text files the tools produce (decoded / separated audio, the image pool, candidates, check screenshots, exports, temporary files). Not in git.
          No data leaves the workspace: finished videos in data/export/, the temp directory is data/tmp/, optional dependencies in data/pydeps/, downloaded models in data/models/.
- lyrics/ Lyric readings and the per-mora timeline (text, in git).
- v<line>_<iteration>/  The versions (v1_1, v1_2, v2_1 …); template/ is the starting point for a new version.

Configuration: project.json (in git) + project.local.json (machine-specific, not in git; a key in it overrides the same key in project.json).
"""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REF = ROOT / 'ref'
DATA = ROOT / 'data'
AUDIO = DATA / 'audio'            # audio.wav / audio.m4a / vocals.wav / vocals.m4a + the feature cache
DERIVED = DATA / 'derived'        # analysis.js / vocal_onset.js (computed from the audio; can be recomputed at any time)
USAGE = DERIVED / 'usage'         # <version>.json: when each image is on screen (measured by the image page; can be re-measured at any time)
IMG = DATA / 'img'                # the image pool: append-only; a redraw is a new file
CANDIDATES = DATA / 'candidates'
CHECKS = DATA / 'checks'
THUMBS = DATA / 'thumbs'          # thumbnail cache for the image page (generated on demand by tools/serve.py; safe to delete at any time)
PYDEPS = DATA / 'pydeps'          # optional dependencies (demucs) are installed here, not into the system Python
MODELS = DATA / 'models'          # models the optional dependencies download themselves (tools/separate.py points torch's cache directory here); can be re-downloaded at any time
LYRICS = ROOT / 'lyrics'
KANA = LYRICS / 'kana.txt'
TIMING = LYRICS / 'timing.txt'
LYRICS_JS = LYRICS / 'lyrics.js'
SOURCE = LYRICS / 'source.lrc'   # the lyrics embedded in the audio tags (extracted by lyrics.py --init when ref/ has no lyrics file)
PICS = ROOT / 'pics.json'         # the registry of image numbers

VERSION_RE = re.compile(r'^v(\d+)_(\d+)$')
AUDIO_EXT = ('.wav', '.flac', '.mp3', '.m4a', '.aac', '.opus', '.ogg')
LYRIC_EXT = ('.lrc', '.txt')
IMAGE_EXT = ('.png', '.jpg', '.jpeg', '.webp')


def config() -> dict:
    cfg = json.loads((ROOT / 'project.json').read_text('utf-8'))
    local = ROOT / 'project.local.json'
    if local.exists():
        cfg.update(json.loads(local.read_text('utf-8')))
    return cfg


def versions() -> list[str]:
    """The existing version directories, sorted by line, then iteration."""
    found = [(int(m[1]), int(m[2]), p.name) for p in ROOT.iterdir() if p.is_dir() and (m := VERSION_RE.match(p.name))]
    return [name for _, _, name in sorted(found)]


def version_dir(name: str | None = None) -> Path:
    """A version's directory; with no name given, the one named by current in project.json."""
    name = name or config().get('current') or 'template'
    if name != 'template' and not VERSION_RE.match(name):
        raise SystemExit(f'Invalid version name: {name} (expected v<line>_<iteration>, e.g. v1_3)')
    path = ROOT / name
    if not path.is_dir():
        raise SystemExit(f'No such version directory: {name}')
    return path


def _pick(sub: str, exts: tuple[str, ...], configured: str, what: str) -> Path | None:
    """The one file in ref/<sub>/; a file placed directly in the ref/ root counts too. Returns None when there is none."""
    if configured:
        path = ROOT / configured
        if not path.is_file():
            raise SystemExit(f'The {what} specified in project.json does not exist: {configured}')
        return path
    found = sorted(p for folder in (REF / sub, REF) if folder.is_dir() for p in folder.glob('*') if p.suffix.lower() in exts)
    if len(found) > 1:
        names = ''.join(f'\n  {p.relative_to(ROOT).as_posix()}' for p in found)
        raise SystemExit(f'ref/ contains more than one {what}; specify which one to use in project.json:{names}')
    return found[0] if found else None


def ref_audio() -> Path:
    path = _pick('audio', AUDIO_EXT, config().get('audio', ''), 'audio file')
    if not path:
        raise SystemExit(f'No audio file in ref/audio/ (supported: {" ".join(AUDIO_EXT)})')
    return path


def ref_lyrics() -> Path:
    """The original lyrics: the file in ref/lyrics/ (or the ref/ root); failing that, lyrics/source.lrc as extracted from the audio tags."""
    path = _pick('lyrics', LYRIC_EXT, config().get('lyrics', ''), 'lyrics file') or (SOURCE if SOURCE.exists() else None)
    if not path:
        raise SystemExit(f'No lyrics file in ref/lyrics/ (supported: {" ".join(LYRIC_EXT)}), and the audio file has no embedded lyrics either')
    return path


def export_dir() -> Path:
    path = Path(config().get('export_dir') or 'data/export')
    return path if path.is_absolute() else ROOT / path
