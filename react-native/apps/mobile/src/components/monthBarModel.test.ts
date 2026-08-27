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
