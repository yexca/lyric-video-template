'use strict';
/* Simplified Chinese for the video page's player: the start screen, the controls and the start-up notes.
 * Keys are the English text written in index.html and js/main.js (see tools/i18n.js). When a string is added or
 * reworded there, add or change its entry here — a missing one is shown in English, with a warning in the console.
 * What is drawn on the canvas (lyrics, titles, shot names) is the work's content and is never translated. */
I18N.add('zh-cn', '简体中文', {
  // fixed text on the page
  'Loading…': '加载中…',
  '▶ Play': '▶ 播放',
  'Space play / pause · ←/→ 5 s (Shift 1 s) · 1–9 sections · L lyrics · F full screen · H hide the controls · D debug info':
    'Space 播放/暂停 · ←/→ 5 秒（Shift 1 秒） · 1–9 段落 · L 歌词 · F 全屏 · H 隐藏界面 · D 调试信息',
  'Play / pause': '播放/暂停',
  'Show lyrics (L)': '显示歌词（L）',
  'Lyrics': '歌词',
  'Full screen': '全屏',

  // start-up notes
  'No audio (data/audio/audio.m4a): playing without sound. Put the audio in ref/audio/, then run tools/audio.py':
    '没有音频（data/audio/audio.m4a）：无声播放。把音频放进 ref/audio/ 后运行 tools/audio.py',
  'No audio analysis data (data/derived/analysis.js): the beat is simulated at 120 BPM': '没有音频分析数据（data/derived/analysis.js）：节拍按 120 BPM 模拟',
  'Missing images: {0}': '缺图：{0}',
  'The storyboard refers to lines that do not exist: {0} (the lyrics now have lines 0–{1}). After merging or deleting lines, the line numbers in js/scenes.js have to be updated.':
    '分镜引用了不存在的句子：{0}（歌词现在是第 0–{1} 句）。合并 / 删除句子后，js/scenes.js 里的句号要跟着改。',
});
