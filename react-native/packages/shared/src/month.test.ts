import {
  isValidMonthKey,
  monthKey,
  currentMonthKey,
  prevKey,
  nextKey,
  isFutureKey,
  monthLabel,
  compareKeys,
} from './month';

describe('isValidMonthKey', () => {
  it('accepts a well-formed key', () => {
    expect(isValidMonthKey('2026-08')).toBe(true);
    expect(isValidMonthKey('2026-01')).toBe(true);
    expect(isValidMonthKey('2026-12')).toBe(true);
  });

  it('rejects malformed or out-of-range keys', () => {
    expect(isValidMonthKey('2026-13')).toBe(false);
    expect(isValidMonthKey('2026-00')).toBe(false);
    expect(isValidMonthKey('2026-8')).toBe(false);
    expect(isValidMonthKey('26-08')).toBe(false);
    expect(isValidMonthKey('2026/08')).toBe(false);
    expect(isValidMonthKey('')).toBe(false);
    expect(isValidMonthKey('2026-08-14')).toBe(false);
  });
});

describe('monthKey', () => {
  it('extracts the month from a full date', () => {
    expect(monthKey('2026-08-14')).toBe('2026-08');
  });

  it('passes through a month-only value', () => {
    expect(monthKey('2026-08')).toBe('2026-08');
  });

  it('returns null for invalid input', () => {
    expect(monthKey('not-a-date')).toBeNull();
    expect(monthKey('2026-13-01')).toBeNull();
    expect(monthKey('')).toBeNull();
  });

  // The day component is deliberately NOT validated -- it is not part of a
  // MonthKey. Documented here so a later module does not assume monthKey()
  // vetted the day. Validate day-of-month at the point of use instead.
  it('extracts the month without validating the day component', () => {
    expect(monthKey('2026-08-99')).toBe('2026-08');
    expect(monthKey('2026-08-00')).toBe('2026-08');
  });
});

describe('currentMonthKey', () => {
  it('derives the key from the injected date', () => {
    expect(currentMonthKey(new Date(2026, 7, 26))).toBe('2026-08');
  });

  it('zero-pads single-digit months', () => {
    expect(currentMonthKey(new Date(2026, 0, 5))).toBe('2026-01');
  });
});

// Every other test injects an explicit date, per the project's determinism
// rule, which leaves the real-clock default-parameter path unexercised. Assert only
// the SHAPE here -- never a specific value, which would make the suite
// depend on when it runs.
describe('the real-clock default path', () => {
  it('produces a well-formed key when no date is injected', () => {
    expect(currentMonthKey()).toMatch(/^\d{4}-\d{2}$/);
    expect(isValidMonthKey(currentMonthKey())).toBe(true);
  });

  it('reports the current month as not being in the future', () => {
    expect(isFutureKey(currentMonthKey())).toBe(false);
  });
});

describe('prevKey', () => {
  it('steps back within a year', () => {
    expect(prevKey('2026-08')).toBe('2026-07');
  });

  it('crosses the year boundary backwards', () => {
    expect(prevKey('2026-01')).toBe('2025-12');
  });
});

describe('nextKey', () => {
  it('steps forward within a year', () => {
    expect(nextKey('2026-08')).toBe('2026-09');
  });

  it('crosses the year boundary forwards', () => {
    expect(nextKey('2026-12')).toBe('2027-01');
  });
});

describe('prevKey and nextKey round-trip', () => {
  it('returns to the original key across year boundaries', () => {
    expect(nextKey(prevKey('2026-01'))).toBe('2026-01');
    expect(prevKey(nextKey('2026-12'))).toBe('2026-12');
  });
});

// The spec mandates pass-through, not throwing, on invalid input. Six later
// modules depend on this contract, so it is pinned here rather than left to
// inspection.
describe('prevKey and nextKey with invalid keys', () => {
  it('returns the input unchanged rather than throwing', () => {
    expect(prevKey('bad')).toBe('bad');
    expect(nextKey('bad')).toBe('bad');
    expect(prevKey('')).toBe('');
    expect(nextKey('')).toBe('');
    expect(prevKey('2026-13')).toBe('2026-13');
    expect(nextKey('2026-00')).toBe('2026-00');
  });
});

describe('isFutureKey', () => {
  const today = new Date(2026, 7, 26); // 2026-08

  it('is false for the current month', () => {
    expect(isFutureKey('2026-08', today)).toBe(false);
  });

  it('is false for a past month', () => {
    expect(isFutureKey('2026-07', today)).toBe(false);
    expect(isFutureKey('2025-12', today)).toBe(false);
  });

  it('is true for a future month', () => {
    expect(isFutureKey('2026-09', today)).toBe(true);
    expect(isFutureKey('2027-01', today)).toBe(true);
  });
});

describe('monthLabel', () => {
  it('labels in Arabic', () => {
    expect(monthLabel('2026-08', 'ar')).toBe('أغسطس 2026');
    expect(monthLabel('2026-01', 'ar')).toBe('يناير 2026');
  });

  it('labels in English', () => {
    expect(monthLabel('2026-08', 'en')).toBe('August 2026');
    expect(monthLabel('2026-01', 'en')).toBe('January 2026');
  });

  it('returns the raw key when it is invalid', () => {
    expect(monthLabel('nonsense', 'en')).toBe('nonsense');
  });
});

describe('compareKeys', () => {
  it('orders chronologically', () => {
    expect(compareKeys('2026-07', '2026-08')).toBeLessThan(0);
    expect(compareKeys('2026-08', '2026-07')).toBeGreaterThan(0);
    expect(compareKeys('2026-08', '2026-08')).toBe(0);
  });

  it('sorts a list chronologically across years', () => {
    const keys = ['2026-01', '2025-12', '2026-10', '2026-02'];
    expect([...keys].sort(compareKeys)).toEqual([
      '2025-12',
      '2026-01',
      '2026-02',
      '2026-10',
    ]);
  });
});
