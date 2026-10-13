"""Start a new version: copy the previous version (or the template) whole into a new folder; old versions stay exactly as they are.

    python tools/new_version.py              # one more iteration on the current version's line: v1_3 → v1_4 (when current is template → v1_1)
    python tools/new_version.py --line       # start a new line (a different approach, pursued in parallel): v1_x → v2_1, copied from the current version
    python tools/new_version.py --from v1_2  # choose which version to copy from (template works too: start again from the empty template)
    python tools/new_version.py v3_1         # name the new version directly

Version names are v<line>_<iteration>: a line is one overall approach, an iteration is the nth round of changes within that approach.
Afterwards current in project.json points to the new version (the tools default to it when no version is given). A version holds text files only; images and audio live in data/ and are shared.
The new version's js/lyrics.js is replaced with the latest lyrics/lyrics.js; every other file is the same as in the source version.
"""
import re
import shutil
import sys

from paths import LYRICS_JS, ROOT, VERSION_RE, config, version_dir, versions


def main(argv):
    known = {'--line', '--from'}
    if any(a.startswith('-') and a not in known for a in argv):       # --help or a mistyped argument: print the usage only, don't start a new version
        raise SystemExit(__doc__)
    src = argv[argv.index('--from') + 1] if '--from' in argv else (config().get('current') or 'template')
    extra = [a for i, a in enumerate(argv) if not a.startswith('-') and not VERSION_RE.match(a) and a != 'template' and (i == 0 or argv[i - 1] != '--from')]
    if extra:
        raise SystemExit('Unrecognised arguments: ' + ' '.join(extra) + ' (version names are written v<line>_<iteration>)')
    src_dir = version_dir(src)
    named = [a for a in argv if VERSION_RE.match(a) and a != src]
    have = [tuple(map(int, VERSION_RE.match(v).groups())) for v in versions()]
    if named:
        new = named[0]
    elif '--line' in argv or src == 'template':
        line = max([l for l, _ in have], default=0) + 1 if ('--line' in argv or not have) else max(l for l, _ in have)
        new = f'v{line}_{max([i for l, i in have if l == line], default=0) + 1}'
    else:
        line = int(VERSION_RE.match(src)[1])
        new = f'v{line}_{max(i for l, i in have if l == line) + 1}'
    dst = ROOT / new
    if dst.exists():
        raise SystemExit(f'{new} already exists')
    shutil.copytree(src_dir, dst, ignore=shutil.ignore_patterns('README.*.md'))     # the translated template README (README.zh-cn.md) is not carried over: a version has just one README.md
    if LYRICS_JS.exists():                           # the lyrics use the latest timeline (the copy in the previous version is a snapshot from its time)
        shutil.copyfile(LYRICS_JS, dst / 'js' / 'lyrics.js')
    path = ROOT / 'project.json'
    text, n = re.subn(r'("current"\s*:\s*)"[^"]*"', rf'\g<1>"{new}"', path.read_text('utf-8'), count=1)   # replace this one value only; the rest of the file is left exactly as written
    if not n:
        raise SystemExit('project.json has no "current" entry')
    path.write_text(text, 'utf-8', newline='\n')
    print(f'{src} → {new} (current in project.json is now {new})')
    print(f'Record in {new}/README.md what this version changes compared with the previous one.')


if __name__ == '__main__':
    main(sys.argv[1:])
