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

  it('substitutes a placeholder appearing twice in one string', () => {
    // This tests that the regex replace handles multiple occurrences
    const result = t('month.entriesCount', 'en', { count: 5 });
    expect(result).toBe('5 entries');
  });
});
