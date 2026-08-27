import { t, isRTL, dirOf } from './index';
import { en } from './en';
import { ar } from './ar';

describe('translation completeness', () => {
  it('has an Arabic string for every English key', () => {
    expect(Object.keys(ar).sort()).toEqual(Object.keys(en).sort());
  });

  it('has no empty strings in either language', () => {
    for (const v of Object.values({ ...en })) expect(v.length).toBeGreaterThan(0);
    for (const v of Object.values({ ...ar })) expect(v.length).toBeGreaterThan(0);
  });

  it('does not leave any Arabic value identical to its English one', () => {
    // Catches a placeholder that was copied and never translated.
    const untranslated = Object.keys(en).filter(
      (k) => ar[k as keyof typeof ar] === en[k as keyof typeof en],
    );
    expect(untranslated).toEqual([]);
  });
});

describe('t', () => {
  it('returns the string for the requested locale', () => {
    expect(t('app.title', 'en')).toBe(en['app.title']);
    expect(t('app.title', 'ar')).toBe(ar['app.title']);
  });

  it('substitutes named parameters', () => {
    expect(t('month.entriesCount', 'en', { count: 3 })).toContain('3');
    expect(t('month.entriesCount', 'ar', { count: 3 })).toContain('3');
  });

  it('leaves an unmatched placeholder visible rather than silently blanking it', () => {
    // A blank is invisible in the UI; a visible token gets reported as a bug.
    expect(t('month.entriesCount', 'en', {})).toContain('{count}');
  });
});

describe('direction', () => {
  it('marks Arabic as RTL and English as LTR', () => {
    expect(isRTL('ar')).toBe(true);
    expect(isRTL('en')).toBe(false);
    expect(dirOf('ar')).toBe('rtl');
    expect(dirOf('en')).toBe('ltr');
  });
});

describe('t - mutation and state safety', () => {
  it('does not mutate or share state between calls', () => {
    const result1 = t('month.entriesCount', 'en', { count: 1 });
    const result2 = t('month.entriesCount', 'en', { count: 2 });
    expect(result1).toBe('1 entries');
    expect(result2).toBe('2 entries');
  });

  // Previously this used 'month.entriesCount', which holds ONE placeholder --
  // so it could not reach the multi-occurrence path it was named for. Dropping
  // the /g flag would have left every real multi-placeholder string half
  // substituted with the whole suite green.
  it('substitutes every placeholder in a string that has more than one', () => {
    const s = t('compare.heading', 'en', { current: 'August 2026', previous: 'July 2026' });
    expect(s).toBe('August 2026 vs July 2026');
    expect(s).not.toMatch(/\{\w+\}/);
  });

  it('substitutes the same placeholder wherever it appears, in both languages', () => {
    for (const locale of ['en', 'ar'] as const) {
      const s = t('compare.heading', locale, { current: 'A', previous: 'B' });
      expect(s).not.toMatch(/\{\w+\}/);
      expect(s).toContain('A');
      expect(s).toContain('B');
    }
  });

  it('leaves only the unmatched placeholder when one param is missing', () => {
    const s = t('compare.heading', 'en', { current: 'A' });
    expect(s).toContain('A');
    expect(s).toContain('{previous}');
  });
});
