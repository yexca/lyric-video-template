"""Original lyrics → per-mora timeline → lyrics.js (in the agreed timing-data format)

    python lyric-tool/lyrics.py --init           # 1. the original lyrics in ref/lyrics/ (LRC or plain text) → a draft lyrics/kana.txt; then fill in the kanji readings
                                                 #    (with no lyrics file in ref/, the lyrics embedded in the audio tags are used → lyrics/source.lrc)
    python lyric-tool/lyrics.py                  # 2. read lyrics/timing.txt, generate lyrics/lyrics.js and copy it into the current version's js/
                                                 #    (with no timeline file yet, one is first estimated from the vocals)
    python lyric-tool/lyrics.py --to v1_2 v2_1   # copy into the named versions (default: `current` in project.json; nothing is copied while no version exists yet)
    python lyric-tool/lyrics.py --estimate       # re-estimate every estimated line (confirmed ones are left alone) and write the timeline file back
    python lyric-tool/lyrics.py --estimate 7 18  # re-estimate lines 7 and 18 only (whatever their status)
    python lyric-tool/lyrics.py --prepare        # only generate the vocal data the timing tool uses (data/derived/vocal_onset.js, data/audio/vocals.m4a)
    python lyric-tool/lyrics.py --sync-kana      # rewrite lyrics/kana.txt from the timeline (the timing tool does this on save; run it after editing lines / readings in timing.txt by hand)

To change a line's text or readings, or to merge / split / add / delete lines, use the timing tool (lyric-tool/); saving updates both files together.
When the number of lines changes, the lines are renumbered — everything in the storyboard that refers to a line by number (LT(line) etc.) has to be updated to match.

Files
- ref/lyrics/*.lrc|*.txt   the original lyrics (put there by the user, read-only); if absent, lyrics/source.lrc (the lyrics embedded in the audio tags)
                           credit lines (词：/ 曲：/ title - artist) and the Chinese translation appended to each line are stripped automatically
- lyrics/timing.txt        the per-mora timeline (lines, readings and times are all in it; the timing tool lyric-tool/ reads and writes it, and it can be edited by hand too). The only editable source
- lyrics/kana.txt          lyrics + readings in a compact notation (one line per row). At the first estimate it decides how each line is split into morae;
                           once a timeline exists it is only a summary of the timeline, rewritten by --sync-kana. Re-estimating (--estimate) reads it
- lyrics/lyrics.js         data for the video, loaded with <script> (no file is read at run time). Generated — do not edit by hand
- <version>/js/lyrics.js   a snapshot of the one above: a new version takes it along, and old versions don't follow later changes

Timeline format (one mora per row)
    ## 07  (estimated)  the whole line / second phrase
    00:30.00  花    は        time  displayed character (only on that character's first mora)  reading
    00:30.25        な        later morae of the same character: the character column is left empty
    00:30.50? 咲    さ        "?" after the time = uncertain (the tool highlights it)
    00:32.00  /空   そ        "/" = a new phrase
    ~         ...            "~" = tied to the previous mora (no onset of its own); the time is interpolated
    00:34.00  .              line end: when singing of the last note ends
  Status (estimated) = estimated automatically, not yet confirmed by a person; (confirmed) = confirmed by ear. One blank line between lines.

Automatic estimation (only for lines that haven't been timed by ear yet)
- Where each line starts: with no timeline yet, the time in the original lyrics (LRC); once a timeline exists, the line's current start in it
  (lines may have been merged, split, added or deleted, and no longer match the rows of the original). To start over from the original: delete timing.txt and run again.
- The overall offset between the LRC and the audio, in seconds, goes in lrc_offset in project.json (positive when the LRC is early): everything is shifted by it first, then snapped to where the vocals start
  (data/audio/vocals.wav, separated by tools/separate.py; the full mix if there is none). Plain-text lyrics have no times; the lines are spread over the voiced range by mora count.
- Phrase boundaries: the point of lowest vocal energy near the position estimated from the proportion of characters.
- Each mora within a phrase: points are picked on the 16th-note grid (DP: vocal onset strength + a penalty for straying from an even spread), then snapped to a nearby onset peak.
"""

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
from scipy import ndimage, signal
from scipy.io import wavfile

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / 'tools'))
from paths import AUDIO, DERIVED, KANA, LYRICS, LYRICS_JS, ROOT, SOURCE, TIMING, config, ref_audio, ref_lyrics, version_dir  # noqa: E402

OUT = LYRICS_JS
ANALYSIS = DERIVED / 'analysis.js'
OFF = float(config().get('lrc_offset', 0))       # how many seconds the LRC is ahead of the audio (overall shift)
FPS = 100

SMALL = set('ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ')
MERGE = SMALL | set('っッー')
OPEN = set('「『（(')
CLOSE = set('」』）)？！、。?!')
ST_EST, ST_OK = 'estimated', 'confirmed'
UNITS = 'whole' if config().get('reading_units') == 'whole' else 'kana'
KANA_CH = re.compile(r'^[ぁ-ゖァ-ヺー]+$')

# ---------------------------------------------------------------- readings → morae


def units_of(read):
    """A reading → its units (one unit = one mora = one tap). A space always splits a reading; each piece is then
    reading_units "kana" (Japanese, the default): split again per kana if it is all kana (small kana, っ and ー merge back in morae_of); any other piece (pinyin, a Latin syllable) is one unit
    reading_units "whole": one unit as it is — a character's reading is not split unless a space is typed into it
    (unitsOf in the timing tool implements the same rules; change the two together.)"""
    return [u for p in read.split() for u in (list(p) if UNITS == 'kana' and KANA_CH.match(p) else [p])]


def join_units(a, b):
    """Inverse of units_of: append unit b to reading a (kana run straight on when they split per kana anyway; anything else is kept apart by a space)"""
    if not a:
        return b
    return a + b if UNITS == 'kana' and KANA_CH.match(a.split(' ')[-1]) and KANA_CH.match(b) else a + ' ' + b


def parse_kana_line(s):
    """One annotated line → tokens: (display, reading) / ('「', '') for punctuation / None for a phrase boundary"""
    toks, i = [], 0
    while i < len(s):
        m = re.match(r'\[([^\]]+)\]\{([^}]+)\}', s[i:]) or re.match(r'(.)\{([^}]+)\}', s[i:])
        if m:
            toks.append((m[1], m[2]))
            i += m.end()
            continue
        ch = s[i]
        i += 1
        if ch in ' 　':
            toks.append(None)
        elif ch in OPEN or ch in CLOSE:
            toks.append((ch, ''))
        else:
            toks.append((ch, ch))
    return toks


def morae_of(s):
    """One line → [phrase[mora{disp, kana}]]. Small kana, sokuon and the long-vowel mark merge into the previous mora; punctuation attaches to the neighbouring character."""
    phrases, pending = [[]], ''
    for t in parse_kana_line(s):
        if t is None:
            phrases.append([])
            continue
        disp, read = t
        if not read:
            if disp in OPEN or not phrases[-1]:
                pending += disp
            else:
                phrases[-1][-1]['disp'] += disp
            continue
        for j, k in enumerate(units_of(read)):
            phrases[-1].append({'disp': (pending + disp) if j == 0 else '', 'kana': k})
            if j == 0:
                pending = ''
    out = []
    for ph in phrases:
        mor = []
        for a in ph:
            if a['kana'] in MERGE and mor:
                mor[-1]['kana'] += a['kana']
                mor[-1]['disp'] += a['disp']
            else:
                mor.append(dict(a))
        if mor:
            out.append(mor)
    return out


def read_kana():
    lines = []
    for raw in KANA.read_text('utf-8').splitlines():
        m = re.match(r'^(\d+)\s+(.*\S)\s*$', raw)
        if m and not raw.startswith('#'):
            lines.append(morae_of(m[2]))
    return lines


def phrase_text(ph):
    return ''.join(m['disp'] for m in ph)


def tokens_of(rows):
    """Inverse of morae_of: the morae of one line in the timeline → a list of tokens: [display, reading] / (punctuation, '') / None for a phrase boundary.
    (tokensOf in the timing tool implements the same rules; change the two together.)"""
    toks = []
    for i, r in enumerate(rows):
        if r['new'] and i:
            toks.append(None)
        d, k, head, tail, merged = r['disp'], r['kana'], '', '', []
        while d and d[0] in OPEN:
            head, d = head + d[0], d[1:]
        while d and d[-1] in CLOSE:
            tail, d = d[-1] + tail, d[:-1]
        while KANA_CH.match(k) and len(k) > 1 and d and d[-1] in MERGE and d[-1] == k[-1]:      # small kana / sokuon / long-vowel mark merged into this mora: each is a character of its own
            merged.insert(0, d[-1])
            d, k = d[:-1], k[:-1]
        toks += [(c, '') for c in head]
        if d:
            toks.append([d, k])
        else:                                                              # a later mora of the same character: its reading is appended to that character's
            last = next((t for t in reversed(toks) if isinstance(t, list)), None)
            if last is None:
                raise SystemExit(f"The first mora of a line in the timeline has no displayed character (reading {r['kana']})")
            last[1] = join_units(last[1], k)
        toks += [[c, c] for c in merged] + [(c, '') for c in tail]
    return toks


def kana_notation(rows):
    """The morae of one line → kana.txt notation (漢{かん} / [今日]{きょう} / a space between phrases)"""
    out = ''
    for t in tokens_of(rows):
        if t is None:
            out += ' '
        elif not t[1] or (t[0] == t[1] and (len(t[0]) == 1 or KANA_CH.match(t[0]))):      # a word read as itself still needs [word]{word}, or it would split per letter
            out += t[0]
        else:
            out += f'{t[0]}{{{t[1]}}}' if len(t[0]) == 1 else f'[{t[0]}]{{{t[1]}}}'
    return out


def sync_kana(lines):
    """Rewrite kana.txt from the timeline (the timeline is the only editable source: once lines or readings change in the timing tool, this file follows)"""
    new = [kana_notation(L['rows']) for L in lines]
    for no, (s, L) in enumerate(zip(new, lines)):                          # before writing, make sure it splits back into exactly the same morae
        back = [(m['disp'], m['kana'], j == 0) for ph in morae_of(s) for j, m in enumerate(ph)]
        want = [(r['disp'], r['kana'], bool(r['new']) or i == 0) for i, r in enumerate(L['rows'])]
        if back != want:
            raise SystemExit(f'Line {no} cannot be written in kana.txt notation (it does not split back into what the timeline has): {s}')
    old = [m[2] for raw in (KANA.read_text('utf-8').splitlines() if KANA.exists() else [])
           if not raw.startswith('#') and (m := re.match(r'^(\d+)\s+(.*\S)\s*$', raw))]
    if old == new:
        return
    KANA.write_text(KANA_HEADER + ''.join(f'{i:02d} {s}\n' for i, s in enumerate(new)), 'utf-8', newline='\n')
    diff = sum(a != b for a, b in zip(old, new)) + abs(len(old) - len(new))
    print(f'kana.txt updated from the timeline ({len(old)} → {len(new)} lines, {diff} changed)')

# ---------------------------------------------------------------- time format


def fmt(t):
    t = round(t + 1e-9, 2)
    m = int(t // 60)
    return f'{m:02d}:{t - 60 * m:05.2f}'


def parse_time(s):
    m = re.match(r'^(\d+):(\d+(?:\.\d+)?)$', s)
    if not m:
        raise ValueError(f'bad time format: {s!r} (expected mm:ss.cc)')
    return int(m[1]) * 60 + float(m[2])


def dwidth(s):
    return sum(2 if ord(c) > 0x2E7F else 1 for c in s)


def pad(s, w):
    return s + ' ' * max(1, w - dwidth(s))

# ---------------------------------------------------------------- timeline file

HEADER = """# Per-mora lyric timeline
# One mora per row: time  displayed character  reading
#   time is mm:ss.cc; "?" after the time = uncertain; "~" = tied to the previous mora (no onset of its own; the time is interpolated)
#   the displayed character is written only on its first mora and left empty on its later morae; a leading "/" = a new phrase
#   every line ends with a "." row (when singing of the last note ends); one blank line between lines
#   ## rows: line number, status (estimated = estimated automatically / confirmed = confirmed by ear), the whole line (for reading only)
# Editor: run python tools/serve.py, then open http://127.0.0.1:8600/lyric-tool/
# After editing, run python lyric-tool/lyrics.py to generate lyrics/lyrics.js and copy it into the current version (the timing tool does this by itself on save)
"""


def write_timing(lines, path=TIMING):
    out = [HEADER]
    for no, L in enumerate(lines):
        title = ' / '.join(phrase_text([r for r in ph]) for ph in split_phrases(L['rows']))
        out.append(f"## {no:02d}  ({L['status']})  {title}")
        for r in L['rows']:
            tm = '~' if r['tied'] else fmt(r['t'])
            if r.get('unc'):
                tm += '?'
            disp = ('/' if r['new'] and r is not L['rows'][0] else '') + r['disp']
            out.append(f"{tm:<10}{pad(disp, 6)}{r['kana']}")
        out.append(f"{fmt(L['end']):<10}.")
        out.append('')
    path.write_text('\n'.join(out), 'utf-8', newline='\n')     # always LF: byte-for-byte what the timing tool saves


def split_phrases(rows):
    phs, cur = [], []
    for r in rows:
        if r['new'] and cur:
            phs.append(cur)
            cur = []
        cur.append(r)
    if cur:
        phs.append(cur)
    return phs


def read_timing(path=TIMING):
    lines, cur = [], None
    for n, raw in enumerate(path.read_text('utf-8').splitlines(), 1):
        s = raw.strip()
        if not s or (s.startswith('#') and not s.startswith('##')):
            continue
        if s.startswith('##'):
            m = re.match(r'##\s*(\d+)\s*(?:[(（]([^)）]*)[)）])?\s*(.*)$', s)
            cur = {'no': int(m[1]), 'status': (m[2] or ST_EST).strip(), 'rows': [], 'end': None}
            lines.append(cur)
            continue
        p = s.split()
        try:
            if len(p) == 2 and p[1] == '.':
                cur['end'] = parse_time(p[0].rstrip('?'))
                continue
            disp, kana = (p[1], p[2]) if len(p) >= 3 else ('', p[1])
            tm = p[0]
            tied = tm.startswith('~')
            unc = tm.endswith('?')
            new = disp.startswith('/')
            cur['rows'].append({'t': None if tied else parse_time(tm.rstrip('?')), 'tied': tied, 'unc': unc,
                                'disp': disp[1:] if new else disp, 'kana': kana, 'new': new or not cur['rows']})
        except Exception as e:
            raise SystemExit(f'{path.name} line {n}: {e}\n  {raw}')
    for L in lines:
        if L['end'] is None:
            raise SystemExit(f"Line {L['no']} is missing its line-end '.' row")
    return lines

# ---------------------------------------------------------------- vocal features


def vocal_features():
    """(db, flux): vocal energy (dB) and onset strength (spectral flux, roughly 0..1) at 100 fps"""
    cache = AUDIO / 'vocal_feat.npz'
    if cache.exists():
        d = np.load(cache)
        return d['db'], d['flux']
    sr, x = wavfile.read(vocal_wav())
    x = x.astype(np.float32)
    x = (x.mean(1) if x.ndim > 1 else x) / 32768
    hop, nper = sr // FPS, 1024
    f, _, Z = signal.stft(x, sr, nperseg=nper, noverlap=nper - hop, boundary=None, padded=False)
    S = np.log1p(200 * np.abs(Z[(f > 150) & (f < 6000)]))
    flux = np.concatenate([[0], np.maximum(0, np.diff(S, axis=1)).sum(0)])
    n = len(x) // hop
    flux = np.interp(np.arange(n) / FPS, (np.arange(len(flux)) * hop + nper / 2) / sr, flux)   # align frame centres to the 100 fps grid
    flux = ndimage.uniform_filter1d(flux, 3)
    flux /= np.percentile(flux, 99.5) + 1e-9
    db = 20 * np.log10(np.sqrt(ndimage.uniform_filter1d(x ** 2, hop)[::hop][:n]) + 1e-6)
    np.savez(cache, db=db, flux=flux)
    return db, flux


def vocal_wav():
    """The separated vocals; without separation (tools/separate.py) falls back to the full mix — drum hits then get mixed into the onsets, so the estimate is rougher and is fixed up in the timing tool."""
    for name in ('vocals.wav', 'audio.wav'):
        if (AUDIO / name).exists():
            if name == 'audio.wav':
                print('Note: no data/audio/vocals.wav, using the full mix in place of the vocals (for a better estimate run tools/separate.py first)')
            return AUDIO / name
    raise SystemExit('No data/audio/audio.wav: put the audio in ref/audio/, then run python tools/audio.py')


def beat_grid():
    if not ANALYSIS.exists():
        raise SystemExit('No data/derived/analysis.js: run python tools/audio.py first')
    s = ANALYSIS.read_text('utf-8')
    bpm = float(re.search(r'"bpm":([\d.]+)', s)[1])
    phase = float(re.search(r'"phase":([\d.]+)', s)[1])
    return bpm, phase

# ---------------------------------------------------------------- automatic estimation


def estimate(only=None, keep=None):
    """Estimate the time of every mora of every line from the LRC + the vocals. only: estimate just these line numbers; keep: the existing lines (those not in only are kept as they are)"""
    db, flux = vocal_features()
    bpm, phase = beat_grid()
    G = 60 / bpm / 4                                 # 16th note
    thr = np.percentile(db, 90) - 22
    voiced = ndimage.binary_opening(ndimage.binary_closing(db > thr, np.ones(8)), np.ones(6))
    sm = ndimage.uniform_filter1d(db, 9)
    dv = np.diff(voiced.astype(int))
    onsets = (np.where(dv == 1)[0] + 1) / FPS
    fr = lambda t: int(np.clip(round(t * FPS), 0, len(db) - 1))

    def last_voiced(a, b):
        k = np.where(voiced[fr(a):fr(b)])[0]
        return None if not len(k) else a + (k[-1] + 1) / FPS

    def peak(t, w):
        a, b = fr(t - w), fr(t + w) + 1
        i = a + int(np.argmax(flux[a:b]))
        return flux[i], i / FPS

    kana = read_kana()
    off = OFF
    if keep is not None:
        # a timeline already exists: each line's start is taken from it (lines may have been merged, split, added or deleted in the timing tool and no longer match the rows of the original lyrics)
        if len(kana) != len(keep):
            raise SystemExit(f'kana.txt has {len(kana)} lines, timing.txt has {len(keep)}. To go by the timeline: python lyric-tool/lyrics.py --sync-kana; '
                             'to re-estimate from the original lyrics: delete lyrics/timing.txt and run again')
        starts = [next(r['t'] for r in L['rows'] if r['t'] is not None) for L in keep]
        lrc, timed, off = [(t, None) for t in starts], True, 0.0
        tail = max(starts[-1] + 8, keep[-1]['end'] + .5)
    else:
        lrc, timed = read_source()
        tail = None
    if not timed:                                    # plain-text lyrics have no times: spread the lines over the voiced range by mora count for now; where each line really sits is settled in the timing tool
        sung = np.where(voiced)[0]
        a, b = (sung[0] / FPS, sung[-1] / FPS) if len(sung) else (0, len(db) / FPS)
        wt = np.array([sum(len(ph) for ph in L) + 4 for L in kana], float)
        st0 = a + (b - a) * np.concatenate([[0], np.cumsum(wt)]) / wt.sum()
        lrc, off = [(float(t), s) for t, (_, s) in zip(st0, lrc)], 0.0
    lrc = lrc + [(tail if tail is not None else lrc[-1][0] + 8, '')]
    if len(kana) != len(lrc) - 1:
        raise SystemExit(f'kana.txt has {len(kana)} lines, the original lyrics have {len(lrc) - 1}: for the first estimate both must have the same number of lines'
                         ' (do not add or delete lines in kana.txt yet; merge, split, add and delete in the timing tool once the estimate is done)')
    # average singing rate over the whole song (seconds / mora): most lines follow one another directly, so the median of "gap to the next line ÷ mora count" is good enough
    rate = float(np.median([(b[0] - a[0]) / max(1, sum(len(ph) for ph in L)) for a, b, L in zip(lrc, lrc[1:], kana)]))

    lines = []
    for i, ((t_lrc, text), (t_nxt, _)) in enumerate(zip(lrc, lrc[1:])):
        phs = kana[i]
        src = ' '.join(phrase_text(p) for p in phs)
        if text is not None and src != text:
            print(f'Note: line {i} differs from the original lyrics (kana.txt is used):\n  kana.txt  {src}\n  original  {text}')
        if keep is not None and (only is None or i not in only):
            lines.append(next(L for L in keep if L['no'] == i))
            continue
        nxt, t0 = t_nxt + off, t_lrc + off
        near = [o for o in onsets if t0 - .45 < o < t0 + .35]
        if near:
            t0 = near[0]
        end = last_voiced(t0, nxt - .1)
        end = min(nxt - .05, max(t0 + 1.2, (end or nxt - .4) + .25))
        if nxt - t0 > 20:                            # a long interlude follows: end at the first gap of ≥0.4 s after the 3 s mark
            run = 0
            for k in range(fr(t0 + 3), fr(nxt)):
                run = run + 1 if not voiced[k] else 0
                if run >= 40:
                    end = (k - run + 1) / FPS + .25
                    break
        # When a line is followed by an interlude that has backing vocals / humming in it, "the last voiced position" lands at the end of the interlude and the whole line is stretched far too long.
        # Cap it by the song's average singing rate: beyond 1.4× that length, end at the first gap of ≥0.3 s after 0.7×, or at 1.4× if there is none.
        typical = sum(len(ph) for ph in phs) * rate
        if end - t0 > typical * 1.4 + .3:
            cap, run = t0 + typical * 1.4, 0
            for k in range(fr(t0 + typical * .7), fr(cap)):
                run = run + 1 if not voiced[k] else 0
                if run >= 30:
                    cap = (k - run + 1) / FPS + .25
                    break
            end = max(t0 + 1.2, min(end, cap))
        # phrase starts: estimate by proportion, then look nearby for the onset after an energy dip
        w = np.array([sum(1.6 if re.match(r'[一-鿿]', ch) else .3 if ch in '「」？！、。' else 1 for ch in phrase_text(p)) for p in phs])   # character weights: kanji 1.6, punctuation .3, anything else 1
        acc = np.concatenate([[0], np.cumsum(w)]) / w.sum()
        st = [t0]
        for k in range(1, len(phs)):
            guess = t0 + (end - .25 - t0) * acc[k]
            a, b = fr(max(st[-1] + .4, guess - .7)), fr(min(end - .4, guess + .7))
            if b <= a:
                st.append(guess)
                continue
            j = a + int(np.argmin(sm[a:b]))
            k2 = j
            while k2 < b + 30 and sm[k2] < sm[j] + 6:
                k2 += 1
            st.append(k2 / FPS - .04)
        rows = []
        for k, ph in enumerate(phs):
            ps = st[k]
            pe = st[k + 1] - .02 if k + 1 < len(phs) else end
            lv = last_voiced(ps, pe)
            pe_sung = min(pe, (lv or pe) + .05)
            ts, stg = place(ps, pe_sung, len(ph), G, phase, flux, peak)
            for j, (m, t, v) in enumerate(zip(ph, ts, stg)):
                # a weak-onset ん or a lengthening う (こう・ちゅう・もう…) usually has no onset of its own: mark it "~" (tied) and interpolate its time
                prev = ph[j - 1]['kana'][-1] if j else ''
                tie = j > 0 and v < .45 and (m['kana'] == 'ん' or (m['kana'] == 'う' and prev in VOWEL_OU))
                rows.append({'t': None if tie else round(t, 2), 'tied': tie, 'unc': False, 'disp': m['disp'], 'kana': m['kana'], 'new': j == 0})
        lines.append({'no': i, 'status': ST_EST, 'rows': rows, 'end': round(end, 2)})
    for a, b in zip(lines, lines[1:]):                # a line end must not run into the next line, nor come before the line's last mora
        a['end'] = min(a['end'], round(b['rows'][0]['t'] - .05, 2))
    for L in lines:
        last = max(r['t'] for r in L['rows'] if r['t'] is not None)
        L['end'] = max(L['end'], round(last + .15, 2))
    return lines


def place(ps, pe, n, G, phase, flux, peak):
    """Start times of the n morae in the phrase [ps, pe) (first mora = ps), and each mora's onset strength.
    Points are picked by DP on the 16th-note grid (onset strength + a penalty for straying from the expected position; the last mora is usually held longer), then snapped to an onset peak within ±25 ms."""
    if n == 1:
        return [ps], [1.0]
    k0, k1 = int(np.ceil((ps + G * .6 - phase) / G)), int(np.floor((pe - .06 - phase) / G))
    cand = [phase + k * G for k in range(k0, k1 + 1)]
    if len(cand) < n - 1:
        ts = list(np.linspace(ps, max(ps + .05 * n, pe - .05), n, endpoint=False))
        return ts, [0.0] * n
    ref = np.percentile(flux[int(ps * FPS):int(pe * FPS) + 1], 90) + 1e-9
    sc = np.array([min(1.0, peak(c, .03)[0] / ref) for c in cand])
    span = max(pe - ps, .3)
    exp = [ps + (pe - ps) * k / (n + 1.2) for k in range(1, n)]     # the last mora is assumed to last 2.2 morae
    K, J, lam = n - 1, len(cand), 24.0
    dp = np.full((K, J), -1e9)
    bk = np.zeros((K, J), int)
    for j in range(J):
        dp[0, j] = sc[j] - lam * ((cand[j] - exp[0]) / span) ** 2
    for k in range(1, K):
        best, bi = -1e9, -1
        for j in range(1, J):
            if dp[k - 1, j - 1] > best:
                best, bi = dp[k - 1, j - 1], j - 1
            if best > -1e8:
                dp[k, j] = best + sc[j] - lam * ((cand[j] - exp[k]) / span) ** 2
                bk[k, j] = bi
    j = int(np.argmax(dp[K - 1]))
    path = [j]
    for k in range(K - 1, 0, -1):
        j = bk[k, j]
        path.append(j)
    path.reverse()
    out, strength = [ps], [1.0]
    for idx, j in enumerate(path):
        v, t = peak(cand[j], .025)
        lo = out[-1] + .06
        hi = cand[path[idx + 1]] - .06 if idx + 1 < len(path) else pe
        out.append(t if (v > .6 * ref and lo <= t <= hi) else max(cand[j], lo))
        strength.append(float(sc[j]))
    return out, strength


VOWEL_OU = set('おこそとのほもよろごぞどぼぽょうくすつぬふむゆるぐずづぶぷゅ')


def flux_max(flux, a, b):
    return float(flux[int(a * FPS):int(b * FPS) + 1].max(initial=1e-9))

# ---------------------------------------------------------------- generate js/lyrics.js


def resolve(rows, end):
    """Tied ("~") morae: interpolate between the timed morae before and after"""
    ts = [r['t'] for r in rows]
    known = [i for i, t in enumerate(ts) if t is not None]
    if not known:
        raise SystemExit('A line needs at least one mora with a time')
    for i, t in enumerate(ts):
        if t is not None:
            continue
        a = max([k for k in known if k < i], default=None)
        b = min([k for k in known if k > i], default=None)
        ta, tb = (ts[a] if a is not None else None), (ts[b] if b is not None else end)
        ia, ib = (a if a is not None else -1), (b if b is not None else len(ts))
        if ta is None:
            ta, ia = tb - .1 * (ib - i), i - 1
        ts[i] = ta + (tb - ta) * (i - ia) / (ib - ia)
    return ts


def build(lines, voiced_end):
    out, warn = [], []
    for L in lines:
        ts = resolve(L['rows'], L['end'])
        for a, b in zip(ts, ts[1:]):
            if b < a - 1e-6:
                warn.append(f"line {L['no']}: time goes backwards, {fmt(a)} → {fmt(b)}")
        if L['end'] < ts[-1]:
            warn.append(f"line {L['no']}: line end {fmt(L['end'])} is before the last mora {fmt(ts[-1])}")
        phs, cur = [], []
        for r, t in zip(L['rows'], ts):
            if r['new'] and cur:
                phs.append(cur)
                cur = []
            cur.append((r, t))
        phs.append(cur)
        parts = []
        for pi, ph in enumerate(phs):
            text = ''.join(r['disp'] for r, _ in ph)
            t0 = ph[0][1]
            if pi + 1 < len(phs):
                nxt = phs[pi + 1][0][1]
                t1 = min(nxt - .02, max(ph[-1][1] + .12, voiced_end(ph[-1][1], nxt - .02)))
            else:
                t1 = L['end']
            ct = []
            for r, t in ph:
                ct += [round(t, 3)] * len(r['disp'])
            mt = [t for _, t in ph] + [t1]
            n = len(ph)
            keys = []
            for q in np.linspace(0, 1, 9):
                f = q * n
                i = min(n - 1, int(f))
                keys.append(round(mt[i] + (mt[i + 1] - mt[i]) * (f - i), 3))
            parts.append([text, round(t0, 3), round(t1, 3), keys, ct])
        out.append([parts[0][1], parts[-1][2], parts])
    return out, warn


def main(argv):
    if '--init' in argv:
        return init_kana()
    if not KANA.exists() and not ('--sync-kana' in argv and TIMING.exists()):
        raise SystemExit('No lyrics/kana.txt: run python lyric-tool/lyrics.py --init first, then fill in the kanji readings')
    if '--prepare' in argv or not (DERIVED / 'vocal_onset.js').exists():
        prepare()
        if '--prepare' in argv:
            return
    to = argv[argv.index('--to') + 1:] if '--to' in argv else [None]
    argv = argv[:argv.index('--to')] if '--to' in argv else argv
    nums = [int(a) for a in argv if a.isdigit()]
    if '--estimate' in argv or not TIMING.exists():
        keep = read_timing() if TIMING.exists() else None
        only = set(nums) if nums else ({L['no'] for L in keep if L['status'] != ST_OK} if keep else None)
        lines = estimate(only, keep)
        write_timing(lines)
        print(f'Estimated {len(only) if only is not None else len(lines)} line(s) → lyrics/timing.txt')
    lines = read_timing()
    if '--sync-kana' in argv:
        sync_kana(lines)
    kana = read_kana()
    bad = [no for no, L in enumerate(lines)
           if no >= len(kana) or [m['kana'] for ph in kana[no] for m in ph] != [r['kana'] for r in L['rows']]]
    if bad or len(kana) != len(lines):                # the timeline is what the output is generated from; this only warns that the two files no longer agree
        print(f"Note: kana.txt ({len(kana)} lines) and the timeline ({len(lines)} lines) disagree{' (line(s) ' + ', '.join(map(str, bad[:8])) + (' …' if len(bad) > 8 else '') + ')' if bad else ''}. "
              'To go by the timeline: --sync-kana; to re-estimate a line with the readings in kana.txt: --estimate <line>')
    db, _ = vocal_features()
    thr = np.percentile(db, 90) - 22
    voiced = ndimage.binary_opening(ndimage.binary_closing(db > thr, np.ones(8)), np.ones(6))

    def voiced_end(a, b):
        k = np.where(voiced[int(a * FPS):int(b * FPS)])[0]
        return a + .12 if not len(k) else a + (k[-1] + 1) / FPS + .06

    data, warn = build(lines, voiced_end)
    body = ',\n'.join('  ' + json.dumps(l, ensure_ascii=False) for l in data)
    ok = sum(L['status'] == ST_OK for L in lines)
    OUT.write_text('// Generated by lyric-tool/lyrics.py from lyrics/timing.txt; do not edit by hand.\n'
                   f'// {ok} / {len(lines)} lines confirmed. Each row: [start, end, [[phrase, singing starts, singing ends, fill keyframes (9), time each character appears], ...]]\n'
                   f'window.LYRICS = [\n{body}\n];\n', 'utf-8', newline='\n')
    for w in warn:
        print('Note: ' + w)
    print(f'{len(data)} lines ({ok} confirmed) → lyrics/lyrics.js')
    for name in to:                                   # a version holds a snapshot: old versions don't follow later changes
        if name is None and (config().get('current') or 'template') == 'template':
            print('  No version yet (current is template; the template stays empty): python tools/new_version.py will carry these lyrics into the first version')
            continue
        dst = version_dir(name) / 'js' / 'lyrics.js'
        shutil.copyfile(OUT, dst)
        print(f'  copied to {dst.relative_to(ROOT).as_posix()}')


def prepare():
    """For the timing tool: the vocal onset curve (data/derived/vocal_onset.js) and the mono vocal audio (data/audio/vocals.m4a)"""
    db, flux = vocal_features()
    bpm, phase = beat_grid()
    v = np.clip((db + 60) / 60, 0, 1)
    js = {'fps': FPS, 'bpm': bpm, 'phase': phase,
          'flux': [int(x) for x in np.clip(flux * 200, 0, 255)], 'level': [int(x) for x in v * 255]}
    DERIVED.mkdir(parents=True, exist_ok=True)
    (DERIVED / 'vocal_onset.js').write_text('window.VOX = ' + json.dumps(js, separators=(',', ':')) + ';\n', 'utf-8')
    m4a = AUDIO / 'vocals.m4a'
    if not m4a.exists():
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(vocal_wav()), '-ac', '1', '-c:a', 'aac', '-b:a', '160k', str(m4a)], check=True)
    print('Timing tool data → data/derived/vocal_onset.js, data/audio/vocals.m4a')


CREDIT = re.compile(r'^(作?[词詞]|作?曲|[编編]曲|制作人?|[监監]制|混音|母[带帶]|和[声聲]|[录錄]音|出品|[发發]行|演唱|歌手|原唱|翻唱|吉他|[贝貝]斯|鼓|[键鍵][盘盤]|弦[乐樂]|[A-Za-z ]{1,12})\s*[:：]')
KANA_RE = re.compile(r'[\u3040-\u30ff]')
HAN_RE = re.compile(r'[\u3400-\u9fff]')


def clean_source(lines, tags):
    """Two things that downloaded lyrics often carry: credit lines ("词：", "曲：", "title - artist"), and a Chinese translation appended to each line (separated by a space, with no kana in it).
    The translation is stripped only when most lines have one (otherwise an all-kanji phrase such as "春夏 秋冬" would be cut by mistake)."""
    head = {f'{tags.get("ti", "")} - {tags.get("ar", "")}'}
    lines = [(t, s) for t, s in lines if s not in head and not CREDIT.match(s)]

    def cut(s):
        tok = s.split()
        last = max((i for i, w in enumerate(tok) if KANA_RE.search(w)), default=-1)
        tail = tok[last + 1:]
        return ' '.join(tok[:last + 1]) if last >= 0 and tail and all(HAN_RE.search(w) for w in tail) else None

    cuts = [cut(s) for _, s in lines]
    if sum(c is not None for c in cuts) > len(lines) / 2:
        lines = [(t, c if c is not None else s) for (t, s), c in zip(lines, cuts)]
    return lines


def read_source():
    """Original lyrics → ([(time, line)], whether there are times). LRC: the rows with a time tag; plain text: one line per row (blank rows and rows starting with # are skipped)."""
    lines, plain, tags = [], [], {}
    for raw in ref_lyrics().read_text('utf-8-sig').splitlines():
        m = re.match(r'\[(\d+):(\d+(?:\.\d+)?)\](.*)', raw)
        if m:
            lines.append((int(m[1]) * 60 + float(m[2]), m[3].strip()))
        elif (m := re.match(r'\[([a-z]+):(.*)\]\s*$', raw)):
            tags[m[1]] = m[2].strip()
        elif raw.strip() and not raw.lstrip().startswith(('#', '[')):
            plain.append(raw.strip())
    if lines:
        return clean_source([(t, s) for t, s in sorted(lines) if s], tags), True
    if not plain:
        raise SystemExit(f'No lyrics found in {ref_lyrics().name}')
    return clean_source([(0.0, s) for s in plain], tags), False


def embedded_lyrics():
    """When ref/ has no lyrics file: save the lyrics embedded in the audio tags (LYRICS / UNSYNCEDLYRICS) to lyrics/source.lrc as they are."""
    out = subprocess.run(['ffprobe', '-v', 'error', '-show_entries', 'format_tags:stream_tags', '-of', 'json', str(ref_audio())],
                         capture_output=True, check=True).stdout
    info = json.loads(out.decode('utf-8'))
    tags = {**info.get('format', {}).get('tags', {})}
    for st in info.get('streams', []):
        tags.update(st.get('tags', {}))
    text = next((v for k, v in tags.items() if k.lower() in ('lyrics', 'unsyncedlyrics', 'syncedlyrics') or k.lower().startswith('lyrics-')), '')
    if not text.strip():
        return False
    LYRICS.mkdir(exist_ok=True)
    SOURCE.write_text('\n'.join(text.splitlines()).strip() + '\n', 'utf-8', newline='\n')
    print(f'Lyrics embedded in {ref_audio().name} → lyrics/source.lrc')
    return True


KANA_HEADER = """# Lyric readings (lyric-tool/lyrics.py uses this at the first estimate to split each line into morae)
#   漢字{よみ}: the reading goes right after a single kanji; when two or more characters share one reading, write [身体]{からだ}
#   a space = a phrase boundary (as in the original lyrics)
#   splitting into morae (reading_units "kana", the default): one kana per mora; the small ゃゅょぁぃぅぇぉ, the sokuon っ and the long-vowel mark ー merge into the previous mora;
#     a reading that isn't kana (pinyin, a Latin syllable: 字{zi}) is one mora; a space inside {} splits a reading: [hello]{hel lo}
#   reading_units "whole" in project.json: every reading is one mora as it is (空{そら} is one mora too); only a space inside {} splits it
#   a character with no {} reads as itself
#   the number at the start of each row is the line number (the same order as the original lyrics; for cross-reference only)
# Once a timeline (timing.txt) exists, lines and readings are changed in the timing tool and this file is rewritten on save — do not edit it by hand any more.
"""


def init_kana():
    """Original lyrics → the draft of lyrics/kana.txt: one line per row, numbered, kanji readings not filled in yet (morae can only be split once they are)."""
    if KANA.exists():
        raise SystemExit('lyrics/kana.txt already exists (to start over, rename or delete it yourself first)')
    try:
        ref_lyrics()
    except SystemExit:
        if not embedded_lyrics():
            raise
    src, timed = read_source()
    LYRICS.mkdir(exist_ok=True)
    KANA.write_text(KANA_HEADER + ''.join(f'{i:02d} {s}\n' for i, (_, s) in enumerate(src)), 'utf-8', newline='\n')
    todo = sum(bool(re.search(r'[\u3400-\u9fff]', s)) for _, s in src)
    print(f'{len(src)} lines → lyrics/kana.txt ({"LRC with times" if timed else "plain text, no times"}); {todo} of them contain kanji and need readings')


if __name__ == '__main__':
    main(sys.argv[1:])
