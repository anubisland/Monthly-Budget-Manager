import { budgetReducer, initialBudgetState, canPersist } from './budgetReducer';
import { emptyStore, upsertEntry, monthsWithData } from '@monthly-budget/shared';

const TODAY = new Date(2026, 7, 26);
const init = () => initialBudgetState(TODAY);

describe('initial state (P2, P8)', () => {
  it('starts in loading, not ready', () => {
    expect(init().status).toBe('loading');
  });

  it('opens on the current month', () => {
    expect(init().monthKey).toBe('2026-08');
  });

  it('refuses to persist before loading finishes (P2)', () => {
    expect(canPersist(init())).toBe(false);
  });
});

describe('loaded', () => {
  const loaded = () =>
    budgetReducer(init(), { type: 'loaded', store: emptyStore(), notice: null });

  it('becomes ready', () => {
    expect(loaded().status).toBe('ready');
  });

  it('may persist once ready (P3)', () => {
    expect(canPersist(loaded())).toBe(true);
  });

  it('stays on the current month', () => {
    expect(loaded().monthKey).toBe('2026-08');
  });
});

describe('month navigation (P8)', () => {
  const ready = () => budgetReducer(init(), { type: 'loaded', store: emptyStore(), notice: null });

  it('steps back a month', () => {
    expect(budgetReducer(ready(), { type: 'goPrev' }).monthKey).toBe('2026-07');
  });

  it('crosses a year boundary backwards', () => {
    let s = ready();
    for (let i = 0; i < 8; i++) s = budgetReducer(s, { type: 'goPrev' });
    expect(s.monthKey).toBe('2025-12');
  });

  it('refuses to move into the future', () => {
    expect(budgetReducer(ready(), { type: 'goNext' }).monthKey).toBe('2026-08');
  });

  it('refuses to move into the future even when repeated (does not drift)', () => {
    let s = ready();
    for (let i = 0; i < 5; i++) s = budgetReducer(s, { type: 'goNext' });
    expect(s.monthKey).toBe('2026-08');
  });

  it('returns to the current month', () => {
    let s = budgetReducer(ready(), { type: 'goPrev' });
    s = budgetReducer(s, { type: 'goCurrent' });
    expect(s.monthKey).toBe('2026-08');
  });

  it('does not touch the store while navigating', () => {
    const before = ready();
    const after = budgetReducer(before, { type: 'goPrev' });
    expect(after.store).toBe(before.store);
  });

  it('goTo refuses to move into the future', () => {
    const before = ready();
    const after = budgetReducer(before, { type: 'goTo', monthKey: '2026-09' });
    expect(after.monthKey).toBe('2026-08');
  });

  it('goTo moves to an allowed past month', () => {
    const after = budgetReducer(ready(), { type: 'goTo', monthKey: '2026-01' });
    expect(after.monthKey).toBe('2026-01');
  });
});

describe('entry actions', () => {
  const ready = () => budgetReducer(init(), { type: 'loaded', store: emptyStore(), notice: null });
  const entry = { id: 'a', name: 'Rent', category: 'housing', amount: 1500, date: '2026-08-01' };

  it('adds an entry to the displayed month', () => {
    const s = budgetReducer(ready(), { type: 'upsert', kind: 'expense', entry });
    expect(monthsWithData(s.store)).toEqual(['2026-08']);
  });

  it('adds to the DISPLAYED month, not always the current one', () => {
    let s = budgetReducer(ready(), { type: 'goPrev' });
    s = budgetReducer(s, { type: 'upsert', kind: 'expense', entry: { ...entry, date: '2026-07-01' } });
    expect(monthsWithData(s.store)).toEqual(['2026-07']);
  });

  it('removes an entry by id', () => {
    let s = budgetReducer(ready(), { type: 'upsert', kind: 'expense', entry });
    s = budgetReducer(s, { type: 'remove', kind: 'expense', id: 'a' });
    expect(monthsWithData(s.store)).toEqual([]);
  });

  it('IGNORES an entry action while still loading (P2)', () => {
    const s = budgetReducer(init(), { type: 'upsert', kind: 'expense', entry });
    expect(s.status).toBe('loading');
    expect(monthsWithData(s.store)).toEqual([]);
  });

  it('IGNORES an upsert action while in error state', () => {
    let s = budgetReducer(init(), { type: 'loadFailed', error: 'boom' });
    expect(s.status).toBe('error');
    s = budgetReducer(s, { type: 'upsert', kind: 'expense', entry });
    expect(s.status).toBe('error');
    expect(monthsWithData(s.store)).toEqual([]);
  });
});

describe('error handling (P7)', () => {
  const ready = () => budgetReducer(init(), { type: 'loaded', store: emptyStore(), notice: null });

  it('surfaces a save failure without discarding the user’s data', () => {
    let s = budgetReducer(ready(), {
      type: 'upsert',
      kind: 'expense',
      entry: { id: 'a', name: 'Rent', category: 'housing', amount: 1500, date: '2026-08-01' },
    });
    const withData = s.store;
    s = budgetReducer(s, { type: 'saveFailed', error: 'disk full' });
    expect(s.error).toContain('disk full');
    expect(s.store).toBe(withData);
  });

  it('clears the error on dismiss', () => {
    let s = budgetReducer(ready(), { type: 'saveFailed', error: 'disk full' });
    s = budgetReducer(s, { type: 'dismissError' });
    expect(s.error).toBeNull();
  });

  it('carries a load notice so migration can be reported', () => {
    const s = budgetReducer(init(), {
      type: 'loaded',
      store: emptyStore(),
      notice: 'migrated',
    });
    expect(s.notice).toBe('migrated');
  });

  it('clears the notice on dismiss', () => {
    let s = budgetReducer(init(), { type: 'loaded', store: emptyStore(), notice: 'corrupt' });
    s = budgetReducer(s, { type: 'dismissNotice' });
    expect(s.notice).toBeNull();
  });

  it('loadFailed sets status to error and records the message', () => {
    const s = budgetReducer(init(), { type: 'loadFailed', error: 'device unreadable' });
    expect(s.status).toBe('error');
    expect(s.error).toBe('device unreadable');
  });
});

describe('initialBudgetState determinism', () => {
  it('is deterministic across calls given the same injected date', () => {
    const a = initialBudgetState(TODAY);
    const b = initialBudgetState(TODAY);
    expect(a.monthKey).toBe(b.monthKey);
    expect(a.status).toBe(b.status);
    expect(a.store).toEqual(b.store);
    expect(a.error).toBe(b.error);
    expect(a.notice).toBe(b.notice);
  });
});
