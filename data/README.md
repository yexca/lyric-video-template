# data/ — non-text files produced by the tools

[简体中文](README.zh-cn.md)

This folder belongs to the tools: everything in it is generated or collected by a script, and you never need to edit
it by hand. Apart from these two README files none of it is in git, so **back it up separately** (at the very least
`img/`: generated images never come out the same twice). `python tools/data_manifest.py` records a file list with
hashes in the repository; after restoring, `--check` tells you whether everything is there.

| Where | Contents | Written by | If it is lost |
|---|---|---|---|
| `audio/` | `audio.wav` `audio.m4a` (decoded from ref), `vocals.wav` `vocals.m4a` (separated vocals), feature caches | `tools/audio.py` `tools/separate.py` `lyric-tool/lyrics.py` | Run the scripts again |
| `derived/` | `analysis.js` (beats, band energy), `vocal_onset.js` (the waveform for the timing tool), `usage/<version>.json` (when each image is on screen) | `tools/analyze.py` `lyric-tool/lyrics.py --prepare`; `usage/` is measured by the image page | Run the scripts again; `usage/` can be deleted at any time and is re-measured the next time the image page opens |
| `img/` | **The image pool**: every image any version uses. Append-only; a redraw is a new file (`<key>.r2.png`) | `pic-tool/pic.py add` | Can only be restored from a backup |
| `candidates/` | Candidate images, one folder per key: `candidates/<key>/01.png …`. The chosen one is then added to `img/` | The image-generation script / you | Generate again |
| `checks/` | Frame grabs and overview sheets for checking: `checks/<version>/…` | `tools/frames.cjs` | Deletable at any time |
| `thumbs/` | Thumbnails for the image page (WebP, `thumbs/<width>/`), made the first time an image is seen | `tools/serve.py` | Deletable at any time; regenerated the next time the image page opens |
| `export/` | Exported videos | `tools/export_video.cjs` | Export again |
| `tmp/` | Temporary files: headless Chrome profiles (100–250 MB per worker, deleted automatically when done) | `tools/cdp.cjs` | Deletable at any time (while no tool is running) |
| `pydeps/` | Optional dependencies (demucs); see `tools/separate.py` for how to install | You / pip | Install again |
| `models/` | Models downloaded by optional dependencies (the demucs vocal-separation model, about 80 MB) | `tools/separate.py` on its first run | Downloaded again on the next run |

**All data stays in this workspace**: the tools write nothing to other drives or the system temp directory, and
finished videos and temporary files are here too. So this folder gets fairly large — keep an eye on the free space of
the drive it is on.

The line between this and `ref/`: `ref/` is the input you provide, `data/` is the tools' output. Material you found
goes in `ref/`; anything a script made is in `data/`.
