/**
 * Tests for mobile/src/budget_manager_mobile/web/apishim.js — the localStorage
 * twin of the app's local HTTP API, used when the same UI is served from
 * GitHub Pages instead of the on-device Python server.
 *
 * The environment URL is set to the Pages URL so the shim's activation guard
 * passes; apishim.noop.test.js covers the opposite case (127.0.0.1 keeps the
 * real server and must not be patched).
 *
 * Each test starts from an empty localStorage and a freshly required shim so
 * the module's internal model cannot leak between tests.
 *
 * @jest-environment-options {"url": "https://anubisland.github.io/Monthly-Budget-Manager/"}
 */

// jsdom has no Response; the shim builds Responses at call time, so a minimal
// stand-in with the fields the page reads (status/ok/json) is enough.
if (typeof window.Response !== 'function') {
  class StubResponse {
    constructor(body, init = {}) {
      this._body = body;
      this.status = init.status || 200;
      this.ok = this.status >= 200 && this.status < 300;
      this.headers = { get: () => 'application/json' };
    }
    async json() { return JSON.parse(this._body); }
    async text() { return this._body; }
  }
  window.Response = StubResponse;
}

require('../statement.js');

// Month arithmetic follows the device clock, like the shim itself.
function thisMonth() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0');
}

function freshShim() {
  localStorage.clear();
  // Drop any previous patch so the shim does not capture another shim's fetch.
  delete window.fetch;
  jest.resetModules();
  require('../../mobile/src/budget_manager_mobile/web/apishim.js');
}

async function api(path, body) {
  const init = body === undefined ? undefined
    : { method: 'POST', body: JSON.stringify(body) };
  const res = await window.fetch('/api/' + path, init);
  return { status: res.status, ok: res.ok, data: await res.json() };
}

beforeEach(freshShim);

describe('activation and routing', () => {
  test('GET /api/data answers a shaped empty state on first load', async () => {
    const { status, data } = await api('data');
    expect(status).toBe(200);
    expect(data.month_key).toBe(thisMonth());
    expect(data.total_income).toBe(0);
    expect(data.expenses).toEqual([]);
    expect(data.goals).toEqual([]);
    expect(data.version).toBeTruthy();
  });

  test('unknown /api route 404s like the Python server', async () => {
    const { status, data } = await api('no-such-endpoint', {});
    expect(status).toBe(404);
    expect(data.error).toMatch(/no such endpoint/);
  });

  test('malformed JSON body is a 400, not a crash', async () => {
    const res = await window.fetch('/api/add-expense', { method: 'POST', body: '{oops' });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/malformed JSON/);
  });

  test('non-/api URLs are not answered by the shim', async () => {
    // Nothing else is served here; without a real fetch the delegate rejects.
    await expect(window.fetch('/style.css')).rejects.toThrow(/no fetch/);
  });
});

describe('income and expense round-trip', () => {
  test('adds, edits and deletes persist across requests', async () => {
    let s = (await api('add-income', { name: 'Salary', amount: 5000 })).data;
    expect(s.total_income).toBe(5000);

    s = (await api('add-expense', { name: 'Groceries', amount: 120.5, category: 'Food' })).data;
    expect(s.total_expenses).toBe(120.5);
    expect(s.net).toBe(4879.5);
    // categories is a map keyed by category name, like the server's shape.
    expect(s.categories.Food.amount).toBe(120.5);

    // Survives a full reload of the shim (same localStorage, fresh module).
    jest.resetModules();
    delete window.fetch;
    require('../../mobile/src/budget_manager_mobile/web/apishim.js');
    s = (await api('data')).data;
    expect(s.total_income).toBe(5000);
    expect(s.expenses[0]).toMatchObject({ name: 'Groceries', amount: 120.5 });

    s = (await api('edit-expense', { index: 0, name: 'Groceries', amount: 100, category: 'Food' })).data;
    expect(s.total_expenses).toBe(100);

    s = (await api('delete-expense', { index: 0 })).data;
    expect(s.expenses).toEqual([]);
  });

  test('invalid rows are rejected with the same 400 contract', async () => {
    expect((await api('add-expense', { name: '', amount: 10 })).status).toBe(400);
    expect((await api('add-expense', { name: 'x', amount: 'abc' })).status).toBe(400);
    expect((await api('add-expense', { name: 'x', amount: -5 })).status).toBe(400);
    // A row index outside the list is a 404 on the real server too (errors.row).
    const bad = await api('delete-income', { index: 3 });
    expect(bad.status).toBe(404);
    expect(bad.data.error).toMatch(/no such row/);
    const err = await api('add-expense', { name: 'x', amount: 0 });
    expect(err.status).toBe(400);
  });
});

describe('month navigation', () => {
  test('set-budget stores the budget and drives pace', async () => {
    let s = (await api('set-budget', { total_budget: 3000 })).data;
    expect(s.total_budget).toBe(3000);
    expect(s.pace).toBeTruthy();
  });

  test('stepping back returns 400 at the oldest month; forward is capped at today', async () => {
    const s = (await api('data')).data;
    expect(s.can_go_back).toBe(false);
    expect(s.can_go_forward).toBe(false);
    // Already at the current month: the future does not exist to step into.
    expect((await api('step-month', { delta: 1 })).status).toBe(400);
    expect((await api('step-month', { delta: 2 })).status).toBe(400);
  });

  test('set-month to a past month round-trips and reports the previous month', async () => {
    await api('add-income', { name: 'Salary', amount: 100 });
    const pastKey = shiftKey(thisMonth(), -1);
    let s = (await api('set-month', { month: pastKey })).data;
    expect(s.month_key).toBe(pastKey);
    expect(s.can_go_forward).toBe(true);

    s = (await api('step-month', { delta: 1 })).data;
    expect(s.month_key).toBe(thisMonth());
    expect(s.total_income).toBe(100);
    // The previous (past) month was only visited, never filled: an empty
    // month has no summary, on the real server as here.
    expect(s.previous).toBe(null);
  });
});

describe('goals', () => {
  test('add-goal, fund-goal creates a deposit and tracks progress', async () => {
    let s = (await api('add-goal', { name: 'Emergency', target: 1000 })).data;
    expect(s.goals).toHaveLength(1);
    expect(s.goals[0]).toMatchObject({ name: 'Emergency', target: 1000, current: 0 });

    s = (await api('fund-goal', { index: 0, amount: 300 })).data;
    expect(s.goals[0].current).toBe(300);
    expect(s.goals[0].pct).toBe(30);
    // The deposit is a real expense under the goal's name.
    expect(s.expenses.some((e) => e.name === 'Emergency' && e.amount === 300)).toBe(true);

    // Duplicate goal names would inherit past deposits — rejected.
    expect((await api('add-goal', { name: 'Emergency', target: 10 })).status).toBe(400);

    s = (await api('delete-goal', { index: 0 })).data;
    expect(s.goals).toHaveLength(0);
  });
});

describe('statement import', () => {
  const m = thisMonth();
  const csv =
    'Date,Description,Amount\n' +
    `${m}-02,Salary,5000.00\n` +
    `${m}-03,Carrefour,-120.50\n`;

  test('preview then import lands entries in the current month', async () => {
    let s = (await api('preview-statement', { text: csv })).data;
    expect(s.statement_preview.read).toBe(2);
    expect(s.statement_preview.entries).toHaveLength(2);
    expect(s.statement_preview.duplicates).toBe(0);

    s = (await api('import-statement', {})).data;
    expect(s.total_income).toBe(5000);
    expect(s.total_expenses).toBe(120.5);
    expect(s.last_import.added).toBe(2);
    // The preview is consumed: importing twice without re-previewing 409s.
    expect((await api('import-statement', {})).status).toBe(409);
  });

  test('re-importing the same statement flags duplicates and adds nothing', async () => {
    await api('preview-statement', { text: csv });
    await api('import-statement', {});

    let s = (await api('preview-statement', { text: csv })).data;
    expect(s.statement_preview.duplicates).toBe(2);
    s = (await api('import-statement', {})).data;
    expect(s.last_import.added).toBe(0);
    expect(s.last_import.skipped).toBe(2);

    s = (await api('preview-statement', { text: csv })).data;
    s = (await api('import-statement', { include_duplicates: true })).data;
    expect(s.last_import.added).toBe(2);
    expect(s.total_expenses).toBe(241);
  });

  test('garbage text is a 400 with a readable reason', async () => {
    const r = await api('preview-statement', { text: 'not a statement at all' });
    expect(r.status).toBe(400);
    expect(typeof r.data.error).toBe('string');
  });
});

describe('sync endpoints', () => {
  const docWithIncome = (month, name, amount) => ({
    version: 2,
    current: month,
    months: {
      [month]: { incomes: [{ name, amount }], expenses: [], total_budget: 0 },
    },
    goals: [],
  });

  test('GET /api/doc returns the whole document across months', async () => {
    await api('add-income', { name: 'Salary', amount: 100 });
    await api('set-month', { month: shiftKey(thisMonth(), -1) });
    await api('add-expense', { name: 'Rent', amount: 40 });

    const { status, data } = await api('doc');
    expect(status).toBe(200);
    expect(data.version).toBe(2);
    expect(Object.keys(data.months).sort()).toEqual([shiftKey(thisMonth(), -1), thisMonth()]);
  });

  test('POST /api/sync-apply replaces everything and keeps the old document', async () => {
    await api('add-income', { name: 'Local', amount: 1 });
    const applied = (await api('sync-apply', { doc: docWithIncome('2026-07', 'Remote', 777) })).data;
    expect(applied.month_key).toBe('2026-07');
    expect(applied.total_income).toBe(777);
    expect(applied.incomes.map((i) => i.name)).toEqual(['Remote']);

    // The document the pull overwrote survives on a side key, like the
    // phone's before-sync file.
    const presync = JSON.parse(localStorage.getItem('bm.data.presync'));
    expect(presync.months[thisMonth()].incomes[0].name).toBe('Local');

    // And a reload starts from the applied document, not the old one.
    jest.resetModules();
    delete window.fetch;
    require('../../mobile/src/budget_manager_mobile/web/apishim.js');
    const s = (await api('data')).data;
    expect(s.month_key).toBe('2026-07');
    expect(s.total_income).toBe(777);
  });

  test('POST /api/sync-apply refuses foreign and future documents untouched', async () => {
    await api('add-income', { name: 'Local', amount: 1 });
    expect((await api('sync-apply', { doc: { nonsense: true } })).status).toBe(400);
    expect((await api('sync-apply', { doc: { version: 99, months: {} } })).status).toBe(400);
    expect((await api('sync-apply', {})).status).toBe(400);
    expect((await api('sync-apply', { doc: 'text' })).status).toBe(400);

    const s = (await api('data')).data;
    expect(s.incomes.map((i) => i.name)).toEqual(['Local']);
    expect(localStorage.getItem('bm.data.presync')).toBe(null);
  });
});

describe('settings, reset and corrupt storage', () => {
  test('set-currency and toggle-theme persist in their own key', async () => {
    let s = (await api('set-currency', { currency: 'EUR' })).data;
    expect(s.currency).toBe('EUR');
    s = (await api('toggle-theme', {})).data;
    expect(s.dark).toBe(true);

    jest.resetModules();
    delete window.fetch;
    require('../../mobile/src/budget_manager_mobile/web/apishim.js');
    s = (await api('data')).data;
    expect(s.currency).toBe('EUR');
    expect(s.dark).toBe(true);
    expect(localStorage.getItem('bm.settings')).toContain('EUR');
  });

  test('reset wipes the data document', async () => {
    await api('add-income', { name: 'Salary', amount: 999 });
    const s = (await api('reset', {})).data;
    expect(s.total_income).toBe(0);
    const raw = JSON.parse(localStorage.getItem('bm.data'));
    expect(Object.keys(raw.months).every((k) =>
      raw.months[k].incomes.length === 0 && raw.months[k].expenses.length === 0
    )).toBe(true);
  });

  test('corrupt stored data starts clean, says so, and keeps the remains', async () => {
    localStorage.setItem('bm.data', '{this is not json');
    jest.resetModules();
    delete window.fetch;
    require('../../mobile/src/budget_manager_mobile/web/apishim.js');
    let s = (await api('data')).data;
    expect(s.total_income).toBe(0);
    expect(s.note).toBe('corrupt');
    // The unreadable original survives on a side key, not under bm.data:
    // the next save overwrites bm.data, so this copy is all recovery has.
    const stashed = Object.keys(localStorage).filter((k) => k.startsWith('bm.data.corrupt.'));
    expect(stashed).toHaveLength(1);
    expect(localStorage.getItem(stashed[0])).toBe('{this is not json');

    // Once a save has written a valid document again, the note clears.
    s = (await api('add-expense', { name: 'Bread', amount: 5 })).data;
    expect(s.note).toBe(null);

    // A reload of the now-valid store does not report corruption again.
    jest.resetModules();
    delete window.fetch;
    require('../../mobile/src/budget_manager_mobile/web/apishim.js');
    s = (await api('data')).data;
    expect(s.note).toBe(null);
    expect(s.total_expenses).toBe(5);
  });
});

function shiftKey(key, delta) {
  const [y, mo] = key.split('-').map(Number);
  const idx = y * 12 + (mo - 1) + delta;
  return Math.floor(idx / 12) + '-' + String((idx % 12) + 1).padStart(2, '0');
}
