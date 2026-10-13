'use strict';
/* The storyboard: this file is the content of the video. What follows is a demo (24 seconds in the empty template)
 * showing a few of the engine's features; replace all of it when you make a real version.
 *
 * Each entry in SEG is one shot:
 *   t      start time (seconds). A shot lasts until the next one starts
 *   name   the shot's name (shown in the progress-bar tooltip and in the check tools' output)
 *   sec    if given, a section starts here: the progress bar gets a tick, and `key` is the shortcut that jumps to it
 *   cut    the transition in (described under "Transitions" in main.js; durations are in TD and can be overridden
 *          with td; col is the colour the transition uses):
 *            cut hard cut | iris / heart / plus open out from at: [x, y] (circle / heart / plus) | wipe / pill wipe across diagonally |
 *            push pushes the old shot out (dir: 'left' | 'right' | 'up' | 'down') | shutter | blink closes, then opens | zoom / fade cross-fade |
 *            punch hard cut + the picture drops slightly (z), col around the edges | flash the whole screen flashes (harsh; avoid)
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
const TITLE1 = 'OPUS VIDEO', TITLE2 = 'Web video template';     // the title on the start screen
const EXTRA_TEXT = '';                                          // every character written directly with txt() goes here (fonts are fetched as subsets; a character left out has no glyph)
const DURATION_FALLBACK = 24;                                   // total length (seconds) while there is no audio analysis data yet
AU.barOff = 0;

// Shot times for the demo: with lyrics they follow line 0 (cut in 1 s before it starts, cut away 1 s after it is over);
// without lyrics they are fixed at 6 / 12 / 18 s
const T2 = LYR.length ? Math.max(6, LT(0) - 1) : 6, T3 = LYR.length ? LL(0) + 1 : 12, T4 = T3 + 6;

// The background the demo reuses: paper + a ring that pulses with the beat
function demoBack(c, t, col) {
  fill(c, C.paper); paper(c);
  halftone(c, 0, H * .55, W, H * .45, rgba(col, .35), 26, 0, 9);
  const p = AU.pulse(t, 1, 0, 6);
  ring(c, W / 2, H / 2, 300 + p * 26, 10 + p * 10, col, .9);
  ring(c, W / 2, H / 2, 380 + AU.bar(t) * 40, 3, C.ink, .5);
}

const SEG = [
  {
    t: 0, name: 'Title', sec: 'Title', key: '1',
    draw(c, t) {
      demoBack(c, t, C.red);
      txt(c, `${(60 / AU.P).toFixed(0)} BPM · beat ${Math.max(0, Math.floor(AU.beat(t)))}`, W / 2, H - 90, { f: 'goth', size: 30, color: rgba(C.ink, .6) });
    },
    lyr: [
      { text: TITLE1, t0: .5, step: .09, y: H / 2 - 50, size: 150, f: 'dela', color: C.ink, sh: C.red, anim: 'stamp', tOut: 5.5, out: 'scatter', always: true },
      { text: TITLE2, t0: 1.8, step: .05, y: H / 2 + 110, size: 64, f: 'goth', color: C.red, anim: 'rise', tOut: 5.5, out: 'fade', always: true },
    ],
  },
  {
    // With lyric data (js/lyrics.js) this shows line 0, character by character on the per-mora timeline; without it, `text` stands in
    t: T2, name: 'Lyrics', sec: 'Lyrics', key: '2', cut: 'wipe', col: C.blue,
    draw(c, t) { demoBack(c, t, C.blue); },
    lyr: [
      LYR.length
        ? { li: 0, y: H / 2, size: 110, f: 'min', color: C.ink, hl: C.red, anim: 'pop' }
        : { text: ['Each character appears', 'the moment it is sung'], t0: [6.6, 8.8], step: .08, y: H / 2, size: 110, f: 'min', color: C.ink, hl: C.red, anim: 'pop', tOut: 11.5, out: 'up' },
    ],
  },
  {
    t: T3, name: 'Image cards', sec: 'Images', key: '3', cut: 'iris', col: C.amber,
    draw(c, t, s) {
      fill(c, C.navy); starfield(c, t, 3, 160, { a: .7 });
      const k = i => pop(t, s.t + .3 + i * .25, .6);                               // the three cards pop in one after another
      card(c, 'demo_a', W * .22, H * .5, 420, 520, { shape: 'rect', rot: -.06, scale: k(0), border: 14, shadow: rgba('#000000', .35) });
      card(c, 'demo_b', W * .5, H * .47, 420, 420, { shape: 'polaroid', rot: .03, scale: k(1), shadow: rgba('#000000', .35), label: 'polaroid' });
      card(c, 'demo_c', W * .78, H * .5, 440, 440, { shape: 'circle', scale: k(2) * (1 + AU.pulse(t, 2, 0, 5) * .04), line: C.amber, lw: 10 });
    },
    lyr: [{ text: 'Images live in data/img, their numbers in images.json', t0: T3 + 1.6, step: .04, y: H - 110, size: 44, f: 'goth', color: C.cream, anim: 'rise', tOut: T4 - .6, out: 'fade', always: true }],
  },
  {
    t: T4, name: 'Ending', sec: 'Ending', key: '4', cut: 'push', col: C.cream,
    draw(c, t, s) {
      vgrad(c, [C.night, C.indigo]);
      starfield(c, t, 7, 260, { reveal: prog(t, s.t, s.t + 2.5) });
      rays(c, W / 2, H * 1.1, 14, 200, 1500, t * .05, rgba(C.amber, .08));
      vignette(c, .5);
    },
    lyr: [{ text: 'Start your version here', t0: T4 + .8, step: .06, y: H / 2, size: 96, f: 'min', color: C.cream, hl: C.amber, anim: 'drop', tOut: T4 + 5.4, out: 'fade', always: true }],
  },
];
