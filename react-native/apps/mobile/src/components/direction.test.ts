import { rowDirection, textAlign, writingDirection, isRTLLocale } from './direction';

describe('direction from locale', () => {
  it('lays Arabic rows out from the right', () => {
    expect(rowDirection('ar')).toBe('row-reverse');
    expect(rowDirection('en')).toBe('row');
  });

  it('aligns Arabic text to the right', () => {
    expect(textAlign('ar')).toBe('right');
    expect(textAlign('en')).toBe('left');
  });

  it('reports the writing direction for text nodes', () => {
    expect(writingDirection('ar')).toBe('rtl');
    expect(writingDirection('en')).toBe('ltr');
  });

  it('identifies which locales are right-to-left', () => {
    expect(isRTLLocale('ar')).toBe(true);
    expect(isRTLLocale('en')).toBe(false);
  });

  it('is consistent across the four helpers', () => {
    for (const locale of ['ar', 'en'] as const) {
      const rtl = isRTLLocale(locale);
      expect(rowDirection(locale)).toBe(rtl ? 'row-reverse' : 'row');
      expect(textAlign(locale)).toBe(rtl ? 'right' : 'left');
      expect(writingDirection(locale)).toBe(rtl ? 'rtl' : 'ltr');
    }
  });
});
