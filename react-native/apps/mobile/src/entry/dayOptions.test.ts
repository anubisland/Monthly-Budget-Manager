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
