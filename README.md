# opus-video-template

English · [简体中文](README.zh-cn.md)

A workflow template for making lyric videos (MVs) as a web page. The picture is a single 1920×1080 canvas, the content
is written as pure functions from time to picture, you preview it live in the browser, and headless Chrome exports it
frame by frame to an mp4.

This is an empty template: it contains no songs and no images. Copy the folder (or use the repository as a template)
to start a new work. It is meant to be driven together with a coding assistant — [AGENTS.md](AGENTS.md) holds the
working conventions the assistant follows.

The template organises the work — where files go, how versions and images are tracked, how the result is checked
and exported. It does not prescribe a visual style or how images are made; that is up to each work.

## What's inside

- **Engine** (`template/`) — canvas scenes keyed to the lyrics and the beat, transitions, a player, a frame-export interface.
- **Lyric timing tool** (`lyric-tool/`) — plain lyrics → a per-mora timeline you tap along to the song → timing data for the video.
- **Image tool** (`pic-tool/`) — a numbered image pool with revisions, candidates side by side, per-version image lists and diffs.
- **Scripts** (`tools/`) — preview server, audio analysis, new versions, frame grabs, lyric-overlap check, export.
- **Versions** — every round of changes is a new folder (`v1_1`, `v1_2`, `v2_1` …) and old ones are never touched, so any two can be compared.

The tool pages and the video page's player are available in English and Simplified Chinese. Code comments and the
scripts' console output are in English.

## Requirements

Python 3.10+ with `numpy` and `scipy` (Pillow optional), Node 22+, Chrome or Edge, and ffmpeg on the PATH.

## Quick start

Put the audio in `ref/audio/` and the lyrics in `ref/lyrics/`, then:

```bash
python tools/audio.py
```

```bash
python lyric-tool/lyrics.py --init
```

```bash
python lyric-tool/lyrics.py
```

```bash
python tools/new_version.py
```

```bash
python tools/serve.py
```

Open <http://127.0.0.1:8600/> to watch the versions, `/lyric-tool/` to time the lyrics and `/pic-tool/` to manage
images. Write the video in `v1_1/js/scenes.js`, and export it when it is done:

```bash
node tools/export_video.cjs
```

## Documentation

- [docs/usage.md](docs/usage.md) — the full workflow, configuration, the tool pages, and the command reference
- [AGENTS.md](AGENTS.md) — conventions for coding assistants working in this repository
- [template/README.md](template/README.md) — the engine's files and its three rules
- [ref/README.md](ref/README.md), [data/README.md](data/README.md), [lyrics/README.md](lyrics/README.md) — what goes in each folder

Simplified Chinese versions of the documents sit next to them as `*.zh-cn.md`.
