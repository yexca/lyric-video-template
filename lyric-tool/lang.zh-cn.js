'use strict';
/* Simplified Chinese for the timing tool. Keys are the English text written in index.html (see tools/i18n.js).
 * When a UI string is added or reworded there, add or change its entry here — a missing one is shown in English,
 * with a warning in the console.
 * Terms: line = 句, phrase = 短句, mora = 拍 (one kana), beat = 音乐上的拍, tap = 打点, tied = 连唱, reading = 读音.
 * The line status in the timeline file is always written estimated / confirmed (same as lyrics.py), whatever the
 * UI language; the first two entries below are how those two words are displayed. */
I18N.add('zh-cn', '简体中文', {
  'estimated': '推定',
  'confirmed': '已确认',

  // fixed text on the page
  'Lyric timing': '歌词逐拍打点',
  'Mora timing': '逐拍打点',
  '▶ Play / pause': '▶ 播放 / 暂停',
  '⟲ Replay line': '⟲ 本句重放',
  'Speed': '速度',
  'Vocals': '人声',
  'Full mix': '原曲',
  'Latency calibration': '延迟校准',
  'Saved': '已保存',
  'Unsaved changes': '有未保存的修改',
  '✓ Confirm line': '✓ 确认本句',
  'Save to project': '保存到项目',
  'View in the video': '在 MV 里看',
  'Shift': '平移',
  'Seconds to shift by (positive)': '平移的秒数（正数）',
  's': '秒',
  'Line earlier': '本句前移',
  'Line later': '本句后移',
  'All earlier': '全部前移',
  'All later': '全部后移',
  'Earlier / later moves every mora of the line, and its end, together; Ctrl+Z undoes it': '前移 = 时刻变早，后移 = 时刻变晚；整句（含句末）一起移动，可以 Ctrl+Z 撤销',
  'Line': '句子',
  '✎ Edit text / readings': '✎ 改句子 / 读音',
  'Split at the selected mora': '从选中的拍拆成两句',
  'Make the selected mora and everything after it a new line': '把当前选中的拍和它后面的部分拆成新的一句',
  'Merge with next': '和下一句合并',
  'Append the next line to this one': '把下一句接到这一句后面',
  'Add a line after': '后面加一句',
  'Add a line after this one': '在这一句后面加一句',
  'Delete line': '删除本句',
  'All of these can be undone with Ctrl+Z; nothing is written to the project until you save': '都可以 Ctrl+Z 撤销；保存后才写进项目',
  'Restore draft': '恢复草稿',
  'Discard': '丢弃',
  'Whole song: the bright box is the range shown in the waveform above; drag it to scroll sideways': '全曲：亮的框是上面波形显示的范围，拖它横向滚动',
  'Start': '开始',
  'Close': '关闭',
  'Cancel': '取消',
  'Apply': '应用',
  'Ctrl+Enter apply　Esc cancel': 'Ctrl+Enter 应用　Esc 取消',
  'end': '句末',
  help: `
    <kbd>Space</kbd> 播放/暂停　<kbd>R</kbd> 从本句前 1 秒重放　<kbd>J</kbd>/<kbd>F</kbd> 打点：在每一拍唱出的瞬间按，记下当前拍并跳到下一拍（最后一下记句末）　<kbd>K</kbd> 当前拍「连唱」（没有单独起音，自动插值）<br>
    <kbd>Backspace</kbd> 回到上一拍重打　<kbd>←</kbd><kbd>→</kbd> 选拍　<kbd>,</kbd><kbd>.</kbd> 微调 ±10ms（加 <kbd>Shift</kbd> ±50ms）　<kbd>Q</kbd> 吸附到最近的人声起音　<kbd>?</kbd> 标记不确定<br>
    <kbd>[</kbd><kbd>]</kbd> 本句整体前移 / 后移（秒数在「平移」框里）　<kbd>Shift</kbd>+<kbd>[</kbd><kbd>]</kbd> 全部句子整体前移 / 后移<br>
    <kbd>E</kbd> 改这一句的字和读音（合并、拆开、加一句、删除在「句子」那一行）　<kbd>Enter</kbd> 确认本句并到下一句　<kbd>↑</kbd><kbd>↓</kbd> 换句　<kbd>1</kbd>–<kbd>4</kbd> 速度 0.5/0.6/0.75/1　<kbd>V</kbd> 人声 / 原曲　<kbd>Ctrl+Z</kbd> 撤销　<kbd>Ctrl+S</kbd> 保存　<kbd>P</kbd> 在 MV 里看这一句<br>
    波形：点空白处从那里播放；拖动竖线改时刻；滚轮缩放。细竖线 = 16 分音符，亮线 = 拍，粗线 = 小节。下方的短竖线是人声起音强度。<br>
    横向滚动：拖波形下面那条全曲缩略条里的亮框（点框外面，框就挪过去）；或者按住波形的空白处左右拖；或者横向滚轮 / <kbd>Shift</kbd>+滚轮；<kbd>Shift</kbd>+<kbd>←</kbd><kbd>→</kbd> 滚半屏。播放线走出画面右边时会自动翻页。缩略条底下的小条是各句的位置（绿 = 已确认，粉 = 当前句）。`,
  calib: `
    <b>延迟校准</b><br>
    会从前奏的鼓点开始以 1× 播放，跟着<b>每一拍</b>（四分音符）按 <kbd>J</kbd>，按满 16 下自动算出你的按键延迟（耳机 / 声卡延迟 + 反应），之后打点会自动减掉它。`,

  // tapping, shifting
  'Bad time format: {0}': '时刻格式不对：{0}',
  'The first mora of a line needs an onset time of its own; it can\'t be tied': '每句的第一拍需要一个起音时刻，不能设为连唱',
  'Mora {0} is earlier than the one before it — fix that first': '第 {0} 拍的时刻早于前一拍，先改一下',
  'The line end is earlier than the last mora': '句末早于最后一拍',
  'Enter a number of seconds greater than 0 in the “Shift” box first': '先在「平移」框里填一个大于 0 的秒数',
  'At most 10 seconds per shift': '一次最多平移 10 秒',
  'Line {0} would start before 0 s; nothing was moved': '第 {0} 句移动后会早于 0 秒，没有移动',
  'it overlaps the end of line {0}': '和第 {0} 句的句末重叠',
  'its end runs past the start of line {0}': '句末超过了第 {0} 句的开头',
  ', @@between clauses': '，',
  ', @@in a list': '、',
  ': ': '：',
  'Line {0} moved {1} s earlier': '第 {0} 句整体前移 {1} 秒',
  'Line {0} moved {1} s later': '第 {0} 句整体后移 {1} 秒',
  '　Note: {0}': '　注意：{0}',
  'Move all {0} lines {1} s earlier? (Ctrl+Z undoes it)': '把全部 {0} 句整体前移 {1} 秒？（可以 Ctrl+Z 撤销）',
  'Move all {0} lines {1} s later? (Ctrl+Z undoes it)': '把全部 {0} 句整体后移 {1} 秒？（可以 Ctrl+Z 撤销）',
  'All {0} lines moved {1} s earlier. Takes effect once saved (Ctrl+S)': '全部 {0} 句已整体前移 {1} 秒。保存后生效（Ctrl+S）',
  'All {0} lines moved {1} s later. Takes effect once saved (Ctrl+S)': '全部 {0} 句已整体后移 {1} 秒。保存后生效（Ctrl+S）',

  // editing text / readings
  'Edit text and readings': '改句子和读音',
  'Edit text and readings · line {0}': '改句子和读音 · 第 {0} 句',
  'Add a line after line {0}': '在第 {0} 句后面加一句',
  'Text (just type; a space = phrase break — phrases can be laid out separately on screen)': '句子（直接打字；空格 = 短句分界，各短句在画面里可以分开排）',
  'Readings (kana under each kanji; kana themselves rarely need touching. When two or more characters share one reading — 今日 read きょう — click “join” to connect them)':
    '读音（汉字下面填假名；假名一般不用动。两个以上的字共用一个读音——比如「今日」读「きょう」——点「并」连起来）',
  'Share one reading with the character to the right': '和右边的字共用一个读音',
  'join': '并',
  'Back to one reading per character': '拆回一个字一个读音',
  'split': '拆',
  'Type the text above first': '先在上面输入句子',
  'The line is empty': '句子是空的',
  '{0} reading{0:|s} still missing or not kana: {1}': '还有 {0} 处读音没填，或者不是假名：{1}',
  'A line can\'t start with a small kana, a sokuon (っ) or a long-vowel mark (ー)': '句子不能以小写假名、促音或长音开头',
  '{0} {0:mora|morae}': '{0} 拍',
  ' (was {0}): ': '（原来 {0} 拍）：',
  'The morae are unchanged; every time is kept.': '拍没有变，时刻全部保留。',
  'Times kept for {0} {0:mora|morae}; the other {1} {1:is|are} spread evenly between the neighbours and marked “?”. The line goes back to “estimated” — tap it again after applying.':
    '保留 {0} 个拍的时刻；其余 {1} 个拍先按前后均分、标成「?」，这一句变回「推定」，应用后重新打一下。',
  'The new line goes into the gap after line {0} with evenly spread times; tap it after applying.': '新句子先放在第 {0} 句后面的空当里，时刻是均分的，应用后打点。',
  'Added. The next line follows right away, so the new line overlaps it for now — move it apart when you tap it': '加好了。后面紧跟着下一句，新句子暂时和它叠在一起——打点时挪开',
  'Added with evenly spread times — tap it': '加好了，时刻是均分的，打一下点',

  // merge / split / delete, renumbering
  'This is the last line; there is nothing after it to merge with': '这是最后一句，后面没有可以合并的',
  'Line {0} was merged with the next one (which became its last phrase)': '第 {0} 句和下一句合并了（原来的下一句成了它的最后一个短句）',
  'First click the mora that should start the new line (not the first mora, not the line end)': '先点一下要成为新句子第一拍的那个拍（不能是第一拍或句末）',
  'This mora is in the middle of a character\'s reading, so the line can\'t be split here. Pick the first mora of a character': '这一拍在一个字的读音中间，不能从这里拆。选一个字的第一拍',
  'Split into lines {0} and {1}. The end of the first one is a guess — listen to it': '拆成了第 {0} 句和第 {1} 句。前一句的句末是估的，听一下',
  'Only one line is left; it can\'t be deleted': '只剩一句了，不能删',
  'Delete line {0}?': '删除第 {0} 句？',
  '(Ctrl+Z undoes it)': '（可以 Ctrl+Z 撤销）',
  'The number of lines went from {0} to {1}; the lines after the change have new numbers': '句数从 {0} 变成了 {1}，后面句子的编号都变了',
  'old line {0} was deleted': '原第 {0} 句删掉了',
  'line {0} is new': '第 {0} 句是新加的',
  'old lines {0} were re-divided into lines {1}': '原第 {0} 句重新分成了第 {1} 句',
  'old line {0} was split into lines {1}': '原第 {0} 句拆成了第 {1} 句',
  'old lines {0} were merged into line {1}': '原第 {0} 句合并成第 {1} 句',
  'old {0} → now {1}': '原第 {0} 句 → 第 {1} 句',
  'Line numbers have changed:': '句子的编号变了：',
  'Everything in the storyboard (js/scenes.js of the current version) that refers to a line by its number — LT(n), li: n and the like — has to be changed to match, or lyrics will end up on the wrong shots.':
    '分镜（当前版本的 js/scenes.js）里按句号写的地方——LT(句号)、li: 句号 之类——要跟着改，不然歌词会对到别的镜头上。',
  'Save anyway?': '继续保存？',
  'Saved; the video\'s lyrics were regenerated': '已保存，MV 的歌词已重新生成',
  'Remember to update the line numbers in the storyboard': '记得改分镜里的句号',
  'Save failed: {0}': '保存失败：{0}',
  '(this page has to be opened through python tools/serve.py)': '（需要用 python tools/serve.py 打开本页）',

  // the list, the current line
  '{0} / {1} lines confirmed': '已确认 {0} / {1} 句',
  'was {0}': '原{0}',
  'new': '新',
  'has uncertain morae': '有不确定',
  'Line {0}': '第 {0} 句',
  'speed {0}×': '速度 {0}×',
  'latency compensation {0} ms': '延迟补偿 {0} ms',

  // latency calibration, start-up
  'Current compensation: {0} ms': '当前补偿 {0} ms',
  'Your presses are {0} ms late on average; that is now the latency compensation': '你的按键平均晚 {0} ms，已设为延迟补偿',
  'Your presses are {0} ms early on average; that is now the latency compensation': '你的按键平均早 {0} ms，已设为延迟补偿',
  'lyrics/timing.txt does not exist yet (run python lyric-tool/lyrics.py to generate it)': '还没有 lyrics/timing.txt（先运行 python lyric-tool/lyrics.py 生成）',
  'This browser holds a draft that was never saved to the project ({0}). After restoring it, press Ctrl+S to save it to the project.':
    '浏览器里有一份没保存到项目的草稿（{0}）。恢复后按 Ctrl+S 保存到项目。',
  'Discard this draft? It can\'t be brought back.': '丢弃这份草稿？丢弃后不能恢复。',
  'Could not read the timeline: {0}': '读取时间轴失败：{0}',
  'Run python tools/serve.py, then open http://127.0.0.1:8600/lyric-tool/': '请运行 python tools/serve.py，然后打开 http://127.0.0.1:8600/lyric-tool/',
});
