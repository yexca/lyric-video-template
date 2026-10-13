# 使用说明

[English](usage.md) · 回到 [README](../README.zh-cn.md)

用这个模板把一首歌从原始资料做到成片的全过程。编码助手干活时守的约定在 [AGENTS.md](../AGENTS.md)（中文版 [AGENTS.zh-cn.md](../AGENTS.zh-cn.md)）。

- [目录](#目录)
- [需要的环境](#需要的环境)
- [流程](#流程)：[配置](#0-配置) · [放资料](#1-放资料) · [音频](#2-音频) · [歌词](#3-歌词) · [开第一个版本](#4-开第一个版本) · [图片](#5-图片) · [检查](#6-检查) · [导出](#7-导出) · [备份清单](#8-备份清单)
- [图片页](#图片页)
- [工具页面和语言](#工具页面和语言)
- [工具一览](#工具一览)
- [没有放进模板的东西](#没有放进模板的东西)

## 目录

```
ref/          你放的原始资料：音频、歌词原文、参考图            不进 git   工具只读
data/         工具产出的非文本文件：解码的音频、图片池、候选、截帧、成片   不进 git   要另外备份
lyric-tool/   歌词工具：普通歌词 → 逐拍时间轴 → 卡点数据
pic-tool/     图片工具：编号登记、按版本 / 按出现顺序总览、候选对比和换图、两版对比
tools/        预览服务、音频分析、新建版本、截帧、重叠检查、导出
lyrics/       歌词的读音标注和时间轴（文本）
template/     网页视频模板：新版本从这里复制出来
v1_1/ v1_2/ v2_1/ …   各个版本（现在还没有）
docs/         这几份说明
project.json  项目配置        pics.json  图片编号登记表        versions.html  版本列表页
AGENTS.md     给编码助手看的工作约定
```

版本名是 `v<线>_<迭代>`：**线**是一种整体做法，**迭代**是这种做法下的第几次修改。`v1_3` 改一轮是 `v1_4`；
想换一种做法并行试，就开新的线 `v2_1`。旧版本的文件夹不再修改，所以随时可以并排对比。

哪些东西在 git 里：所有代码和文本，包括「每个版本用了哪些图」（`<版本>/images.json`）和图片编号（`pics.json`）。
图片、音频本身不在，靠这两份文本加 `data.manifest.txt`（文件清单和哈希）对得上。

## 需要的环境

- Python 3.10+，`pip install numpy scipy`（装了 Pillow 的话图片页用缩略图，图多的时候快很多；没装就直接用原图）
- Node 22+（不需要 `npm install`，没有依赖）
- Chrome 或 Edge、ffmpeg（在 PATH 里）
- 可选：demucs（分离人声，歌词自动对齐更准），装在 `data/pydeps/`、模型下载到 `data/models/`，装法见 [tools/separate.py](../tools/separate.py)

## 流程

### 0. 配置

改 [project.json](../project.json)：

| 键 | 含义 |
|---|---|
| `title` `slug` | 作品名（工具页面的标题）、文件名用的短名（成片叫 `<slug>_<版本>.mp4`） |
| `port` | 预览服务的端口。同时做几个作品时各用各的 |
| `current` | 当前版本。各工具不写版本时默认用它；`new_version.py` 会自动改 |
| `audio` `lyrics` | `ref/audio/`、`ref/lyrics/` 里有多个文件时，写明用哪个（相对根目录的路径） |
| `lrc_offset` | LRC 的时刻比音频早多少秒（LRC 偏早为正） |
| `bpm_range` | BPM 的搜索范围。自动识别容易认成一半或两倍，知道大概速度就把范围收窄 |
| `bar_offset` | 小节的重拍落在第几拍（0–3），打点工具画小节线用 |
| `export_dir` `tmp_dir` | 成片目录、无头 Chrome 的临时目录。默认都在工作区里（`data/export`、`data/tmp`）：**所有数据不出工作区**，一般不用改。确实要放到别处时写在 `project.local.json`（本机专用、不进 git，同名键覆盖） |

### 1. 放资料

音频放 `ref/audio/`，歌词原文放 `ref/lyrics/`，参考图放 `ref/images/`（直接放在 `ref/` 根目录下也认）。见 [ref/README.zh-cn.md](../ref/README.zh-cn.md)。
没有单独的歌词文件、但音频标签里带歌词时，第 3 步的 `--init` 会把它取出来存成 `lyrics/source.lrc`；署名行和每句后面附的中文翻译会自动去掉。

### 2. 音频

解码并分析节拍：

```bash
python tools/audio.py
```

### 3. 歌词

先生成读音标注的底稿，补上汉字读音（`漢字{よみ}`）：

```bash
python lyric-tool/lyrics.py --init
```

再生成时间轴（自动估一份）：

```bash
python lyric-tool/lyrics.py
```

然后启动预览服务，在打点工具里跟着歌一拍一拍确认（<http://127.0.0.1:8600/lyric-tool/>）：

```bash
python tools/serve.py
```

句子本身也在打点工具里改：「改句子 / 读音」打开一个注音样子的编辑框（汉字下面填假名），另外可以把一句拆成两句、和下一句合并、加一句、删一句。
保存时 `timing.txt`、`kana.txt` 和各版本用的 `lyrics.js` 一起更新。**句数变了以后句子的编号会变**，分镜里按句号写的地方（`LT(句号)`、`li: 句号`）要跟着改——保存时工具会列出哪些编号变了。

格式和全部命令见 [lyric-tool/lyrics.py](../lyric-tool/lyrics.py) 开头（英文）。时间轴文件里每句的状态写作 `estimated` / `confirmed`，不跟着界面语言变。

### 4. 开第一个版本

从模板复制出 `v1_1`，之后每一轮修改再开一版：

```bash
python tools/new_version.py
```

内容写在 `v1_1/js/scenes.js`（分镜脚本）。引擎的用法和三条规矩见 [template/README.zh-cn.md](../template/README.zh-cn.md)。
在 <http://127.0.0.1:8600/> 看所有版本。

### 5. 图片

图可以自己画、自己找，也可以让编码助手调用生图服务来画。用生图服务时，助手会先问你几件事（它不会自己假设）：

- 用哪个生图服务、怎么连接（凭证不要写进仓库）；
- 每张图要不要一次出几张候选来挑、出几张——多出几张更容易挑到好的，费用和时间也成倍；
- 主体的设定用哪些参考图。参考图不完整时（只有一个角度、有遮挡），最好再给一张标准角度、没有遮挡的，或者让助手准备材料、你来做一张标准的设定图：
  看不全的地方、不对称的地方很容易画错，而且会错在每一张图上。

生图脚本每个作品自己写（模板里没有，见最后一节），要求写在 [AGENTS.zh-cn.md](../AGENTS.zh-cn.md) 的「生图」一节。

候选图放 `data/candidates/<键>/`，在 <http://127.0.0.1:8600/pic-tool/> 里看。选中的收进图片池并登记编号：

```bash
python pic-tool/pic.py add data/candidates/hero/03.png --key hero --group scenes
```

同一个键再 `add` 一次就是这张图的新一版（`#12 r2`），编号不变；旧版本继续用旧的那一版。
对接时说「#12」「#12 r2」「候选 hero/03」——图片页上点编号牌会复制这个说法。
同一个版本里要同时用一张图的两个版次，用 `pic.py use <版本> <键> <版次> --as <别名>`，分镜里用别名引用。
全部命令见 [pic-tool/pic.py](../pic-tool/pic.py) 开头（英文）。

### 6. 检查

都需要预览服务在运行：

```bash
node tools/frames.cjs --sheet 0 10 20 30 40 50
```

```bash
node tools/overlap.cjs
```

前者截指定时刻的画面拼成一张总览（`data/checks/<版本>/sheet.jpg`），后者逐帧查歌词有没有被别的字压住、有没有挡住人脸。

### 7. 导出

```bash
node tools/export_video.cjs
```

不带参数是 1920×1080、30fps、3 路并行。要 4K（3840×2160）加 `--scale=2`：

```bash
node tools/export_video.cjs --scale=2
```

导出前先定好分辨率——编码助手会问你，不会直接按 1080p 出。4K 每一帧大约要 3 倍的时间，文件大约是 1.8 倍。

**4K 和内存。** 4K 每一路大约要 5 GB 空闲内存（1080p 约 2 GB）。不够的话 x264 报 `malloc of size … failed`，整个导出失败，
所以 `--scale=2` 时不写并行数就只开 1 路（`node tools/export_video.cjs 30 2 --scale=2` = 30fps、2 路）。
要多开，先确认空闲内存够「路数 × 5 GB」。

同一时间只能跑一个导出（脚本会拦住第二个）。

### 8. 备份清单

`data/`、`ref/` 不在 git 里，隔一段时间记一次清单并提交；换机器或恢复备份后用 `--check` 核对：

```bash
python tools/data_manifest.py
```

## 图片页

<http://127.0.0.1:8600/pic-tool/>

- 上面的**「版本」**是筛选：选一个版本只看它用的图，选「全部版本」看图片池里的全部（每张图的全部版次 / 全部候选文件夹）。
- **「图片」**按图在歌里第一次出现的时刻排（按段落分组），图下面是它每次出现的时刻，点一下就在页面里打开那个版本的视频、停在那一段。
  时刻是图片页自己量的（把视频页面开在看不见的 iframe 里逐帧画一遍，几秒钟；存在 `data/derived/usage/`，分镜改过会自动重量）。
- **「候选」**（`pic-tool/#cand`）把一个版本的图一行一行排开：这个版本用的那一版（换过的话旁边是上一个版本用的）+ 没在用的旧版次 + 这个键的全部候选，
  标出用的是哪张候选。勾上「只看新增 / 换过的」（`pic-tool/#pick`）只列这一版新增 / 换过的图——一轮图挑完以后在这里核对挑得对不对。
- 每张图右上角的**「候选 N」**打开这一张图自己的页面（也可以直接开 `pic-tool/#12`）：它的全部版次和 `data/candidates/<键>/` 里的全部候选排在一起，
  标出当前版本在用哪一张、每个版次是从哪张候选收进来的——决定「要不要换一张」时在这里看。
- 没在用的图下面有**「用这张」**：点一下，所选版本就改用它（候选先收进图片池成为新的一版，等于 `pic.py add` / `pic.py use`），
  页面下方弹出的提示里可以撤销、可以直接看换完的画面。新图的宽高比、头部位置和原来不一样时，`js/assets.js` 里量好的参数要另外改。
- **「两版对比」**（`pic-tool/#diff`）把两个版本逐张并排。
- 格子里是缩略图（存在 `data/thumbs/`，可以随时删），点开才加载原图；换页面、刷新、后退都会回到原来的位置。

## 工具页面和语言

三个工具页面——版本列表（`/`）、歌词打点（`/lyric-tool/`）、图片（`/pic-tool/`）——和视频页面的播放器（开始画面、控制条、启动时的提示）有英文和简体中文两种界面。默认跟着浏览器的语言
（浏览器的首选语言里第一个有的；都没有就是英文）；工具页面右上角的下拉框可以切换，选了以后记在浏览器里，视频页面跟着它走。地址里加 `?lang=en` / `?lang=zh-cn` 也一样。

只有英文的：脚本打印的话（包括服务转给页面的 `pic.py` / `lyrics.py` 的输出）、脚本里的注释和用法说明、脚本生成的文件的文件头。
视频画在画布上的东西是作品自己的内容，和界面语言无关。

要改页面的话：页面是用英文写的——页面里的英文是原文，也是查词典的键；简体中文是一份词典，在页面旁边的 `lang.zh-cn.js` 里
（做法见 [tools/i18n.js](../tools/i18n.js) 开头）。加了、改了界面上的字，那边要跟着加、跟着改——缺的条目页面上会显示英文，并在控制台提醒。
再加一种语言 = 每个页面多一份 `lang.<语言>.js`。

## 工具一览

| 命令 | 作用 |
|---|---|
| `python tools/serve.py [端口]` | 预览服务（一个端口看所有版本和工具） |
| `python tools/audio.py [--force]` | `ref/audio/` → `data/audio/audio.wav` `audio.m4a`，并做音频分析 |
| `python tools/analyze.py` | 只重做音频分析 → `data/derived/analysis.js` |
| `python tools/separate.py` | 分离人声 → `data/audio/vocals.wav`（可选） |
| `python lyric-tool/lyrics.py [--init / --estimate [句号…] / --prepare / --to 版本…]` | 歌词：底稿、估计、生成 |
| `python pic-tool/pic.py add / use / drop / list / check` | 图片：入池登记、换版次、核对 |
| `python tools/new_version.py [--line] [--from 版本] [名字]` | 开新版本 |
| `node tools/frames.cjs [版本] [--sheet] 时刻…` | 截帧 |
| `node tools/overlap.cjs [版本] [起 止] [--all] [--contrast]` | 歌词重叠 / 挡脸 / 对比度检查 |
| `node tools/export_video.cjs [版本] [输出.mp4] [fps] [并行数] [--scale=2]` | 导出成片 |
| `python tools/data_manifest.py [--check]` | `data/` `ref/` 的文件清单 |
| `python tools/cand_sheet.py [键…]`<br>`python tools/cand_sheet.py --zoom 图 [x0 y0 x1 y1] … [--box …] [--out 名字]` | 候选图总览；放大看一块或几块（图 = `键/NN` 或 `img/文件名`，几块拼成一张）→ `data/checks/`（需要 Pillow） |

Windows 上 `python` 这个命令可能是应用商店的占位程序（什么都不输出就退出）：换成 `py` 或解释器的完整路径。

## 没有放进模板的东西

- **生成图片的脚本**：和具体用哪个生图服务、哪些提示词绑得太紧，所以模板不预设任何服务、地址或张数——这些都由你告诉助手。
  约定的只有落点（候选出到 `data/candidates/<键>/`，选中的用 `pic.py add` 收）和脚本要做到的几件事
  （能接着跑、提交前检查长度、一轮一张地轮着出、等待时出声……见 [AGENTS.zh-cn.md](../AGENTS.zh-cn.md) 的「生图」一节）。
- **发布用的材料**（封面、简介、字幕）：每个作品不一样，需要时在根目录开一个 `release/`。
- **日语以外的歌词**：拆拍规则是按假名写的。别的语言可以把 `kana.txt` 里每个音节当一「拍」来标，但没有实测过。
