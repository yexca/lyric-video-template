"""Image management: the image pool, the number registry and each version's image list.

    python pic-tool/pic.py add <file…> [--key key] [--group group] [--note note] [--to version… | --to none]
        Copy images into the image pool (data/img/) and register them. A new key gets the next number; an existing key gets a new revision of that image (r2, r3, …) and keeps its number.
        Without --key the file name is used as the key (the only option when adding several files at once).
        --to: make these versions use the new revision (default: the current version; --to none = add to the pool only, touching no version)
    python pic-tool/pic.py use <version> <number|key> [rev]           Make a version use a given revision of an image (no rev = the latest)
    python pic-tool/pic.py use <version> <number|key> <rev> --as <alias>
        Use another revision of the same image within one version: the storyboard refers to it by the alias (e.g. hero uses r2 while r1 is also used as hero_old). The number stays the same.
    python pic-tool/pic.py drop <version> <number|key> [--as alias]   Stop using this image in this version (the files in the pool and the number are kept); --as = remove only that alias
    python pic-tool/pic.py list [version]                             List the whole registry / the images one version uses
    python pic-tool/pic.py check                                      Check that no pool file is missing or modified, and that every version's image list matches the registry

Conventions
- data/img/ is append-only: a file added to it is never overwritten or renamed. Redrawing an image = a new revision = a new file (<key>.r2.png).
  So an old version always points at the file it used at the time, and old and new can be compared side by side.
- A number, once assigned, is never given to another image: "#37" is the same image in every version, at any time (different versions may use different revisions of it).
- pics.json (in the root, in git) = the registry: number ↔ key ↔ each revision's file name and SHA-1.
  <version>/images.json (in git) = which revision of which numbers this version uses. The image files themselves are not in git; these two text files are the record of "what each version looked like".
- Candidates go in data/candidates/<key>/ and are not registered; the chosen one is added to the pool with add.
"""
import hashlib
import json
import re
import shutil
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'tools'))
from paths import IMAGE_EXT, IMG, PICS, ROOT, config, version_dir, versions  # noqa: E402

KEY_RE = re.compile(r'^[a-z0-9][a-z0-9_]*$')


def sha1(path):
    return hashlib.sha1(Path(path).read_bytes()).hexdigest()


def load():
    return json.loads(PICS.read_text('utf-8')) if PICS.exists() else {'next': 1, 'pics': []}


def save(reg):
    PICS.write_text(json.dumps(reg, ensure_ascii=False, indent=1) + '\n', 'utf-8', newline='\n')


def find(reg, ref):
    """Find a registry entry by number (37 / #37) or by key."""
    ref = str(ref).lstrip('#')
    for p in reg['pics']:
        if str(p['no']) == ref or p['key'] == ref:
            return p
    raise SystemExit(f'Not registered: {ref}')


def manifest_path(version):
    return version_dir(version) / 'images.json'


def read_manifest(version):
    path = manifest_path(version)
    return json.loads(path.read_text('utf-8')) if path.exists() else []


def write_manifest(version, items):
    items = sorted(items, key=lambda it: (it['no'], it.get('as', '')))
    body = ',\n'.join(' ' + json.dumps(it, ensure_ascii=False) for it in items)
    manifest_path(version).write_text(f'[\n{body}\n]\n' if items else '[]\n', 'utf-8', newline='\n')


def set_use(version, pic, rev, alias=None):
    items = [it for it in read_manifest(version) if not (it['no'] == pic['no'] and it.get('as') == alias)]
    item = {'no': pic['no'], 'key': pic['key'], 'rev': rev['rev'], 'file': rev['file']}
    if alias:
        item['as'] = alias
    items.append(item)
    write_manifest(version, items)


def opt(argv, name, many=False):
    """Take the value of --name out of argv (many: keep taking until the next argument that starts with --). Returns (value, remaining arguments)."""
    if name not in argv:
        return ([] if many else None), argv
    i = argv.index(name)
    j = i + 1
    while j < len(argv) and not argv[j].startswith('--') and (many or j == i + 1):
        j += 1
    vals = argv[i + 1:j]
    if not vals:
        raise SystemExit(f'{name} needs a value')
    return (vals if many else vals[0]), argv[:i] + argv[j:]


def cmd_add(argv):
    key, argv = opt(argv, '--key')
    group, argv = opt(argv, '--group')
    note, argv = opt(argv, '--note')
    to, argv = opt(argv, '--to', many=True)
    targets = [] if to == ['none'] else (to or [config().get('current') or 'template'])
    for v in targets:
        version_dir(v)
    files = [Path(a) for a in argv]
    if not files:
        raise SystemExit('No image file given')
    if key and len(files) > 1:
        raise SystemExit('--key cannot be used when adding several files at once (each one uses its file name as its key)')
    reg = load()
    IMG.mkdir(parents=True, exist_ok=True)
    for src in files:
        if not src.is_file() or src.suffix.lower() not in IMAGE_EXT:
            raise SystemExit(f'Not an image file: {src}')
        k = key or re.sub(r'[^a-z0-9]+', '_', src.stem.lower()).strip('_')
        if not KEY_RE.match(k):
            raise SystemExit(f'A key may only contain lowercase letters, digits and underscores: {k!r} (set one with --key)')
        digest = sha1(src)
        dup = next(((p, r) for p in reg['pics'] for r in p['revs'] if r['sha1'] == digest), None)
        if dup:
            pic, rev = dup
            print(f"Already in the pool: #{pic['no']} {pic['key']} r{rev['rev']} ({rev['file']}); not added again")
        else:
            pic = next((p for p in reg['pics'] if p['key'] == k), None)
            if pic is None:
                pic = {'no': reg['next'], 'key': k, 'group': group or '', 'note': '', 'revs': []}
                reg['pics'].append(pic)
                reg['next'] += 1
            elif group:
                pic['group'] = group
            n = len(pic['revs']) + 1
            name = f'{k}{"" if n == 1 else f".r{n}"}{src.suffix.lower()}'
            if (IMG / name).exists():
                raise SystemExit(f'data/img/{name} already exists but is not registered (run check first to see what happened)')
            shutil.copy2(src, IMG / name)
            try:
                origin = src.resolve().relative_to(ROOT).as_posix()
            except ValueError:
                origin = src.name
            rev = {'rev': n, 'file': name, 'sha1': digest, 'added': time.strftime('%Y-%m-%d'), 'from': origin, 'note': note or ''}
            pic['revs'].append(rev)
            print(f"#{pic['no']} {k} r{n} → data/img/{name}")
        for v in targets:
            set_use(v, pic, rev)
            print(f"  {v} uses #{pic['no']} r{rev['rev']}")
    save(reg)


def cmd_use(argv):
    alias, argv = opt(argv, '--as')
    if len(argv) < 2 or (alias and len(argv) < 3):
        raise SystemExit('Usage: use <version> <number|key> [rev] or use <version> <number|key> <rev> --as <alias>')
    reg = load()
    if alias and (not KEY_RE.match(alias) or any(p['key'] == alias for p in reg['pics'])):
        raise SystemExit(f'An alias may only contain lowercase letters, digits and underscores, and must not be the same as an existing key: {alias!r}')
    pic = find(reg, argv[1])
    want = int(argv[2].lstrip('r')) if len(argv) > 2 else pic['revs'][-1]['rev']
    rev = next((r for r in pic['revs'] if r['rev'] == want), None)
    if rev is None:
        raise SystemExit(f"#{pic['no']} has no r{want} (it has: {', '.join('r' + str(r['rev']) for r in pic['revs'])})")
    set_use(argv[0], pic, rev, alias)
    print(f"{argv[0]} uses #{pic['no']} {pic['key']} r{rev['rev']} ({rev['file']})" + (f', under the alias {alias}' if alias else ''))


def cmd_drop(argv):
    alias, argv = opt(argv, '--as')
    if len(argv) < 2:
        raise SystemExit('Usage: drop <version> <number|key> [--as alias]')
    pic = find(load(), argv[1])
    items = read_manifest(argv[0])
    kept = [it for it in items if not (it['no'] == pic['no'] and (alias is None or it.get('as') == alias))]
    if len(kept) == len(items):
        raise SystemExit(f"{argv[0]} does not use #{pic['no']} {pic['key']} in the first place")
    write_manifest(argv[0], kept)
    print(f"{argv[0]} no longer uses #{pic['no']} {pic['key']}")


def cmd_list(argv):
    reg = load()
    if argv:
        for it in read_manifest(argv[0]):
            print(f"#{it['no']:<4} r{it['rev']:<2} {it['key']:<28} {it['file']}" + (f"  (alias {it['as']})" if it.get('as') else ''))
        return
    used = {}
    for v in versions() + ['template']:
        for it in read_manifest(v):
            used.setdefault((it['no'], it['rev']), []).append(v)
    for p in reg['pics']:
        print(f"#{p['no']:<4} {p['key']:<28} {p['group']}")
        for r in p['revs']:
            print(f"      r{r['rev']:<2} {r['file']:<34} {r['added']}  {' '.join(used.get((p['no'], r['rev']), [])) or '(not used by any version)'}")
    print(f"{len(reg['pics'])} registered, next number {reg['next']}")


def cmd_check(_argv):
    reg, bad = load(), []
    known = {}
    for p in reg['pics']:
        for r in p['revs']:
            known[r['file']] = (p, r)
            f = IMG / r['file']
            if not f.exists():
                bad.append(f"Missing: #{p['no']} r{r['rev']} data/img/{r['file']}")
            elif sha1(f) != r['sha1']:
                bad.append(f"Modified: #{p['no']} r{r['rev']} data/img/{r['file']} (files in the pool must not be overwritten; add a redraw as a new revision with add)")
    nos = [p['no'] for p in reg['pics']]
    if len(set(nos)) != len(nos) or (nos and max(nos) >= reg['next']):
        bad.append('pics.json has duplicate numbers, or next is not greater than the highest number in use')
    if IMG.is_dir():
        for f in sorted(IMG.iterdir()):
            if f.is_file() and f.suffix.lower() in IMAGE_EXT and f.name not in known:
                bad.append(f'Unregistered: data/img/{f.name} (register it with add, or move it to data/candidates/)')
    keys = {p['key'] for p in reg['pics']}
    for v in versions() + ['template']:
        names = [it.get('as') or it['key'] for it in read_manifest(v)]
        for name in sorted({n for n in names if names.count(n) > 1}):
            bad.append(f'{v}/images.json: {name} appears more than once')
        for it in read_manifest(v):
            if it.get('as') in keys:
                bad.append(f"{v}/images.json: alias {it['as']} has the same name as an existing key")
            hit = known.get(it['file'])
            if hit is None:
                bad.append(f"{v}/images.json: #{it['no']} points at an unregistered file, {it['file']}")
            elif hit[0]['no'] != it['no'] or hit[0]['key'] != it['key'] or hit[1]['rev'] != it['rev']:
                bad.append(f"{v}/images.json: #{it['no']} {it['key']} r{it['rev']} does not match the registry ({it['file']} is registered as #{hit[0]['no']} {hit[0]['key']} r{hit[1]['rev']})")
    for line in bad:
        print(line)
    print(f"Images: {len(reg['pics'])}, files: {len(known)}, " + (f'problems: {len(bad)}' if bad else 'no problems'))
    sys.exit(1 if bad else 0)


COMMANDS = {'add': cmd_add, 'use': cmd_use, 'drop': cmd_drop, 'list': cmd_list, 'check': cmd_check}

if __name__ == '__main__':
    if len(sys.argv) < 2 or sys.argv[1] not in COMMANDS:
        raise SystemExit(__doc__)
    COMMANDS[sys.argv[1]](sys.argv[2:])
