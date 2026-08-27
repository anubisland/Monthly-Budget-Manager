// Pinning a west-of-Greenwich regression: new Date('YYYY-MM-DD') parses as
// UTC midnight, and .getDate()/.getDay() read it back in local time, so the
// displayed day silently shifts back by one in any negative-offset zone.
// Setting TZ here, before the module under test is imported, is what makes
// that regression reproducible in CI regardless of the runner's own zone.
declare const process: { env: Record<string, string | undefined> };
process.env.TZ = 'America/Los_Angeles';

import { getDayOfMonth, formatDateDisplay, dateForDay } from './dateDisplay';

describe('getDayOfMonth', () => {
  it('reads the day out of a YYYY-MM-DD string', () => {
    expect(getDayOfMonth('2026-08-01')).toBe(1);
    expect(getDayOfMonth('2026-08-31')).toBe(31);
  });

  it('is correct in America/Los_Angeles specifically -- the regression this pins', () => {
    // Under the old new Date(dateStr) implementation this returned 31 and 30
    // respectively in America/Los_Angeles, because the string parses as UTC
    // midnight and getDate() reads it back eight hours earlier, local time.
    expect(process.env.TZ).toBe('America/Los_Angeles');
    expect(getDayOfMonth('2026-08-01')).toBe(1);
    expect(getDayOfMonth('2026-08-31')).toBe(31);
  });

  it('falls back to 1 for a malformed date rather than NaN', () => {
    expect(getDayOfMonth('not-a-date')).toBe(1);
  });

  it('rejects a full date with an out-of-range month or day', () => {
    expect(getDayOfMonth('2026-13-01')).toBe(1);
    expect(getDayOfMonth('2026-01-32')).toBe(1);
  });

  it('rejects a month-only date with an out-of-range month', () => {
    expect(getDayOfMonth('2026-13')).toBe(1);
  });
});

describe('formatDateDisplay', () => {
  it('gives the right day and weekday name for a known date', () => {
    // 2026-08-01 is a Saturday.
    expect(formatDateDisplay('2026-08-01', 'en')).toBe('1 (Sat)');
  });

  it('handles a month-only date without producing NaN or throwing', () => {
    expect(() => formatDateDisplay('2026-08', 'en')).not.toThrow();
    const result = formatDateDisplay('2026-08', 'en');
    expect(result).not.toMatch(/NaN/);
  });

  it('handles a malformed date without producing NaN or throwing', () => {
    expect(() => formatDateDisplay('not-a-date', 'en')).not.toThrow();
    const result = formatDateDisplay('not-a-date', 'en');
    expect(result).not.toMatch(/NaN/);
  });

  it('returns an empty string for an empty date', () => {
    expect(formatDateDisplay('', 'en')).toBe('');
  });
});

describe('dateForDay', () => {
  it('composes a full YYYY-MM-DD date from a month key and a day', () => {
    expect(dateForDay('2026-08', 1)).toBe('2026-08-01');
    expect(dateForDay('2026-08', 31)).toBe('2026-08-31');
  });
});
