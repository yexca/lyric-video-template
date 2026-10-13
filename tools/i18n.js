'use strict';
/* Minimal i18n for the tool pages (versions.html, lyric-tool/, pic-tool/) and the video page's player (template/,
 * copied into every version).
 *
 * English is the source language. The pages are written in English, and the English text is also the lookup key;
 * every other language is a dictionary loaded after this file:
 *     <script src="../tools/i18n.js"></script>
 *     <script src="lang.zh-cn.js"></script>      // I18N.add('zh-cn', '简体中文', { 'Saved': '已保存', … })
 *
 *   tr('Saved')                      Look the text up in the current language's dictionary. In English, or when the
 *                                    dictionary has no entry, the text itself is used (a missing entry warns once in the console).
 *   tr('Line {0}', n)                {0} {1} … are replaced by the arguments that follow.
 *   tr('{0} image{0:|s}', n)         {i:one|many} picks by whether argument i is 1 — for English plurals. A translation
 *                                    that doesn't need it just writes {0}. An entry may also be a function of the arguments.
 *   tr(', @@in a list')              One English text with two meanings: say which after @@. It is never displayed.
 *   <button data-i18n>Save</button>              Translates the element's text (the element must contain nothing but text —
 *                                                otherwise wrap the text in its own span).
 *   <input data-i18n="placeholder title">        Translates these attributes; "text title" does the text as well.
 *   <div data-i18n-html="help">…</div>           Replaces the whole block with the dictionary's `help` entry (HTML).
 *   <select data-i18n-lang></select>             The language switch. The choice is kept in localStorage (shared by the
 *                                                tool pages) and the page reloads.
 *
 * Which language: ?lang=zh-cn in the address (remembered, then removed from the address) > the last choice >
 * the browser's preferred languages > English. A code matches a language with the same primary tag (zh → zh-cn).
 * Adding a language = one lang.<code>.js per page and one <script> line; the pages themselves don't change.
 * Text that comes back from the server (what pic.py / lyrics.py print) is not translated: it is always English. */
const I18N = (() => {
  const SRC = 'en', KEY = 'ui-lang', names = { [SRC]: 'English' }, dicts = {}, warned = new Set();
  let lang = null;
  const resolve = code => {
    if (!code) return null;
    const c = String(code).toLowerCase(), all = Object.keys(names);
    return all.find(k => k === c) || all.find(k => k.split('-')[0] === c.split('-')[0]) || null;
  };
  const store = v => { try { if (v === undefined) return localStorage.getItem(KEY); localStorage.setItem(KEY, v); } catch {} return null; };
  function pick() {
    const url = new URL(location.href), asked = url.searchParams.get('lang');
    if (asked != null) {                      // ?lang= counts once: remember it and drop it from the address
      url.searchParams.delete('lang');
      history.replaceState(history.state, '', url.pathname + url.search + url.hash);
      if (resolve(asked)) { store(resolve(asked)); return resolve(asked); }
    }
    if (resolve(store())) return resolve(store());
    for (const l of navigator.languages || [navigator.language]) if (resolve(l)) return resolve(l);
    return SRC;
  }
  const current = () => lang || (lang = pick());
  const fill = (d, a) => d.replace(/\{(\d)(?::([^|}]*)\|([^}]*))?\}/g, (m, i, one, many) => (!(i in a) ? m : one === undefined ? a[i] : a[i] === 1 ? one : many));
  function t(s, ...a) {
    let d = current() === SRC ? null : dicts[lang][s];
    if (d == null) {
      if (lang !== SRC && !warned.has(s)) { warned.add(s); console.warn(`[i18n] no ${lang} entry for: ${s}`); }
      d = s.replace(/@@.*$/s, '');
    }
    return typeof d === 'function' ? d(...a) : a.length ? fill(d, a) : d;
  }
  function apply(root = document) {
    const l = current();
    document.documentElement.lang = l;
    for (const sel of root.querySelectorAll('select[data-i18n-lang]')) {
      sel.innerHTML = Object.keys(names).map(k => `<option value="${k}">${names[k]}</option>`).join('');
      sel.value = l;
      sel.onchange = () => { store(sel.value); sel.value = l; location.reload(); };      // if the page blocks the reload (unsaved changes), the switch still shows the language in use
    }
    if (l === SRC) return;
    for (const el of root.querySelectorAll('[data-i18n]'))
      for (const what of (el.dataset.i18n || 'text').split(/\s+/)) {
        if (what === 'text') el.textContent = t(el.textContent.trim());
        else if (el.hasAttribute(what)) el.setAttribute(what, t(el.getAttribute(what)));
      }
    for (const el of root.querySelectorAll('[data-i18n-html]')) { const d = dicts[l][el.dataset.i18nHtml]; if (d != null) el.innerHTML = d; else t(el.dataset.i18nHtml); }
  }
  return { t, apply, add(code, name, dict) { names[code] = name; dicts[code] = dict; }, get lang() { return current(); } };
})();
const tr = I18N.t;
