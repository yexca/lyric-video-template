"""Candidate overview sheet: tiles the candidates in data/candidates/ into one image (data/checks/candidates.jpg) so they can be compared at a glance.

    python tools/cand_sheet.py              # all of them
    python tools/cand_sheet.py hero bg      # the given keys
    python tools/cand_sheet.py --zoom hero/01 0.1 0.2 0.5 0.6   # zoom in on one region (x0 y0 x1 y1, 0..1) → data/checks/zoom.jpg
    python tools/cand_sheet.py --zoom hero/01 .1 .2 .5 .6 hero/02 .1 .2 .5 .6 bg/03 .3 .5 .7 .8
                                                                # zoom in on several regions at once, tiled into one image (when picking, line up the spots each candidate tends to get wrong)
    python tools/cand_sheet.py --zoom hero/01 hero/02 hero/03 --box .1 .2 .5 .6   # the same region of several images
    python tools/cand_sheet.py --zoom img/hero.r2.png .1 .2 .5 .6                 # an image in the image pool (data/img/), for self-review of images already in use
    python tools/cand_sheet.py --zoom … --out detail                              # save as data/checks/detail.jpg (default: zoom.jpg)

Each item after --zoom is "image [x0 y0 x1 y1]": write the image as key/NN (a candidate in data/candidates/) or img/filename (the image pool);
an item without a region uses the one given by --box, or the whole image when there is no --box either.
"""
import sys

from PIL import Image, ImageDraw

from paths import CANDIDATES, CHECKS, DATA


def on_gray(im, size):
    im = im.convert('RGBA')
    im.thumbnail(size)
    bg = Image.new('RGB', im.size, (150, 156, 170))
    bg.paste(im, mask=im.split()[-1])
    return bg


def is_num(a):
    try:
        float(a)
        return True
    except ValueError:
        return False


def source(name):
    """key/NN → a candidate; img/filename → the image pool"""
    return DATA / name if name.startswith('img/') else CANDIDATES / (name + '.png')


def zoom(argv):
    def take(flag, n):                               # pull out the n values that follow flag
        if flag not in argv:
            return None
        i = argv.index(flag)
        vals = argv[i + 1:i + 1 + n]
        del argv[i:i + 1 + n]
        return vals
    argv = list(argv)
    out = (take('--out', 1) or ['zoom'])[0]
    box0 = [float(v) for v in (take('--box', 4) or [0, 0, 1, 1])]
    rest, items = argv[argv.index('--zoom') + 1:], []
    while rest and not rest[0].startswith('--'):
        name, nums = rest.pop(0), []
        while rest and is_num(rest[0]) and len(nums) < 4:
            nums.append(float(rest.pop(0)))
        if nums and len(nums) != 4:
            raise SystemExit(f'The region after {name} takes 4 numbers (x0 y0 x1 y1, 0..1), or none at all')
        if not source(name).is_file():
            raise SystemExit(f'No such image: {source(name)}')
        items.append((name, nums or box0))
    if not items:
        raise SystemExit(__doc__)
    crops = []
    for name, box in items:
        im = Image.open(source(name)).convert('RGBA')
        w, h = im.size
        crops.append(im.crop((int(box[0] * w), int(box[1] * h), int(box[2] * w), int(box[3] * h))))
    path = CHECKS / (out + '.jpg')
    if len(items) == 1:                              # one region: enlarge it as far as possible
        crop = crops[0]
        k = min(4, 1600 / max(crop.size))
        crop = crop.resize((int(crop.width * k), int(crop.height * k)), Image.LANCZOS)
        sheet = Image.new('RGB', crop.size, (150, 156, 170))
        sheet.paste(crop, mask=crop.split()[-1])
    else:                                            # several regions: one cell each, labelled with the image and the region
        cell, cols = 620, min(4, len(items))
        rows = (len(items) + cols - 1) // cols
        sheet = Image.new('RGB', (cols * (cell + 20), rows * (cell + 40)), (60, 60, 60))
        d = ImageDraw.Draw(sheet)
        for i, ((name, box), crop) in enumerate(zip(items, crops)):
            k = min(4, cell / max(crop.size))
            crop = crop.resize((max(1, int(crop.width * k)), max(1, int(crop.height * k))), Image.LANCZOS)
            x, y = (i % cols) * (cell + 20), (i // cols) * (cell + 40)
            d.rectangle((x, y, x + cell + 19, y + cell + 39), fill=(150, 156, 170), outline=(60, 60, 60))
            sheet.paste(crop, (x + 10, y + 30), crop.split()[-1])
            d.text((x + 10, y + 8), name + '  ' + ' '.join(f'{v:g}' for v in box), fill=(255, 255, 255))
    sheet.save(path, quality=92)
    print(f'data/checks/{path.name}', sheet.size, len(items))


def main(argv):
    CHECKS.mkdir(parents=True, exist_ok=True)
    if '--zoom' in argv:
        zoom(argv)
        return
    keys = [a for a in argv if not a.startswith('-')] or sorted(p.name for p in CANDIDATES.iterdir() if p.is_dir())
    cells = []
    for key in keys:
        for p in sorted((CANDIDATES / key).glob('*.png')):
            cells.append((f'{key}/{p.stem}', on_gray(Image.open(p), (420, 520))))
    if not cells:
        raise SystemExit('No candidate images')
    cols = min(6, len(cells))
    rows = (len(cells) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * 430, rows * 560), (40, 44, 60))
    d = ImageDraw.Draw(sheet)
    for i, (label, im) in enumerate(cells):
        x, y = (i % cols) * 430 + 5, (i // cols) * 560 + 5
        sheet.paste(im, (x + (420 - im.width) // 2, y + 30))
        d.text((x + 6, y + 6), label, fill=(255, 255, 255))
    sheet.save(CHECKS / 'candidates.jpg', quality=90)
    print('data/checks/candidates.jpg', sheet.size, len(cells))


if __name__ == '__main__':
    main(sys.argv[1:])
