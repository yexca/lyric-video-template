# lyrics/ — the lyric timing data (text, in git)

[简体中文](README.zh-cn.md)

| File | Contents | Who edits it |
|---|---|---|
| `timing.txt` | **The per-mora timeline, the only editable source**: one mora per row — time / displayed character / reading. Lines, readings and times all go by this file | The timing tool (`/lyric-tool/`); can also be edited by hand |
| `kana.txt` | Lyrics + kanji readings, one line per row (`漢字{よみ}`). Before the first estimate: `lyrics.py --init` generates the draft and you fill in the readings. Once a timeline exists: it is a summary of the timeline, rewritten automatically on save | By hand before the first estimate; left alone afterwards |
| `lyrics.js` | Data generated from `timing.txt`, loaded directly by the web page. Each version's `js/lyrics.js` is a snapshot of it | Generated; do not edit by hand |
| `backup/` | The backup the timing tool keeps before every save (not in git) | Automatic |

Changing a line's text or readings, and merging / splitting / adding / deleting lines, are all done in the timing tool.
When the number of lines changes, line numbers change, and everything in the storyboard that refers to a line by
number has to follow.

A line's status in `timing.txt` is `estimated` (automatic estimate, not yet confirmed by ear) or `confirmed`.

The format and all commands are described at the top of [lyric-tool/lyrics.py](../lyric-tool/lyrics.py).

`timing.txt` contains the complete lyrics. If the lyrics are copyrighted, don't make the repository public — or add
this folder to `.gitignore` as well.
