# Usage

[简体中文](usage.zh-cn.md) · back to the [README](../README.md)

How to take a song from raw material to an exported video with this template. The conventions a coding assistant
follows while doing the work are in [AGENTS.md](../AGENTS.md).

- [Layout](#layout)
- [Requirements](#requirements)
- [Workflow](#workflow): [configure](#0-configure) · [material](#1-add-your-material) · [audio](#2-audio) · [lyrics](#3-lyrics) · [first version](#4-open-the-first-version) · [images](#5-images) · [check](#6-check) · [export](#7-export) · [manifest](#8-backup-manifest)
- [The image page](#the-image-page)
- [Tool pages and language](#tool-pages-and-language)
- [Command reference](#command-reference)
- [What the template leaves out](#what-the-template-leaves-out)

## Layout

```
ref/          your raw material: audio, original lyrics, reference images        not in git   tools only read it
data/         non-text files the tools produce: decoded audio, the image pool,
              candidates, frame grabs, finished videos                            not in git   back it up separately
lyric-tool/   lyric tool: plain lyrics → per-mora timeline → timing data
pic-tool/     image tool: numbered registry, overview per version / by order of
              appearance, candidate comparison and swapping, version diff
tools/        preview server, audio analysis, new version, frame grabs, overlap check, export
lyrics/       reading annotations and the timeline (text)
template/     the web-video template: new versions are copied from here
v1_1/ v1_2/ v2_1/ …   the versions (none yet)
docs/         these documents
project.json  project config     pics.json  image number registry     versions.html  version list page
AGENTS.md     working conventions for coding assistants
```

Version names are `v<line>_<iteration>`: a **line** is one overall approach, an **iteration** is one round of changes
within it. One more round on `v1_3` is `v1_4`; to try a different approach in parallel, open a new line, `v2_1`.
Old version folders are never modified again, so any two versions can be compared side by side at any time.

What is in git: all code and text, including "which images each version uses" (`<version>/images.json`) and the image
numbers (`pics.json`). The images and audio themselves are not; those two text files plus `data.manifest.txt`
(a file list with hashes) are what tie them together.

## Requirements

- Python 3.10+, `pip install numpy scipy` (with Pillow installed the image page uses thumbnails, which is much faster
  when there are many images; without it the originals are loaded directly)
- Node 22+ (no `npm install`, there are no dependencies)
- Chrome or Edge, and ffmpeg on the PATH
- Optional: demucs (vocal separation, makes the automatic lyric alignment more accurate), installed into `data/pydeps/`
  with its model downloaded to `data/models/` — see [tools/separate.py](../tools/separate.py)

## Workflow

### 0. Configure

Edit [project.json](../project.json):

| Key | Meaning |
|---|---|
| `title` `slug` | Title of the work (shown on the tool pages) and the short name used in file names (the video is `<slug>_<version>.mp4`) |
| `port` | Port of the preview server. Give each project its own when working on several at once |
| `current` | Current version. Tools default to it when no version is given; `new_version.py` updates it |
| `audio` `lyrics` | When `ref/audio/` or `ref/lyrics/` holds several files, which one to use (path relative to the root) |
| `lrc_offset` | How many seconds the LRC timestamps are ahead of the audio (positive = LRC is early) |
| `bpm_range` | Search range for the BPM. Detection easily lands on half or double tempo; narrow the range if you know the rough tempo |
| `bar_offset` | Which beat the bar's downbeat falls on (0–3); the timing tool uses it to draw bar lines |
| `reading_units` | How a reading is cut into taps. `kana` (default, Japanese): one tap per kana; a reading that isn't kana (pinyin, a Latin syllable) is one tap. `whole` (e.g. Chinese lyrics): every reading is one tap as it is. In both, a space inside a reading splits it into several taps (`hel lo`) |
| `export_dir` `tmp_dir` | Where finished videos and headless Chrome's temporary profiles go. Both default to inside the workspace (`data/export`, `data/tmp`): **no data leaves the workspace**, so normally leave them alone. If they really must live elsewhere, put that in `project.local.json` (machine-specific, not in git; same keys override) |

### 1. Add your material

Audio goes in `ref/audio/`, the original lyrics in `ref/lyrics/`, reference images in `ref/images/` (files directly
under `ref/` are picked up too). See [ref/README.md](../ref/README.md).
If there is no separate lyrics file but the audio tags carry lyrics, `--init` in step 3 extracts them into
`lyrics/source.lrc`; credit lines and a Chinese translation appended to each line are stripped automatically.

### 2. Audio

Decode it and analyse the beat:

```bash
python tools/audio.py
```

### 3. Lyrics

Generate the draft for the reading annotations and fill in the kanji readings (`漢字{よみ}`):

```bash
python lyric-tool/lyrics.py --init
```

Then generate the timeline (a first automatic estimate):

```bash
python lyric-tool/lyrics.py
```

Start the preview server and confirm the timing mora by mora along with the song in the timing tool
(<http://127.0.0.1:8600/lyric-tool/>):

```bash
python tools/serve.py
```

The lines themselves are edited in the timing tool too: "Edit text / readings" opens a furigana-style editor
(a reading under each character: kana, pinyin, any text; see `reading_units` above for how readings become taps), and
a line can be split in two, merged with the next one, added or deleted. On the waveform, dragging a mora's line moves
nothing else until it reaches another line; from then on it pushes that line along ahead of it.
Saving updates `timing.txt`, `kana.txt` and the `lyrics.js` the versions use, all together.
**When the number of lines changes, line numbers change**: everything in the storyboard that refers to a line by
number (`LT(n)`, `li: n`) has to follow — the tool lists which numbers changed when you save.

A "mora" here is the unit you tap: one kana (small kana, っ and ー join the mora before them), or one whole reading
with `reading_units: "whole"`. The file format and
all commands are described at the top of [lyric-tool/lyrics.py](../lyric-tool/lyrics.py). In the timeline
file a line's status is `estimated` or `confirmed`; the file always uses those two words, whatever language the tool
is shown in.

### 4. Open the first version

Copy the template to `v1_1`; every later round of changes opens another version:

```bash
python tools/new_version.py
```

The content is written in `v1_1/js/scenes.js` (the storyboard). How the engine works, and its three rules, are in
[template/README.md](../template/README.md). All versions can be watched at <http://127.0.0.1:8600/>.

### 5. Images

How the images are made is up to you: draw them, use your own material, have a coding assistant call a generation
service, or mix these. The template prescribes no service, style or way of choosing. If a service is used, the
assistant asks you which one, how to connect, and how many candidates you want, rather than assuming; the script is
written per project (the template has none, see the last section), and the bookkeeping it must do is in "Making
images" in [AGENTS.md](../AGENTS.md).

Candidates go in `data/candidates/<key>/` and are viewed at <http://127.0.0.1:8600/pic-tool/>. A chosen one is added
to the image pool and given a number:

```bash
python pic-tool/pic.py add data/candidates/hero/03.png --key hero --group scenes
```

Running `add` again for the same key creates a new revision of that image (`#12 r2`); the number stays the same and
older versions keep using the older revision. When talking about images say "#12", "#12 r2", "candidate hero/03" —
clicking a number badge on the image page copies exactly that wording. To use two revisions of one image in the same
version: `pic.py use <version> <key> <rev> --as <alias>`, and refer to the alias in the storyboard.
All commands are at the top of [pic-tool/pic.py](../pic-tool/pic.py).

### 6. Check

Both need the preview server running:

```bash
node tools/frames.cjs --sheet 0 10 20 30 40 50
```

```bash
node tools/overlap.cjs
```

The first grabs the picture at the given times and tiles them into one sheet (`data/checks/<version>/sheet.jpg`);
the second goes through the video frame by frame looking for lyrics covered by other text and for lyrics covering a face.

### 7. Export

```bash
node tools/export_video.cjs
```

Without options this is 1920×1080 at 30 fps with 3 parallel workers. For 4K (3840×2160) add `--scale=2`:

```bash
node tools/export_video.cjs --scale=2
```

Decide the resolution before you export — a coding assistant will ask you rather than assume 1080p. 4K takes about
3× as long per frame and the file is about 1.8× the size.

**4K and memory.** Each worker needs about 5 GB of free memory at 4K (about 2 GB at 1080p). If there isn't enough,
x264 stops with `malloc of size … failed` and the export aborts, which is why `--scale=2` uses 1 worker unless you
give a number yourself (`node tools/export_video.cjs 30 2 --scale=2` = 30 fps, 2 workers). Raise it only when free
memory covers workers × 5 GB.

Only one export can run at a time (the script blocks a second one).

### 8. Backup manifest

`data/` and `ref/` are not in git: record a manifest every so often and commit it; after moving machines or restoring
a backup, verify with `--check`:

```bash
python tools/data_manifest.py
```

## The image page

<http://127.0.0.1:8600/pic-tool/>

- **Version** at the top is a filter: pick a version to see only the images it uses, or "All versions" for the whole
  pool (every revision of every image / every candidate folder).
- **Images** lists a version's images by when they first appear in the song (grouped by section). Under each image are
  the times of every appearance; click one to open that version's video right there, stopped at that moment.
  The times are measured by the page itself (it runs the video page in an invisible iframe and draws every frame — a
  few seconds; the result is kept in `data/derived/usage/` and re-measured automatically after the storyboard changes).
- **Candidates** (`pic-tool/#cand`) shows a version one image per row: the revision the version uses (next to the one
  the previous version used, if it changed) + older revisions not in use + every candidate for that key, with the
  candidate each revision came from marked. Tick "Only new / changed" (`pic-tool/#pick`) to list just the images that
  are new or changed in this version — this is where to verify a round of picks.
- **"Candidates N"** at the top right of an image opens that image's own page (or open `pic-tool/#12` directly):
  all its revisions and everything in `data/candidates/<key>/` together, showing which one the current version uses
  and which candidate each revision came from — the place to decide whether to swap.
- **"Use this"** under any image that is not in use makes the selected version use it (a candidate is first added to
  the pool as a new revision — the same as `pic.py add` / `pic.py use`). The toast at the bottom lets you undo, or
  jump straight to the picture with the new image. If the new image's aspect ratio or head position differs from the
  old one, the measured values in `js/assets.js` have to be changed separately.
- **Compare versions** (`pic-tool/#diff`) puts two versions side by side, image by image.
- The tiles show thumbnails (kept in `data/thumbs/`, safe to delete at any time); the original loads when you open one.
  Changing view, reloading and going back all return to where you were.

## Tool pages and language

The three tool pages — the version list (`/`), lyric timing (`/lyric-tool/`) and images (`/pic-tool/`) — and the
player of the video page (its start screen, controls and start-up notes) are in English and Simplified Chinese. By
default they follow the browser (the first of its preferred languages that is available, English otherwise); the
drop-down at the top right of a tool page switches, and the choice is remembered in the browser — the video page
follows it. `?lang=en` / `?lang=zh-cn` in the address does the same.

English only: what the scripts print (including the messages the server passes on from `pic.py` / `lyrics.py`), the
comments and usage notes inside the scripts, and the headers of the files the scripts generate. What a video draws on
its canvas is the work's content and has nothing to do with the UI language.

For anyone changing the pages: they are written in English — the English text in a page is the source string and
also the lookup key — and Simplified Chinese is a dictionary, `lang.zh-cn.js`, next to the page
([tools/i18n.js](../tools/i18n.js) explains the mechanism). A UI string that is added or reworded needs its entry
there; a missing one shows up in English, with a warning in the console. Another language is one more
`lang.<code>.js` per page.

## Command reference

| Command | What it does |
|---|---|
| `python tools/serve.py [port]` | Preview server (one port for every version and tool page) |
| `python tools/audio.py [--force]` | `ref/audio/` → `data/audio/audio.wav` `audio.m4a`, then audio analysis |
| `python tools/analyze.py` | Redo the audio analysis only → `data/derived/analysis.js` |
| `python tools/separate.py` | Separate the vocals → `data/audio/vocals.wav` (optional) |
| `python lyric-tool/lyrics.py [--init / --estimate [line…] / --prepare / --to version…]` | Lyrics: draft, estimate, generate |
| `python pic-tool/pic.py add / use / drop / list / check` | Images: add to the pool, switch revision, verify |
| `python tools/new_version.py [--line] [--from version] [name]` | Open a new version |
| `node tools/frames.cjs [version] [--sheet] time…` | Frame grabs |
| `node tools/overlap.cjs [version] [from to] [--all] [--contrast]` | Lyric overlap / covered faces / contrast check |
| `node tools/export_video.cjs [version] [out.mp4] [fps] [workers] [--scale=2]` | Export the video |
| `python tools/data_manifest.py [--check]` | File manifest of `data/` and `ref/` |
| `python tools/cand_sheet.py [key…]`<br>`python tools/cand_sheet.py --zoom image [x0 y0 x1 y1] … [--box …] [--out name]` | Overview sheet of candidates; zoom into one or several regions (image = `key/NN` or `img/filename`, the regions are tiled into one picture) → `data/checks/` (needs Pillow) |

On Windows the `python` command may be the Microsoft Store placeholder (it exits without printing anything): use `py`
or the interpreter's full path instead.

## What the template leaves out

- **A visual style or a way of making the picture**: the template is project management — where files go, how
  versions and images are tracked, how work is checked and exported. What the video looks like is each work's own
  decision. The engine's graphic helpers, transitions and demo storyboard show what it can do; use, replace or ignore
  them.
- **The image-generation script**: it is tied too closely to a particular service, so the template presets no
  service, prompt, address or candidate count — you tell the assistant all of that. Only the landing place is fixed
  (candidates to `data/candidates/<key>/`, the chosen one added with `pic.py add`) along with a little bookkeeping
  (resumable, speaks up while waiting … see "Making images" in [AGENTS.md](../AGENTS.md)).
- **Release material** (cover, description, subtitles): different for every work; create a `release/` folder at the
  root when you need it.
- **Lyrics in languages other than Japanese**: set `reading_units` to `whole` in `project.json`; then each character
  (or word) is one tap, its reading can be anything (pinyin, the character itself), and a space in a reading splits it.
