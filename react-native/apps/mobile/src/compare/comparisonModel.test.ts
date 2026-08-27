import { deltaView, comparisonView } from './comparisonModel';
import { makeDelta, emptyStore, upsertEntry } from '@monthly-budget/shared';

describe('showPercent — when a percentage would mislead', () => {
  it('shows it for an ordinary change', () => {
    expect(deltaView(makeDelta(120, 100, 'income'), 'income').showPercent).toBe(true);
  });

  it('HIDES it when the previous value was negative', () => {
    // Going from a 50 loss to a 100 profit is an improvement, yet the
    // percentage computes to -300. Showing that would tell the user the
    // opposite of the truth.
    const v = deltaView(makeDelta(100, -50, 'net'), 'net');
    expect(v.showPercent).toBe(false);
    expect(v.absolute).toBe(150);
    expect(v.tone).toBe('good');
  });

  it('HIDES it when the previous value was zero', () => {
    const v = deltaView(makeDelta(300, 0, 'expenses'), 'expenses');
    expect(v.showPercent).toBe(false);
    expect(v.percent).toBeNull();
  });

  it('HIDES it for margin, which is measured in points', () => {
    const v = deltaView(makeDelta(25.2, 22.9, 'margin'), 'margin');
    expect(v.showPercent).toBe(false);
    expect(v.isPoints).toBe(true);
    expect(v.absolute).toBeCloseTo(2.3, 5);
  });

  it('marks only margin as points', () => {
    for (const m of ['income', 'expenses', 'net'] as const) {
      expect(deltaView(makeDelta(120, 100, m), m).isPoints).toBe(false);
    }
  });

  it('hides it when both current and previous are negative', () => {
    // -100 to -50 is an improvement; (50 / -100) * 100 reads as -50%.
    const v = deltaView(makeDelta(-50, -100, 'net'), 'net');
    expect(v.showPercent).toBe(false);
    expect(v.tone).toBe('good');
  });
});

describe('tone — never the opposite of the truth', () => {
  it('treats rising income as good and falling income as bad', () => {
    expect(deltaView(makeDelta(120, 100, 'income'), 'income').tone).toBe('good');
    expect(deltaView(makeDelta(80, 100, 'income'), 'income').tone).toBe('bad');
  });

  it('inverts for expenses — spending more is not an improvement', () => {
    expect(deltaView(makeDelta(120, 100, 'expenses'), 'expenses').tone).toBe('bad');
    expect(deltaView(makeDelta(80, 100, 'expenses'), 'expenses').tone).toBe('good');
  });

  it('is neutral when nothing changed', () => {
    for (const m of ['income', 'expenses', 'net', 'margin'] as const) {
      expect(deltaView(makeDelta(100, 100, m), m).tone).toBe('neutral');
    }
  });

  it('follows the core favorable flag rather than deciding again', () => {
    // The core already knows which direction is good for each metric. Deciding
    // it a second time here is how the two drift apart.
    for (const m of ['income', 'expenses', 'net', 'margin'] as const) {
      for (const [c, p] of [[120, 100], [80, 100], [100, 100]] as const) {
        const d = makeDelta(c, p, m);
        const v = deltaView(d, m);
        const expected = d.favorable === null ? 'neutral' : d.favorable ? 'good' : 'bad';
        expect(v.tone).toBe(expected);
      }
    }
  });
});

describe('direction — the glyph, so colour is never the only signal', () => {
  it('points up when the value rose, whatever that means', () => {
    expect(deltaView(makeDelta(120, 100, 'expenses'), 'expenses').direction).toBe('up');
  });

  it('points down when the value fell', () => {
    expect(deltaView(makeDelta(80, 100, 'income'), 'income').direction).toBe('down');
  });

  it('is flat when unchanged', () => {
    expect(deltaView(makeDelta(100, 100, 'net'), 'net').direction).toBe('flat');
  });

  it('reports direction independently of tone', () => {
    // Expenses rising is 'up' and 'bad' at once; conflating them is how a
    // chart ends up with a downward arrow on a growing bar.
    const v = deltaView(makeDelta(120, 100, 'expenses'), 'expenses');
    expect(v.direction).toBe('up');
    expect(v.tone).toBe('bad');
  });
});

describe('comparisonView', () => {
  const TODAY = new Date(2026, 7, 26);

  function twoMonths() {
    let s = emptyStore({ currency: 'USD', locale: 'en' });
    s = upsertEntry(s, '2026-07', 'income', { id: 'i0', name: 'Pay', category: 'salary', amount: 6000, date: '2026-07-25' });
    s = upsertEntry(s, '2026-07', 'expense', { id: 'p1', name: 'Rent', category: 'housing', amount: 1500, date: '2026-07-01' });
    s = upsertEntry(s, '2026-07', 'expense', { id: 'p2', name: 'Food', category: 'food', amount: 640, date: '2026-07-02' });
    s = upsertEntry(s, '2026-08', 'income', { id: 'i1', name: 'Pay', category: 'salary', amount: 6500, date: '2026-08-25' });
    s = upsertEntry(s, '2026-08', 'expense', { id: 'c1', name: 'Rent', category: 'housing', amount: 1500, date: '2026-08-01' });
    s = upsertEntry(s, '2026-08', 'expense', { id: 'c2', name: 'Food', category: 'food', amount: 810, date: '2026-08-02' });
    s = upsertEntry(s, '2026-08', 'expense', { id: 'c3', name: 'Clinic', category: 'health', amount: 300, date: '2026-08-09' });
    return s;
  }

  it('reports that a previous month exists', () => {
    const v = comparisonView(twoMonths(), '2026-08', { today: TODAY });
    expect(v.hasPrevious).toBe(true);
    expect(v.previousKey).toBe('2026-07');
  });

  it('reports the absence of a previous month, rather than showing zeros', () => {
    let s = emptyStore();
    s = upsertEntry(s, '2026-08', 'income', { id: 'a', name: 'Pay', category: 'salary', amount: 100, date: '2026-08-01' });
    const v = comparisonView(s, '2026-08', { today: TODAY });
    expect(v.hasPrevious).toBe(false);
    expect(v.previousKey).toBeNull();
  });

  it('gives four headline metrics in a stable order', () => {
    const v = comparisonView(twoMonths(), '2026-08', { today: TODAY });
    expect(v.headline.map((h) => h.key)).toEqual(['income', 'expenses', 'net', 'margin']);
  });

  it('carries both raw values alongside each headline view', () => {
    const income = comparisonView(twoMonths(), '2026-08', { today: TODAY }).headline[0];
    expect(income.current).toBe(6500);
    expect(income.previous).toBe(6000);
    expect(income.view.tone).toBe('good');
  });

  it('lists categories with both months values', () => {
    const rows = comparisonView(twoMonths(), '2026-08', { today: TODAY }).categories;
    const food = rows.find((r) => r.category === 'food');
    expect(food!.current).toBe(810);
    expect(food!.previous).toBe(640);
  });

  it('includes a category that is new this month', () => {
    const health = comparisonView(twoMonths(), '2026-08', { today: TODAY }).categories
      .find((r) => r.category === 'health');
    expect(health!.previous).toBe(0);
    expect(health!.view.status).toBe('new');
    expect(health!.view.showPercent).toBe(false);
  });

  it('sorts categories by current amount descending', () => {
    const rows = comparisonView(twoMonths(), '2026-08', { today: TODAY }).categories;
    for (let i = 1; i < rows.length; i++) {
      expect(rows[i - 1].current).toBeGreaterThanOrEqual(rows[i].current);
    }
  });

  it('limits how many categories it returns, so the chart stays readable', () => {
    let s = emptyStore();
    const cats = ['housing', 'food', 'transport', 'utilities', 'health', 'education', 'shopping', 'entertainment', 'communication', 'debt'];
    cats.forEach((c, i) => {
      s = upsertEntry(s, '2026-08', 'expense', { id: `x${i}`, name: c, category: c, amount: 100 - i, date: '2026-08-01' });
    });
    const rows = comparisonView(s, '2026-08', { today: TODAY, maxCategories: 6 }).categories;
    expect(rows).toHaveLength(6);
    expect(rows[0].category).toBe('housing');
  });

  it('returns an empty category list for a month with no expenses', () => {
    expect(comparisonView(emptyStore(), '2026-08', { today: TODAY }).categories).toEqual([]);
  });

  it('never produces a NaN or Infinity in any view', () => {
    const v = comparisonView(twoMonths(), '2026-08', { today: TODAY });
    for (const row of [...v.headline, ...v.categories]) {
      expect(Number.isFinite(row.view.absolute)).toBe(true);
      expect(row.view.percent === null || Number.isFinite(row.view.percent)).toBe(true);
    }
  });
});

// A fourth misleading case the brief missed, found while implementing. A
// category holding 0.01 last month and 100 this month is a true +999,900%, and
// nobody reads that as information -- it reads as a broken screen.
describe('showPercent — an enormous percentage informs nobody', () => {
  it('hides a percentage past a tenfold change', () => {
    const v = deltaView(makeDelta(100, 0.01, 'income'), 'income');
    expect(v.percent).toBeCloseTo(999900, 0);
    expect(v.showPercent).toBe(false);
    // The absolute change still carries the meaning.
    expect(v.absolute).toBeCloseTo(99.99, 2);
    expect(v.tone).toBe('good');
  });

  it.each([
    ['1 to 100', 1, 100],
    ['0.5 to 1000', 0.5, 1000],
    ['0.02 to 50', 0.02, 50],
  ])('hides it for %s', (_l, previous, current) => {
    expect(deltaView(makeDelta(current, previous, 'income'), 'income').showPercent).toBe(false);
  });

  it('still shows an ordinary change', () => {
    expect(deltaView(makeDelta(120, 100, 'income'), 'income').showPercent).toBe(true);
    expect(deltaView(makeDelta(1000, 100, 'income'), 'income').showPercent).toBe(true); // +900%
  });

  it('applies to a large DROP as well as a rise', () => {
    // 100 down to 0.01 is -99.99%, well inside the range -- the threshold is
    // about the magnitude of the percentage, and a fall can never exceed 100%.
    expect(deltaView(makeDelta(0.01, 100, 'income'), 'income').showPercent).toBe(true);
  });

  it('hides it for an amplified expense too, with the right tone', () => {
    const v = deltaView(makeDelta(500, 0.05, 'expenses'), 'expenses');
    expect(v.showPercent).toBe(false);
    expect(v.tone).toBe('bad');
    expect(v.direction).toBe('up');
  });
});
