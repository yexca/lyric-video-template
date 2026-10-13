"""File manifest of data/ and ref/ → data.manifest.txt (in git).

    python tools/data_manifest.py            # regenerate the manifest
    python tools/data_manifest.py --check    # compare with the last manifest: list what is missing, changed and new

data/ and ref/ are not in git, so they have no backup and nobody would notice if something went missing. This manifest records in the repository which files should exist, with the size and SHA-1 of each:
run --check once after moving to another machine or restoring a backup to see whether everything is there. The manifest holds only relative paths, sizes and hashes, never file contents.
Not listed: data/checks/ (check screenshots, can be retaken at any time), data/thumbs/ (thumbnail cache), data/derived/usage/ (appearance times measured by the image page, can be re-measured at any time), data/export/ (finished videos), data/tmp/ (temporary files), data/pydeps/ (optional dependencies), data/models/ (downloaded models).
"""
import hashlib
import sys

from paths import DATA, REF, ROOT

OUT = ROOT / 'data.manifest.txt'
SKIP = ('data/checks/', 'data/thumbs/', 'data/derived/usage/', 'data/export/', 'data/tmp/', 'data/pydeps/', 'data/models/', 'data/.')


def scan():
    rows = {}
    for base in (REF, DATA):
        for p in sorted(base.rglob('*')) if base.is_dir() else []:
            rel = p.relative_to(ROOT).as_posix()
            if not p.is_file() or rel.startswith(SKIP) or p.name in ('README.md', 'README.zh-cn.md', '.gitkeep'):
                continue
            h = hashlib.sha1()
            with open(p, 'rb') as f:
                while chunk := f.read(1 << 20):
                    h.update(chunk)
            rows[rel] = (p.stat().st_size, h.hexdigest())
    return rows


def main(argv):
    now = scan()
    if '--check' not in argv:
        OUT.write_text(''.join(f'{sha}  {size:>12}  {rel}\n' for rel, (size, sha) in now.items()), 'utf-8', newline='\n')
        print(f'{len(now)} files, {sum(s for s, _ in now.values()) / 1e6:.1f} MB → data.manifest.txt')
        return
    if not OUT.exists():
        raise SystemExit('data.manifest.txt does not exist yet (run once without --check first)')
    old = {}
    for line in OUT.read_text('utf-8').splitlines():
        sha, size, rel = line.split(None, 2)
        old[rel] = (int(size), sha)
    lost = [r for r in old if r not in now]
    changed = [r for r in old if r in now and now[r] != old[r]]
    added = [r for r in now if r not in old]
    for tag, rels in (('missing', lost), ('changed', changed), ('new', added)):
        for r in rels:
            print(f'{tag}  {r}')
    print(f'Manifest lists {len(old)} files: {len(lost)} missing, {len(changed)} changed, {len(added)} new (to record the new ones in the manifest, run again without --check)')
    sys.exit(1 if lost or changed else 0)


if __name__ == '__main__':
    main(sys.argv[1:])
