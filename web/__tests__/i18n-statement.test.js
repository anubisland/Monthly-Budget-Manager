/**
 * The statement import has to read the same in both languages. A missing
 * Arabic string falls back to the English one silently, which is how a
 * half-translated panel ships.
 */

require('../i18n.js');

const i18n = window.i18n;

const KEYS = [
  'toolbar.importStatement',
  'st.title', 'st.hint', 'st.label', 'st.close', 'st.previewBtn',
  'st.pasteFirst', 'st.previewFirst', 'st.monthChanged', 'st.heading',
  'st.col.date', 'st.col.name', 'st.col.amount', 'st.col.note', 'st.dup',
  'st.month', 'st.counts', 'st.more', 'st.includeDups', 'st.confirm',
  'st.cancel', 'st.done', 'st.unreadable',
  'st.reason.empty', 'st.reason.tooManyRows', 'st.reason.noDescription',
  'st.reason.noAmount', 'st.reason.unknown',
];

const PARAMS = {
  read: 3, add: 2, dup: 1, skip: 0, month: '2026-08', n: 4, s: 1, why: 'x',
};

function inLang(lang, read) {
  i18n.setLanguage(lang);
  return read();
}

describe('statement import copy', () => {
  afterEach(() => i18n.setLanguage('en'));

  test.each(KEYS)('%s is written in both languages', (key) => {
    const en = inLang('en', () => i18n.t(key));
    const ar = inLang('ar', () => i18n.t(key));

    expect(en).not.toBe(key);
    expect(ar).not.toBe(key);
    expect(ar).not.toBe(en);
  });

  test.each(KEYS)('%s interpolates every placeholder in both languages', (key) => {
    ['en', 'ar'].forEach((lang) => {
      const text = inLang(lang, () => i18n.t(key, PARAMS));
      expect(text).not.toMatch(/\{\w+\}/);
    });
  });
});
