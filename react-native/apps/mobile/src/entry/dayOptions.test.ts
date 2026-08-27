import { currentMonthKey } from '@monthly-budget/shared';
import { daysInMonth, dayShortcuts } from './dayOptions';

const AUG_26 = new Date(2026, 7, 26);
const AUG_1 = new Date(2026, 7, 1);

describe('daysInMonth', () => {
  it('knows the length of a 31-day month', () => {
    expect(daysInMonth('2026-08')).toBe(31);
  });

  it('knows the length of a 30-day month', () => {
    expect(daysInMonth('2026-04')).toBe(30);
  });

  it('knows February in a common year', () => {
    expect(daysInMonth('2026-02')).toBe(28);
  });

  it('knows February in a leap year', () => {
    expect(daysInMonth('2024-02')).toBe(29);
  });

  it('knows February in a century year that is not a leap year', () => {
    expect(daysInMonth('1900-02')).toBe(28);
  });

  it('knows February in a century year that is a leap year', () => {
    expect(daysInMonth('2000-02')).toBe(29);
  });

  it('falls back to 31 for a malformed key rather than throwing', () => {
    // 31 never excludes a real day, so the grid stays usable.
    expect(daysInMonth('nonsense')).toBe(31);
  });
});

describe('dayShortcuts in the current month', () => {
  it('offers today', () => {
    const keys = dayShortcuts('2026-08', AUG_26).map((s) => s.key);
    expect(keys).toContain('today');
  });

  it('points today at the real day', () => {
    const today = dayShortcuts('2026-08', AUG_26).find((s) => s.key === 'today');
    expect(today!.day).toBe(26);
  });

  it('offers yesterday', () => {
    const y = dayShortcuts('2026-08', AUG_26).find((s) => s.key === 'yesterday');
    expect(y!.day).toBe(25);
  });

  it('omits yesterday on the first of the month, since it is in another month', () => {
    const keys = dayShortcuts('2026-08', AUG_1).map((s) => s.key);
    expect(keys).not.toContain('yesterday');
    expect(keys).toContain('today');
  });

  it('offers the first and last of the month', () => {
    const s = dayShortcuts('2026-08', AUG_26);
    expect(s.find((x) => x.key === 'firstOfMonth')!.day).toBe(1);
    expect(s.find((x) => x.key === 'lastOfMonth')!.day).toBe(31);
  });

  it('never offers the same day twice', () => {
    for (const today of [AUG_1, new Date(2026, 7, 31), AUG_26]) {
      const days = dayShortcuts('2026-08', today).map((s) => s.day);
      expect(new Set(days).size).toBe(days.length);
    }
  });
});

describe('dayShortcuts in another month', () => {
  it('does not offer today, which is not in the month being filled in', () => {
    const keys = dayShortcuts('2026-03', AUG_26).map((s) => s.key);
    expect(keys).not.toContain('today');
    expect(keys).not.toContain('yesterday');
  });

  it('still offers the first and last of that month', () => {
    const s = dayShortcuts('2026-03', AUG_26);
    expect(s.find((x) => x.key === 'firstOfMonth')!.day).toBe(1);
    expect(s.find((x) => x.key === 'lastOfMonth')!.day).toBe(31);
  });

  it('gets the last day right for a short month', () => {
    expect(dayShortcuts('2026-02', AUG_26).find((x) => x.key === 'lastOfMonth')!.day).toBe(28);
  });

  it('never offers a day beyond the length of the month', () => {
    for (const key of ['2026-02', '2026-04', '2024-02']) {
      const max = daysInMonth(key);
      for (const s of dayShortcuts(key, AUG_26)) {
        expect(s.day).toBeLessThanOrEqual(max);
        expect(s.day).toBeGreaterThanOrEqual(1);
      }
    }
  });
});

// The regex accepts any two digits, so '2026-13' and '2026-00' reach the
// range guard rather than the malformed-key branch. Without the guard,
// new Date(2026, 13, 0) would silently roll into the next year and report a
// day count for the wrong month.
describe('a month number outside 1..12', () => {
  it.each(['2026-00', '2026-13', '2026-99'])('falls back to 31 for %s', (key) => {
    expect(daysInMonth(key)).toBe(31);
  });

  it('still offers usable shortcuts rather than a dead end', () => {
    const s = dayShortcuts('2026-13', AUG_26);
    expect(s.length).toBeGreaterThan(0);
    expect(s.map((x) => x.key)).toContain('firstOfMonth');
    expect(s.map((x) => x.key)).toContain('lastOfMonth');
  });
});

// Every other test injects a date, per the project's determinism rule, leaving
// the real-clock default unexercised. These hold whenever the suite runs: they
// compare against the same clock the function uses rather than pinning a value.
describe('the real-clock default', () => {
  it('offers today for the real current month', () => {
    const keys = dayShortcuts(currentMonthKey()).map((s) => s.key);
    expect(keys).toContain('today');
  });

  it('does not offer today for a month that is not the current one', () => {
    expect(dayShortcuts('1999-05').map((s) => s.key)).not.toContain('today');
  });

  it('never offers a day outside the month, whatever today is', () => {
    const key = currentMonthKey();
    const max = daysInMonth(key);
    for (const s of dayShortcuts(key)) {
      expect(s.day).toBeGreaterThanOrEqual(1);
      expect(s.day).toBeLessThanOrEqual(max);
    }
  });
});
