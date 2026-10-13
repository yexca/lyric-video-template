# data/ — 工具产出的非文本文件

[English](README.md)

这个文件夹归工具：里面的东西都是脚本生成或收进来的，你不需要手改。除了这两份说明（README）都不进 git，
所以**要另外备份**（至少 `img/`：生成的图重新出一遍不会一样）。`python tools/data_manifest.py` 会把文件清单和哈希记进仓库，
恢复之后用 `--check` 核对齐不齐。

| 位置 | 内容 | 谁写的 | 丢了怎么办 |
|---|---|---|---|
| `audio/` | `audio.wav` `audio.m4a`（从 ref 解码）、`vocals.wav` `vocals.m4a`（分离的人声）、特征缓存 | `tools/audio.py` `tools/separate.py` `lyric-tool/lyrics.py` | 重新跑脚本 |
| `derived/` | `analysis.js`（节拍、频段能量）、`vocal_onset.js`（打点工具的波形）、`usage/<版本>.json`（每张图在画面里出现的时间段） | `tools/analyze.py` `lyric-tool/lyrics.py --prepare`；`usage/` 是图片页量的 | 重新跑脚本；`usage/` 随时可删，下次打开图片页重量 |
| `img/` | **图片池**：所有版本用到的图。只增不改，重画 = 新文件（`<键>.r2.png`） | `pic-tool/pic.py add` | 只能从备份恢复 |
| `candidates/` | 候选图，按键分文件夹：`candidates/<键>/01.png …`。选中的再收进 `img/` | 生成图片的脚本 / 你 | 重新生成 |
| `checks/` | 检查用的截帧、缩略图总览：`checks/<版本>/…` | `tools/frames.cjs` | 随时可删 |
| `thumbs/` | 图片页用的缩略图（WebP，`thumbs/<宽>/`），第一次看到某张图时生成 | `tools/serve.py` | 随时可删，下次打开图片页重新生成 |
| `export/` | 导出的成片 | `tools/export_video.cjs` | 重新导出 |
| `tmp/` | 临时文件：无头 Chrome 的用户目录（每路 100–250 MB，用完自动删） | `tools/cdp.cjs` | 随时可删（没有工具在跑的时候） |
| `pydeps/` | 可选依赖（demucs），装法见 `tools/separate.py` | 你 / pip | 重新装 |
| `models/` | 可选依赖下载的模型（demucs 的人声分离模型，约 80 MB） | `tools/separate.py` 第一次运行时 | 下次运行重新下载 |

**所有数据都留在这个工作区里**：工具不往别的盘、系统临时目录里写东西，成片和临时文件也在这里。所以这个文件夹会比较大，注意所在的盘的空间。

和 `ref/` 的分界：`ref/` 是你给的输入，`data/` 是工具的输出。一份资料如果是你找来的，放 `ref/`；如果是脚本做出来的，在 `data/`。
