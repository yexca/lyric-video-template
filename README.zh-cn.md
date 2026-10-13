# opus-video-template

[English](README.md) · 简体中文

用网页做歌词视频（MV）的工作流模板：画面是一张 1920×1080 的 canvas，内容写成「时刻 → 画面」的纯函数，
浏览器里实时预览，用无头 Chrome 逐帧导出成 mp4。

这是一个空模板：不含任何歌曲、图片。复制这个文件夹（或者把仓库当模板用）开始一个新作品。
它是和编码助手一起用的——助手守的工作约定在 [AGENTS.md](AGENTS.md)（中文版 [AGENTS.zh-cn.md](AGENTS.zh-cn.md)）。

## 里面有什么

- **引擎**（`template/`）——跟着歌词和节拍走的 canvas 分镜、转场、播放器、逐帧导出的接口。
- **歌词打点工具**（`lyric-tool/`）——普通歌词 → 跟着歌一拍一拍打出来的时间轴 → 视频用的卡点数据。
- **图片工具**（`pic-tool/`）——带编号和版次的图片池、候选并排对比、各版本的用图清单和两版对比。
- **脚本**（`tools/`）——预览服务、音频分析、新建版本、截帧、歌词重叠检查、导出。
- **版本**——每一轮修改开一个新文件夹（`v1_1`、`v1_2`、`v2_1`……），旧的不再动，随时可以并排对比。

工具页面和视频页面的播放器有英文和简体中文两种界面。代码注释和脚本打印的话是英文。

## 需要的环境

Python 3.10+（`numpy`、`scipy`，Pillow 可选）、Node 22+、Chrome 或 Edge、ffmpeg（在 PATH 里）。

## 快速开始

音频放进 `ref/audio/`，歌词放进 `ref/lyrics/`，然后：

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

打开 <http://127.0.0.1:8600/> 看各个版本，`/lyric-tool/` 打点，`/pic-tool/` 管图片。
视频内容写在 `v1_1/js/scenes.js`，做完以后导出：

```bash
node tools/export_video.cjs
```

## 文档

- [docs/usage.zh-cn.md](docs/usage.zh-cn.md)——完整流程、配置、工具页面、命令一览
- [AGENTS.zh-cn.md](AGENTS.zh-cn.md)——编码助手在这个仓库里干活的约定（助手读的是英文的 [AGENTS.md](AGENTS.md)）
- [template/README.zh-cn.md](template/README.zh-cn.md)——引擎的文件和三条规矩
- [ref/README.zh-cn.md](ref/README.zh-cn.md)、[data/README.zh-cn.md](data/README.zh-cn.md)、[lyrics/README.zh-cn.md](lyrics/README.zh-cn.md)——各个文件夹里放什么

文档默认是英文，简体中文版在旁边，文件名以 `.zh-cn.md` 结尾。
