'use strict';
/* The storyboard: this file is the content of the video. What follows is a minimal demo (24 seconds in the empty template):
 * one shot with lyrics appearing on their per-mora timing, one shot with an image placeholder. Replace all of it when you make
 * a real version. It is deliberately plain and is not a style to follow: the look of a work is that work's own decision.
 *
 * Each entry in SEG is one shot:
 *   t      start time (seconds). A shot lasts until the next one starts
 *   name   the shot's name (shown in the progress-bar tooltip and in the check tools' output)
 *   sec    if given, a section starts here: the progress bar gets a tick, and `key` is the shortcut that jumps to it
 *   cut    the transition in (described under "Transitions" in main.js; durations are in TD and can be overridden
 *          with td; col is the colour the transition uses):
 *            cut hard cut | iris / heart / plus open out from at: [x, y] (circle / heart / plus) | wipe / pill wipe across diagonally |
 *            push pushes the old shot out (dir: 'left' | 'right' | 'up' | 'down') | shutter | blink closes, then opens | zoom / fade cross-fade |
 *            punch hard cut + the picture drops slightly (z), col around the edges | flash the whole screen flashes
 *   draw(c, t, s)   draws the shot as it looks at time t. It may depend only on t — keep no state from the previous frame
 *   lyr    the lyrics / text in this shot (the lyric config in js/type.js): li = which line of the lyrics, or text = your own text
 *   over(c, t, s)   drawn on top of the lyrics
 *   shake  strength of the shake on drum hits (default 1, 0 = none)
 * Write times in terms of the lyrics and the beat rather than hard-coded seconds — when the timeline is corrected, the picture follows:
 *   LT(line, phrase) start of singing   LE singing ends   LL whole line over   LCT(line, nth character, phrase) that character is sung   BT(n) the nth beat
 *   LCUT(line) the nearest beat before the line starts (where the shot cuts)   CUT(t) the nearest beat before t   DOWN(t) the next bar line after t
 * Handy helpers: pop(t, t0, d) pop-in scale (0 → 1)   typeOn(c, text, x, y, t, t0, step, o) your own text popping in character by character
 *   CAP(line, o) lays a line of lyrics out as a one-line caption at the bottom and returns a config for lyr
 *   (combine it with your own style: Object.assign({ f, color… }, CAP(3)))
 */
const TITLE1 = 'Untitled', TITLE2 = 'Lyric video template';    // the title on the start screen
const EXTRA_TEXT = '';                                          // every character written directly with txt() goes here (fonts are fetched as subsets; a character left out has no glyph)
const DURATION_FALLBACK = 24;                                   // total length (seconds) while there is no audio analysis data yet
AU.barOff = 0;

// With lyrics, the image shot starts 1 s after line 0 is over; without lyrics it starts at 12 s
const T2 = LYR.length ? LL(0) + 1 : 12;

const SEG = [
  {
    // With lyric data (js/lyrics.js) this shows line 0, each character appearing at the moment it is sung; without it, `text` stands in
    t: 0, name: 'Lyric timing', sec: 'Lyrics', key: '1',
    draw(c, t) {
      fill(c, C.bg);
      txt(c, `${t.toFixed(2)} s · beat ${Math.max(0, Math.floor(AU.beat(t)))}`, W / 2, H - 80, { f: 'goth', w: 500, size: 28, color: C.mid });
    },
    lyr: [
      LYR.length
        ? { li: 0, y: H / 2, size: 96, f: 'goth', color: C.fg, anim: 'type', out: 'fade', bounce: 0 }
        : { text: ['Each character appears', 'at the moment it is sung'], t0: [1, 4], step: .08, y: H / 2, size: 96, f: 'goth', color: C.fg, anim: 'type', tOut: T2 - .5, out: 'fade', always: true, bounce: 0 },
    ],
  },
  {
    t: T2, name: 'Image placeholder', sec: 'Image', key: '2',
    draw(c) {
      fill(c, C.bg);
      card(c, 'demo', W / 2, H / 2 - 50, 720, 720 * 9 / 16);    // key 'demo' has no image, so the numbered placeholder is drawn
    },
    lyr: [{ text: 'Images are referred to by key; images.json maps keys to files', t0: T2 + .5, step: .03, y: H - 150, size: 40, f: 'goth', color: C.dark, anim: 'type', tOut: T2 + 11.5, out: 'fade', always: true, bounce: 0 }],
  },
];
