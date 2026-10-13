# ref/ — your raw material

[简体中文](README.zh-cn.md)

This folder is yours: the tools and the coding assistant only read it — they don't write into it, rename or delete
anything. Apart from these two README files, nothing in it is in git.

| Where | What goes there |
|---|---|
| `audio/` | The song's audio, one file (wav / flac / mp3 / m4a / opus …). If there are several, name the one to use under `audio` in `project.json` |
| `lyrics/` | The original lyrics, one file: an `.lrc` with timestamps, or a `.txt` with one line per row. If there are several, name the one to use under `lyrics` in `project.json` |
| `images/` | Reference images: the subject's design, the art style you want, composition references. Sub-folders are fine; a `SOURCES.md` next to them recording where each image came from is recommended.<br>If the images will be drawn by a generation service, try to include one design image from a **standard angle, with nothing hidden, complete**: when the reference is incomplete, the parts that can't be seen and anything asymmetrical are easily drawn wrong |
| anything else | Design documents, timelines, lists of links and so on — as you like |

Once the material is in place:

```bash
python tools/audio.py
```

```bash
python lyric-tool/lyrics.py --init
```
