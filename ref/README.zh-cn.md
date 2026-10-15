# ref/ — 你放的原始资料

[English](README.md)

这个文件夹归你：工具和编码助手只读，不往里写、不改名、不删除。除了这两份说明（README），里面的东西都不进 git。

| 位置 | 放什么 |
|---|---|
| `audio/` | 歌曲音频，一个文件（wav / flac / mp3 / m4a / opus …）。有多个时在 `project.json` 的 `audio` 里写明用哪个 |
| `lyrics/` | 歌词原文，一个文件：带时间标签的 `.lrc`，或者一行一句的 `.txt`。有多个时在 `project.json` 的 `lyrics` 里写明 |
| `images/` | 参考图：主体的设定、想要的画风、构图参考。可以分子文件夹；建议在旁边放一个 `SOURCES.md` 记下每张图的出处 |
| 其他 | 设定文档、时间线、链接清单等，随意放 |

放好之后：

```bash
python tools/audio.py
```

```bash
python lyric-tool/lyrics.py --init
```
