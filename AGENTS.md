# Working conventions

A workflow template for web-based lyric videos. The layout and workflow are in [README.md](README.md) and
[docs/usage.md](docs/usage.md); how to use the engine is in [template/README.md](template/README.md).
Below are the conventions to keep while working.

They are about running the project: where files go, how versions, lyrics and images are tracked, how work is checked,
exported and handed over. They deliberately say nothing about what a video should look like or how its images should
be made — style, composition, pacing, transitions and the way images are drawn, found or generated are decided per
work, with the user. The engine's helpers and the demo storyboard in `template/` are examples of what the engine can
do, not a style to follow.

## Language

- This file, every README (the root one and the ones in `template/`, `lyrics/`, `ref/`, `data/`) and `docs/` are
  written in English. Each has a Simplified Chinese copy next to it named `*.zh-cn.md` (`AGENTS.zh-cn.md`,
  `README.zh-cn.md`, `docs/usage.zh-cn.md`, …); when you change one, change the other in the same edit. If the two
  ever disagree, the English one counts.
- **English is always the reference.** Anything that exists in more than one language is written in English first, and
  the other languages are translations of it — never the other way round, and never a translation used as a key.
- **Keywords stay in their original language** and are not translated: identifiers, file names, commands and flags;
  values that are data (the line status in `timing.txt` — `estimated` / `confirmed` — group names, notes stored in
  `pics.json`); lyrics;
  text the user asked to have written verbatim.
- In this file, name things in English: UI labels the way the page's source has them ("Use this"), terms by their
  English word (candidate, revision, key). Don't quote the translated label here — that belongs in `AGENTS.zh-cn.md`.
- The tool pages (`versions.html`, `lyric-tool/`, `pic-tool/`) and the video page's player (`template/index.html` and
  the start-up notes in `js/main.js`) are written in English: the English text in the page is
  the source string and also the lookup key (`tr('Saved')`, `data-i18n`). Simplified Chinese is a dictionary,
  `lang.zh-cn.js` next to the page (mechanism: `tools/i18n.js`). When you add or reword a UI string, write it in
  English in the page and add or update its `zh-cn` entry in the same change; never write Chinese UI text into a page,
  and never translate a value that gets written to a file. A missing entry shows up in English with a console warning.
- Code comments, docstrings, the usage notes at the top of each script, console output and error messages, and the
  headers the scripts write into generated files (`timing.txt`, `kana.txt`, `lyrics.js`, `analysis.js`) are in
  English only: no Chinese copy and no dictionary. The template's demo storyboard is in English too. Write everything
  you add the same way. What a work draws on the canvas (lyrics, titles, shot names) is that work's content and is in
  whatever language the work needs.
- Talk to the user, and write each version's `README.md`, in the language the user writes in.

## Directory boundaries

- `ref/` belongs to the user: read-only. Don't write into it, rename or delete anything.
- `data/` is tool output and is not in git. New binary products all go here, sorted into the existing sub-folders;
  no images, audio or video inside version folders.
- Version folders contain text only. Take every path from `tools/paths.py` / `tools/paths.cjs`; don't build paths
  separately in each script.
- **Data does not leave the workspace**: everything this workflow generates, downloads or uses temporarily — finished
  videos, temporary files (headless Chrome profiles, segment files), candidate images, optional dependencies and the
  models they download, the assistant's own temporary scripts and intermediate files — lives inside this folder
  (under `data/`; temporary things in `data/tmp/`, deleted when done). Don't write to other drives, the system temp
  directory or the user's home; keep `export_dir` / `tmp_dir` at their defaults. Change them only when the user
  explicitly says to put things elsewhere, and then in `project.local.json` (machine-specific, not in git), not in
  `project.json`.
  - If a newly added tool or dependency keeps its own cache (downloaded models, a package manager's download cache),
    point that cache at somewhere under `data/` in the script, or turn it off; don't leave it at the default location
    (usually in the home directory).
  - The only exceptions are software installed on the system itself (Python and already-installed packages, Node,
    Chrome, ffmpeg).
  - Two things are outside the workspace and can't be changed, so know about them: the page's fonts are loaded at run
    time from an online font service (not stored in the workspace); and the timing tool's unsaved drafts and the tool
    pages' UI settings (including the chosen language) are in the localStorage of the user's own browser.

## Versions

- Version names are `v<line>_<iteration>` (`v1_3`, `v2_1`). Open a new folder for each round of changes with
  `python tools/new_version.py`; **never modify old versions**.
- The tools exist once for the whole project (`tools/` `lyric-tool/` `pic-tool/`). To fix a tool, edit that one copy;
  don't copy tools into version folders.
- The tools, `template/` and these documents are independent of any particular work: comments and usage examples use
  only neutral placeholders (keys `hero` / `bg`, made-up lines and times) — no lyrics, key names, pictures or version
  numbers from an actual work. Drawing code that only one work needs goes in that work's version, not in these places.
- Each version's `README.md` records what changed compared with the previous version and why.

## Lyrics

- The timeline has exactly one editable source: `lyrics/timing.txt` (lines, readings and times are all in it).
  Each version's `js/lyrics.js` is a generated snapshot — don't edit it by hand. Once a timeline exists,
  `lyrics/kana.txt` is only a summary of it, rewritten by `lyrics.py --sync-kana` — don't edit that by hand either.
- Changing a line's text or readings, merging / splitting / adding / deleting lines: do it in the timing tool
  (or edit `timing.txt` and run `python lyric-tool/lyrics.py --sync-kana`).
  When the number of lines changes, every later line is renumbered: everything in the current version's
  `js/scenes.js` that refers to a line by number must be fixed in the same change, followed by frame grabs to check
  that the lyrics are still on the right shots.
- When trying out functions from `lyrics.py`, don't call `write_timing()` / `read_timing()` with their default path —
  the default argument is the project's real `timing.txt`. Pass the path of a temporary file explicitly
  (inside `data/tmp/`).
- Lyric times come from the per-mora timeline (a vertical table with one mora per row + the timing tool), not from
  estimating a whole line's start and end by ear.
- Times in the storyboard are written through the lyric and beat helpers, not as hard-coded seconds, so that a
  corrected timeline carries the picture with it: `LT()` line starts, `LE()` singing ends, `LL()` whole line over,
  `LCT(line, nth character)` the moment that character is sung, `BT()` the nth beat, `LCUT(line)` / `CUT(t)` /
  `DOWN(t)` the nearest beat or bar line. All of these are in `js/core.js`; don't re-implement them in the storyboard.
  Where to put cuts and events is the work's decision.

## Images

- `data/img/` is append-only. Redrawing = `pic.py add` as a new revision; never overwrite an old file.
- Numbers are never reused once assigned. When talking to the user refer to images by number (`#12`, `#12 r2`,
  `candidate hero/03`), not by file name.
- The storyboard refers to images by key; file names appear only in `images.json` (maintained by `pic.py`, not by hand).
- To use two revisions of one image in the same version (the new revision as usual, the old one appearing again
  somewhere else): `pic.py use <version> <key> <rev> --as <alias>`, and refer to the alias in the storyboard. The
  number stays the same; don't add the same file again under a different key.
- To see every revision and every candidate of one image (which one the selected version uses, which candidate each
  revision came from): click "Candidates N" at the top right of that image on the image page, or open
  `pic-tool/#<number>` directly.
- After a round of picking, hand the user `pic-tool/#pick` to verify (the "Candidates" view with "Only new /
  changed" ticked): one row per image of the selected version — the revision this version uses
  (with the one the previous version used beside it, if it changed) next to all candidates for that key, listing only
  images that are new or changed since the previous version. Unticked (`pic-tool/#cand`) = all images of the version;
  version set to "All versions" = everything in the pool.
- The "Images" and "Candidates" views are ordered by when an image first appears in the song, and each image
  lists the time of every appearance (click one to open the video at that point in the page). The times are measured
  by the image page (it runs the video page in an invisible iframe and draws every frame), stored in
  `data/derived/usage/<version>.json` and re-measured automatically when the storyboard changes. To find out at which
  seconds an image appears, read that file (keys are the names the storyboard uses; an alias counts as itself; no file
  = the image page hasn't opened that version yet).
- The user can swap images on the image page themselves: "Use this" under a revision / candidate that is not
  in use = `pic.py use`; a candidate is first added with `pic.py add` as a new revision (its note reads
  "picked on the image page"). So before touching a version's images, look at its `images.json` — don't assume it is still
  the way you left it. When the user says they swapped an image and the new one has a different aspect ratio or head
  position, re-measure that key's `head` / `fx` / `fy` in `js/assets.js`.
- The tiles on the image page are thumbnails (`/__thumb` in `tools/serve.py`, needs Pillow, stored in `data/thumbs/`,
  deletable at any time). Changes to `serve.py` take effect only after the preview server restarts. Without Pillow the
  image page still works; it just loads the originals.
- Don't give a new key the same name as an alias used in an older version (old versions' `images.json` can't be
  changed, and `pic.py check` reports the clash).
- After swapping an image, update its focus / head position in `js/assets.js` (the overlap check relies on it to tell
  whether a face is covered), and grab a frame of every shot that uses it to see that the shot still holds together.
- After changing anything image-related, run `python pic-tool/pic.py check` once.

## Making images

How a work's images are made — drawn by hand, taken from the user's material, generated by a service, or any mix —
is up to that work and the user. The template ships no generation script and sets no service, prompt, style or way of
choosing. It fixes only where things land and how they are tracked:

- Candidates go to `data/candidates/<key>/NN.<ext>`; the one chosen is added to the pool with `pic.py add`. A script
  that makes images lives in the workspace (`tools/` or `data/gen/`), not in the system temp directory, so the user can
  run it again; anything it keeps for itself (raw outputs, logs, per-key targets) goes under `data/gen/`.
- Don't assume what you haven't been told, and don't try services that merely happen to be reachable from this
  machine. The first time images are needed, ask the user and record the answers in "This project": how images are
  to be made; if a service is used, which one and how to connect (credentials never go in the repository or the
  documents), how many candidates per image, anything to watch regarding cost or quota, and which reference material
  may be used or uploaded.
- If a service is used: find out its limits (request size, reference count, concurrency, which errors are worth
  retrying) before submitting a batch and note them at the top of the script; test connectivity with the cheapest
  possible request, not the whole batch.
- A batch script: running it without arguments must not start a full batch, and an unknown argument (`--help`, say)
  prints the usage and exits; it is resumable (files that already exist are skipped, each key's target count is
  recorded in `data/gen/`); it prints a line whenever it is waiting (queued, rate-limited, upstream down) instead of
  sleeping silently.
- Before a batch, state the scale in your reply (how many keys, how many images, roughly how long); look at the first
  results before letting the rest run.
- When the user says stop, stop at once: confirm the process has really ended and nothing is still pending on the
  service's side, then say where it stopped, how many came out, and where a resumed run would pick up.
- When a batch can't be completed: write down honestly how many each key actually has. A stand-in added to the pool
  says so in its note, and what is owed is made up in a later round.
- Records: each version's README says, per changed image, how many candidates there were and which was chosen (the
  user asks by number). When the way images are made changes (another prompt, reference or tool), leave a line in the
  script's header saying which candidates came before the change, and mark any that should not be used.

## Picture

What the picture looks like is the work's own business. The rules here only keep it reproducible and checkable:

- The picture depends only on the time `t`: no state kept from the previous frame; randomness via `hash()`. Otherwise
  scrubbing, frame-by-frame export and parallel segmented export give different results.
- After changing the picture, look at it yourself first: `node tools/frames.cjs --sheet …` for frame grabs,
  `node tools/overlap.cjs` for lyric overlap (`--contrast` for lyrics against their background) — then hand it to
  the user. For a changed transition, include a frame from its middle (0.1–0.2 s after the shot starts).
- After moving shot boundaries or changing line numbers, grab a frame or two of every affected shot and check that the
  lyrics are still on the right shots.
- Drawing code that a work uses repeatedly goes in that work's version (a separate `js/props.js`, say), not into the
  engine. The engine's helpers (`js/fx.js`, `js/type.js`, `card()`, the transitions in `js/main.js`) may be used,
  replaced or ignored.
- Line numbers in the storyboard are the order in `js/lyrics.js`. When a line number doesn't exist, the page says so
  on its start screen, and frame grabs and export fail outright — fix the line number first; don't get around it with
  `MV_ALLOW_MISSING`.

## Export

- **Export video only when the user explicitly asks for the finished video.** After changing the picture or finishing
  a version, verify with frame grabs (`frames.cjs`) and the overlap check, and hand the user the preview address —
  don't export one on the side. Export takes minutes and hundreds of MB, and the user will most likely keep changing things.
- **Ask which resolution before exporting; don't just take 1080p.** Run without `--scale` the script produces
  1920×1080, and `--scale=2` produces 3840×2160 (4K) — which one the user wants is theirs to say, so ask every time a
  video is requested (along with anything else they care about: frame rate, file name) and pass it explicitly.
  When asking, give the cost of each: 4K takes about 3× as long per frame and the file is about 1.8× the size.
- **4K needs about 5 GB of free memory per worker** (measured: x264 about 4.2 GB + a headless Chrome about 0.9 GB;
  at 1080p it is about 2 GB per worker). When memory runs short, x264 prints `malloc of size … failed` and the whole
  export aborts — this is what happens when 4K is run with the 3 workers that 1080p uses. So at `--scale=2` the
  script defaults to 1 worker; pass a higher worker count only after checking that free memory covers
  workers × 5 GB, and say in your reply how many you used. The 4K picture itself is correct (compared frame by frame
  against 1080p); the problem is only memory.
- Only one export runs at a time (two together run out of memory and x264 fails to allocate). The script guards this
  with `data/.export.lock`; don't work around it.
- When an export fails midway the script closes its headless Chromes and removes the segment files itself. If it was
  killed from outside instead, `mvcdp-*` folders stay in `data/tmp/` and a `<name>_parts/` folder next to the output:
  delete them once no headless Chrome is running.
- Finished videos are in `data/export/`, headless Chrome's temporary directories in `data/tmp/` (100–250 MB per
  worker, deleted automatically afterwards). Before exporting, confirm the drive the workspace is on has room: a full
  song at 1080p is about 0.5–1.2 GB (4K about 1.8× that), and during export the segment files take as much again. If there isn't enough
  space, tell the user; don't move to another drive on your own.
- Export requires all images to be present (`MV_MISSING` empty); `MV_ALLOW_MISSING=1` is for preview frame grabs only.

## Running things

- Start the preview server with `preview` from `.claude/launch.json` (`python tools/serve.py 8600`), not an editor's
  built-in static preview — seeking in the audio needs Range support, and the tool pages need `/__project` and the
  other endpoints.
- Python needs numpy and scipy. On Windows the `python` command may be the Microsoft Store placeholder (it exits
  without printing anything): use `py` or the interpreter's full path.
- Long-running jobs (image generation, export, vocal separation) run in the background and you wait for them to
  finish instead of polling for progress; meanwhile make the changes that don't depend on the result. When a
  background job has been silent for a long time, check whether it is stuck waiting for something (preview server not
  running, generation service rate-limiting); don't just keep waiting.
- Before frame grabs or the overlap check, confirm the preview server is running. If it isn't, start it with `preview`
  from `.claude/launch.json` and say in your reply that you started it; if the user already has it running, use
  theirs — don't start another.
- When you don't know a script's arguments, read the notes at its top; don't probe with `--help` — some scripts
  ignore unknown arguments, which amounts to running them with none.
- `launch()` in `tools/cdp.cjs` waits for the video page to be ready; don't use it to open tool pages (it would wait forever).
- When a frame grab / check is interrupted midway, `mvcdp-*` directories are left behind in `data/tmp/`: delete them
  once you've confirmed no headless Chrome is still using them.
- When a version is done: delete the sheets assembled temporarily in `data/checks/`, then run
  `python pic-tool/pic.py check` and `python tools/data_manifest.py`.

## How to hand over a round of changes

- Act on the user's comments one by one; for each of them, this version's README says "what it was changed to".
- When a comment can be read two ways: hold off on the reading that changes more — either ask, or do the smaller one
  and state in your reply "this is how I understood it". Redoing a version because of a misunderstanding costs more
  than one extra question.
- Material from the user (classifications, correspondences, times and other facts) may be incomplete or
  misremembered: where a source exists, check against it, and list for the user whatever doesn't match or you aren't
  sure of; don't classify by file name yourself and then put it into the picture as fact. When the user says "there
  is fuller material elsewhere", go and read it, and note which one counts from now on.
- For big jobs (a full batch redraw, an export), say before starting how many images / how long / how much space; if
  the user changes the scale midway, follow the new one and say clearly how much has already been done.
- Every version's README has these fixed blocks: what changed since the previous version / how images were
  chosen / changes to files / not done yet and known problems.
- When handing over, state clearly: the preview address, which checks were done, that no video was exported; list by
  number the places you aren't sure about and ask the user to take another look.
- Say "checked" only for what was checked. If you only looked at the title and didn't listen line by line, or only
  looked at the thumbnail and didn't zoom in, say exactly that.
- When a version is handed over unfinished (generation service down, told to stop): state clearly what was swapped,
  what wasn't, what is still owed, and which command to run later to make it up.
- Report accidents of your own making too: a request triggered by mistake, a voided batch of images, a service you
  started or stopped.
- When you changed something the user didn't name (found during self-review): write it up separately in the README
  and in your reply, and say how to switch back (`pic.py use <version> <key> <rev>`).
- When the user says "keep optimising on your own until you're satisfied": review first — one frame per shot for the
  whole song tiled into an overview, and a pass over the images in use — list the problems, then act. If you can't
  find anything that would clearly be improved, stop and write down why; don't change things just to produce another
  version.
- Whenever a request from the user will keep applying (a design, things that must not appear, text to be written
  verbatim, how to use a tool), add it to this file — and to `AGENTS.zh-cn.md` — in the same round, and follow it
  from the next round on.

## This project (fill in after copying the template)

In the template this section is empty. Once a work is under way, write here the conventions that hold only for that
work, for example:

- Title and theme: one sentence.
- Direction: whatever the user has said about the look, the references to follow or avoid, and the way the video
  should feel — in the user's own terms. Nothing here comes from the template.
- The subject (characters etc.), if there is one: which reference material defines it; which shots it appears in;
  any exceptions.
- Making images (all of it learned by asking the user, see "Making images" above): how they are made; if a service is
  used, which one and how to connect (no credentials), how many candidates per key and per batch, the service's
  limits; the script's name.
- Which source counts: when the same thing is documented in several places, say which one to use.
- Things that must not appear: picture elements or text that could be misread.
- Third-party material: what the user named as usable directly, in which shots, how the source is credited; ask the
  user before adding more.
- The nature of the work: if it isn't released by the original author / officially, say so, and write nothing in the
  picture that could mislead about where it comes from.
- Credits: written exactly as the user gave them, noting which languages they are in.
