import { currentMonthKey, prevKey } from '@monthly-budget/shared';
import { monthBarModel } from './monthBarModel';

const TODAY = new Date(2026, 7, 26); // 2026-08

describe('monthBarModel', () => {
  it('labels the displayed month in the chosen locale', () => {
    expect(monthBarModel('2026-08', 'en', TODAY).label).toBe('August 2026');
    expect(monthBarModel('2026-08', 'ar', TODAY).label).toBe('أغسطس 2026');
  });

  it('knows when the displayed month is the current one', () => {
    expect(monthBarModel('2026-08', 'en', TODAY).isCurrent).toBe(true);
    expect(monthBarModel('2026-07', 'en', TODAY).isCurrent).toBe(false);
  });

  it('disables forward navigation at the current month', () => {
    expect(monthBarModel('2026-08', 'en', TODAY).canGoNext).toBe(false);
  });

  it('enables forward navigation in the past', () => {
    expect(monthBarModel('2026-05', 'en', TODAY).canGoNext).toBe(true);
  });

  it('always allows going back', () => {
    expect(monthBarModel('2026-08', 'en', TODAY).canGoPrev).toBe(true);
    expect(monthBarModel('2020-01', 'en', TODAY).canGoPrev).toBe(true);
  });

  it('labels the adjacent months, so a control can name where it goes', () => {
    const m = monthBarModel('2026-07', 'en', TODAY);
    expect(m.prevLabel).toBe('June 2026');
    expect(m.nextLabel).toBe('August 2026');
  });

  it('names the adjacent months across a year boundary', () => {
    const m = monthBarModel('2026-01', 'en', TODAY);
    expect(m.prevLabel).toBe('December 2025');
    expect(m.nextLabel).toBe('February 2026');
  });

  it('still names the next month even when moving there is disabled', () => {
    // The label is for a screen reader; the disabled flag governs the tap.
    const m = monthBarModel('2026-08', 'en', TODAY);
    expect(m.canGoNext).toBe(false);
    expect(m.nextLabel).toBe('September 2026');
  });
});

// Every other test injects a date, per the project's determinism rule, which
// leaves the real-clock default parameter unexercised. These assertions hold
// whenever the suite runs: they compare the model against the same clock it
// uses, rather than pinning a value that would rot.
describe('the real-clock default', () => {
  it('treats the real current month as current', () => {
    const m = monthBarModel(currentMonthKey(), 'en');
    expect(m.isCurrent).toBe(true);
    expect(m.canGoNext).toBe(false);
    expect(m.canGoPrev).toBe(true);
  });

  it('treats last month as not current, and lets you come forward from it', () => {
    const m = monthBarModel(prevKey(currentMonthKey()), 'en');
    expect(m.isCurrent).toBe(false);
    expect(m.canGoNext).toBe(true);
  });

  it('produces well-formed labels without an injected date', () => {
    const m = monthBarModel(currentMonthKey(), 'ar');
    for (const label of [m.label, m.prevLabel, m.nextLabel]) {
      expect(label).toMatch(/\d{4}$/);
      expect(label.length).toBeGreaterThan(4);
    }
  });
});

// A device with a badly wrong clock, or a key that never came from monthKey().
describe('inputs that should not happen but might', () => {
  it('refuses to advance from a month already in the future', () => {
    const m = monthBarModel('2099-06', 'en', TODAY);
    expect(m.canGoNext).toBe(false);
    expect(m.isCurrent).toBe(false);
    expect(m.canGoPrev).toBe(true); // the way back out
  });

  it('does not throw on a malformed key, and echoes it in the label', () => {
    // monthLabel returns the raw key when it cannot parse it, and prevKey /
    // nextKey pass an invalid key through unchanged -- so the bar degrades to
    // showing something odd rather than crashing the screen.
    const m = monthBarModel('not-a-month', 'en', TODAY);
    expect(m.label).toBe('not-a-month');
    expect(typeof m.canGoNext).toBe('boolean');
  });
});
