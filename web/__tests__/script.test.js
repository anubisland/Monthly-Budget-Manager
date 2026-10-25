/**
 * Tests for Monthly Budget Manager web app (script.js).
 *
 * Sets up a minimal DOM fixture mirroring index.html element IDs,
 * mocks localStorage and i18n, then loads script.js via require().
 */

// ---------------------------------------------------------------------------
// Canvas mock — jsdom does not implement getContext('2d')
// ---------------------------------------------------------------------------
const canvasCtxMock = {
  clearRect: jest.fn(),
  fillRect: jest.fn(),
  strokeRect: jest.fn(),
  beginPath: jest.fn(),
  moveTo: jest.fn(),
  lineTo: jest.fn(),
  arc: jest.fn(),
  closePath: jest.fn(),
  fill: jest.fn(),
  stroke: jest.fn(),
  fillText: jest.fn(),
};
HTMLCanvasElement.prototype.getContext = jest.fn(() => canvasCtxMock);

// ---------------------------------------------------------------------------
// localStorage mock — must be set up before require()
// ---------------------------------------------------------------------------
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: jest.fn(key => store[key] ?? null),
    setItem: jest.fn((key, value) => { store[key] = String(value); }),
    removeItem: jest.fn(key => { delete store[key]; }),
    clear: jest.fn(() => { store = {}; }),
    _reset: () => { store = {}; },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

window.alert = jest.fn();
window.confirm = jest.fn(() => true);

// ---------------------------------------------------------------------------
// i18n mock — returns key (not real translated text) for readable assertions
// ---------------------------------------------------------------------------
window.i18n = {
  t: jest.fn((key, params) => {
    if (!params) return key;
    return key.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? params[k] : '{' + k + '}'));
  }),
  getCurrentLang: jest.fn(() => 'en'),
  setLanguage: jest.fn(),
  render: jest.fn(),
  init: jest.fn(),
};

// ---------------------------------------------------------------------------
// DOM fixture — minimal set of element IDs that script.js references
// ---------------------------------------------------------------------------
function buildFixtureDOM() {
  const ids = [
    'statusBar',
    'reportTotalIncome', 'reportTotalExpenses', 'reportNet', 'reportMargin',
    'incomeTableBody', 'incomeEmpty',
    'expenseTableBody', 'expenseEmpty',
    'breakdownTableBody', 'reportEmpty',
  ];
  const inputs = {
    incomeName: 'text', incomeAmount: 'number', incomeDate: 'date',
    expenseName: 'text', expenseAmount: 'number', expenseDate: 'date',
    monthInput: 'month',
  };

  ids.forEach(id => {
    if (!document.getElementById(id)) {
      const el = document.createElement('div');
      el.id = id;
      document.body.appendChild(el);
    }
  });
  Object.entries(inputs).forEach(([id, type]) => {
    if (!document.getElementById(id)) {
      const el = document.createElement('input');
      el.id = id;
      el.type = type;
      document.body.appendChild(el);
    }
  });

  if (!document.getElementById('expenseCategory')) {
    const sel = document.createElement('select');
    sel.id = 'expenseCategory';
    document.body.appendChild(sel);
  }

  ['barChart', 'pieChart'].forEach(id => {
    if (!document.getElementById(id)) {
      const canvas = document.createElement('canvas');
      canvas.id = id;
      canvas.width = 400;
      canvas.height = 220;
      document.body.appendChild(canvas);
    }
  });

  // Bank statement panel — same IDs as index.html.
  if (!document.getElementById('statementPanel')) {
    const panel = document.createElement('div');
    panel.id = 'statementPanel';
    panel.className = 'hidden';
    document.body.appendChild(panel);
  }
  if (!document.getElementById('statementText')) {
    const box = document.createElement('textarea');
    box.id = 'statementText';
    document.body.appendChild(box);
  }
  ['statementPreview', 'statementCounts', 'statementMore', 'statementMonth'].forEach(id => {
    if (!document.getElementById(id)) {
      const el = document.createElement('div');
      el.id = id;
      document.body.appendChild(el);
    }
  });
  if (!document.getElementById('statementPreviewBody')) {
    const tbody = document.createElement('tbody');
    tbody.id = 'statementPreviewBody';
    document.body.appendChild(tbody);
  }
  if (!document.getElementById('statementIncludeDups')) {
    const check = document.createElement('input');
    check.type = 'checkbox';
    check.id = 'statementIncludeDups';
    document.body.appendChild(check);
  }
  if (!document.getElementById('statementConfirmBtn')) {
    const btn = document.createElement('button');
    btn.id = 'statementConfirmBtn';
    document.body.appendChild(btn);
  }

  ['income', 'expenses', 'report'].forEach(name => {
    if (!document.getElementById('tab-' + name)) {
      const el = document.createElement('div');
      el.id = 'tab-' + name;
      el.className = 'tab-content hidden';
      document.body.appendChild(el);
    }
    const existing = document.querySelector('[data-tab="' + name + '"]');
    if (!existing) {
      const btn = document.createElement('button');
      btn.className = 'tab-btn';
      btn.setAttribute('data-tab', name);
      document.body.appendChild(btn);
    }
  });
}

buildFixtureDOM();

// ---------------------------------------------------------------------------
// Load script.js (IIFE; sets window.budgetApp on execution)
// ---------------------------------------------------------------------------
require('../statement.js');
require('../script.js');

const app = window.budgetApp;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function resetStorage() {
  localStorageMock._reset();
  localStorageMock.getItem.mockClear();
  localStorageMock.setItem.mockClear();
}

function storeSampleData(data) {
  localStorageMock._reset();
  localStorageMock.getItem.mockImplementation(key => {
    if (key === 'anubisland-budget') return JSON.stringify(data);
    return null;
  });
}

// ---------------------------------------------------------------------------
// Business logic: totalIncome
// ---------------------------------------------------------------------------
describe('totalIncome()', () => {
  test('returns 0 for empty incomes', () => {
    expect(app.totalIncome({ incomes: [], expenses: [] })).toBe(0);
  });

  test('sums amounts correctly', () => {
    const data = { incomes: [{ amount: 1000 }, { amount: 500 }], expenses: [] };
    expect(app.totalIncome(data)).toBe(1500);
  });

  test('coerces string amounts', () => {
    const data = { incomes: [{ amount: '2000' }, { amount: '300.50' }], expenses: [] };
    expect(app.totalIncome(data)).toBeCloseTo(2300.5);
  });

  test('ignores NaN entries', () => {
    const data = { incomes: [{ amount: 500 }, { amount: NaN }], expenses: [] };
    expect(app.totalIncome(data)).toBe(500);
  });
});

// ---------------------------------------------------------------------------
// Business logic: totalExpenses
// ---------------------------------------------------------------------------
describe('totalExpenses()', () => {
  test('returns 0 for empty expenses', () => {
    expect(app.totalExpenses({ incomes: [], expenses: [] })).toBe(0);
  });

  test('sums expense amounts', () => {
    const data = {
      incomes: [],
      expenses: [{ amount: 800, category: 'Rent' }, { amount: 200, category: 'Food' }],
    };
    expect(app.totalExpenses(data)).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// Business logic: net
// ---------------------------------------------------------------------------
describe('net()', () => {
  test('positive when income > expenses', () => {
    const data = {
      incomes: [{ amount: 3000 }],
      expenses: [{ amount: 1000, category: 'Rent' }],
    };
    expect(app.net(data)).toBe(2000);
  });

  test('negative when expenses > income', () => {
    const data = {
      incomes: [{ amount: 500 }],
      expenses: [{ amount: 1000, category: 'Rent' }],
    };
    expect(app.net(data)).toBe(-500);
  });

  test('zero when balanced', () => {
    const data = {
      incomes: [{ amount: 1000 }],
      expenses: [{ amount: 1000, category: 'Misc' }],
    };
    expect(app.net(data)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Business logic: profitMargin
// ---------------------------------------------------------------------------
describe('profitMargin()', () => {
  test('returns 0 when no income', () => {
    const data = { incomes: [], expenses: [{ amount: 100, category: 'Food' }] };
    expect(app.profitMargin(data)).toBe(0);
  });

  test('returns 100% when no expenses', () => {
    const data = { incomes: [{ amount: 5000 }], expenses: [] };
    expect(app.profitMargin(data)).toBe(100);
  });

  test('calculates correct margin', () => {
    const data = {
      incomes: [{ amount: 4000 }],
      expenses: [{ amount: 1000, category: 'Rent' }],
    };
    expect(app.profitMargin(data)).toBe(75);
  });

  test('returns negative margin when expenses > income', () => {
    const data = {
      incomes: [{ amount: 1000 }],
      expenses: [{ amount: 2000, category: 'Misc' }],
    };
    expect(app.profitMargin(data)).toBe(-100);
  });
});

// ---------------------------------------------------------------------------
// Business logic: expensesByCategory
// ---------------------------------------------------------------------------
describe('expensesByCategory()', () => {
  test('groups by category', () => {
    const data = {
      incomes: [],
      expenses: [
        { amount: 400, category: 'Food' },
        { amount: 800, category: 'Rent' },
        { amount: 200, category: 'Food' },
      ],
    };
    const result = app.expensesByCategory(data);
    expect(result['Food']).toBe(600);
    expect(result['Rent']).toBe(800);
  });

  test('uses "Uncategorized" for missing category', () => {
    const data = { incomes: [], expenses: [{ amount: 50 }] };
    expect(app.expensesByCategory(data)['Uncategorized']).toBe(50);
  });

  test('returns empty object when no expenses', () => {
    expect(app.expensesByCategory({ incomes: [{ amount: 1000 }], expenses: [] })).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// Business logic: expensePctByCategory
// ---------------------------------------------------------------------------
describe('expensePctByCategory()', () => {
  const data = {
    incomes: [{ amount: 4000 }],
    expenses: [
      { amount: 800, category: 'Rent' },
      { amount: 400, category: 'Food' },
    ],
  };

  test('percent of income', () => {
    const pct = app.expensePctByCategory(data, 'income');
    expect(pct['Rent']).toBeCloseTo(20);
    expect(pct['Food']).toBeCloseTo(10);
  });

  test('percent of expenses', () => {
    const pct = app.expensePctByCategory(data, 'expenses');
    expect(pct['Rent']).toBeCloseTo(66.67, 1);
    expect(pct['Food']).toBeCloseTo(33.33, 1);
  });

  test('returns 0% when denominator is zero', () => {
    const d = { incomes: [], expenses: [{ amount: 100, category: 'Food' }] };
    expect(app.expensePctByCategory(d, 'income')['Food']).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------
describe('validateAmount()', () => {
  test('accepts valid non-negative numbers', () => {
    expect(app.validateAmount('100')).toBe(true);
    expect(app.validateAmount('0')).toBe(true);
    expect(app.validateAmount('1500.50')).toBe(true);
  });

  test('rejects negative numbers', () => {
    expect(app.validateAmount('-5')).toBe(false);
  });

  test('rejects non-numeric strings', () => {
    expect(app.validateAmount('abc')).toBe(false);
    expect(app.validateAmount('')).toBe(false);
  });
});

describe('validateDate()', () => {
  test('accepts empty string (optional field)', () => {
    expect(app.validateDate('')).toBe(true);
  });

  test('accepts valid YYYY-MM-DD', () => {
    expect(app.validateDate('2025-08-15')).toBe(true);
  });

  test('accepts valid YYYY-MM', () => {
    expect(app.validateDate('2025-08')).toBe(true);
  });

  test('rejects invalid formats', () => {
    expect(app.validateDate('not-a-date')).toBe(false);
    expect(app.validateDate('2025')).toBe(false);
    expect(app.validateDate('25-08-15')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
describe('fmtAmount()', () => {
  test('formats with dollar sign and 2 decimals', () => {
    expect(app.fmtAmount(1000)).toBe('$1,000.00');
    expect(app.fmtAmount(0)).toBe('$0.00');
    expect(app.fmtAmount(99.5)).toBe('$99.50');
  });
});

// ---------------------------------------------------------------------------
// Data persistence
// ---------------------------------------------------------------------------
describe('loadData() / saveData()', () => {
  beforeEach(() => resetStorage());

  test('returns empty data when storage is empty', () => {
    localStorageMock.getItem.mockReturnValue(null);
    const d = app.loadData();
    expect(d.incomes).toEqual([]);
    expect(d.expenses).toEqual([]);
    expect(d.month).toBe('');
  });

  test('round-trips data through save/load', () => {
    const original = {
      month: '2025-08',
      incomes: [{ name: 'Salary', amount: 5000, date: '2025-08-01' }],
      expenses: [{ name: 'Rent', category: 'Rent', amount: 1500, date: '2025-08-02' }],
    };
    app.saveData(original);
    const savedJson = localStorageMock.setItem.mock.calls[0][1];
    localStorageMock.getItem.mockReturnValue(savedJson);
    const loaded = app.loadData();
    expect(loaded.month).toBe('2025-08');
    expect(loaded.incomes[0].name).toBe('Salary');
    expect(loaded.expenses[0].category).toBe('Rent');
  });

  test('returns empty data on invalid JSON', () => {
    localStorageMock.getItem.mockReturnValue('not-valid-json{{{');
    const d = app.loadData();
    expect(d.incomes).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Bank statement import — paste, look, confirm
// ---------------------------------------------------------------------------
describe('bank statement import', () => {
  let mem;

  function statusText() {
    return document.getElementById('statusBar').textContent;
  }

  function panel() {
    return document.getElementById('statementPanel');
  }

  function putStatement(text) {
    document.getElementById('statementText').value = text;
  }

  function stored() {
    return JSON.parse(mem['anubisland-budget']);
  }

  beforeEach(() => {
    mem = {};
    localStorageMock._reset();
    localStorageMock.getItem.mockClear();
    localStorageMock.setItem.mockClear();
    localStorageMock.getItem.mockImplementation(key => (key in mem ? mem[key] : null));
    localStorageMock.setItem.mockImplementation((key, value) => { mem[key] = String(value); });
    document.getElementById('monthInput').value = '2026-08';
    putStatement('');
    document.getElementById('statementIncludeDups').checked = false;
    document.getElementById('statusBar').textContent = '';
    window.clearStatementPanel();
    panel().classList.add('hidden');
  });

  test('a preview shows what came out and writes nothing', () => {
    putStatement(
      'Date,Description,Amount\n' +
      '2026-08-02,Salary,5000\n' +
      '2026-08-03,Rent,-1500\n'
    );
    app.previewStatement();

    const preview = app._statementPreview();
    expect(preview.entries).toHaveLength(2);
    expect(preview.entries[0].kind).toBe('income');
    expect(preview.entries[1].kind).toBe('expense');

    const rows = document.getElementById('statementPreviewBody').textContent;
    expect(rows).toContain('Salary');
    expect(rows).toContain('Rent');
    expect(localStorageMock.setItem).not.toHaveBeenCalled();
  });

  test('an empty paste is reported, not previewed', () => {
    putStatement('   ');
    app.previewStatement();

    expect(app._statementPreview()).toBeNull();
    expect(statusText()).toBe('st.pasteFirst');
  });

  test('text that is not a statement reports why and previews nothing', () => {
    putStatement('Date,Amount\n2026-08-01,10');
    app.previewStatement();

    expect(app._statementPreview()).toBeNull();
    expect(statusText()).toBe('st.unreadable');
  });

  test('confirming adds the previewed rows to the month', () => {
    putStatement(
      'Date,Description,Amount\n' +
      '2026-08-02,Salary,5000\n' +
      '2026-08-03,Rent,-1500\n'
    );
    app.previewStatement();
    app.importStatement();

    const data = stored();
    expect(data.month).toBe('2026-08');
    expect(data.incomes).toEqual([{ name: 'Salary', amount: 5000, date: '2026-08-02' }]);
    expect(data.expenses).toEqual([
      { name: 'Rent', category: 'Uncategorized', amount: 1500, date: '2026-08-03' },
    ]);
    expect(statusText()).toBe('st.done');
    expect(app._statementPreview()).toBeNull();
    expect(panel().classList.contains('hidden')).toBe(true);
  });

  test('a row already in the month is flagged and skipped unless asked for', () => {
    mem['anubisland-budget'] = JSON.stringify({
      month: '2026-08',
      incomes: [],
      expenses: [{ name: 'Rent', category: 'Rent', amount: 1500, date: '2026-08-03' }],
    });
    putStatement('Date,Description,Amount\n2026-08-03,Rent,-1500');

    app.previewStatement();
    expect(app._statementPreview().entries[0].duplicate).toBe(true);
    app.importStatement();

    expect(stored().expenses).toHaveLength(1);
    expect(stored().expenses[0].category).toBe('Rent');

    putStatement('Date,Description,Amount\n2026-08-03,Rent,-1500');
    app.previewStatement();
    document.getElementById('statementIncludeDups').checked = true;
    app.importStatement();

    expect(stored().expenses).toHaveLength(2);
  });

  test('a month changed after the preview refuses the import', () => {
    putStatement('Date,Description,Amount\n2026-08-03,Rent,-1500');
    app.previewStatement();

    document.getElementById('monthInput').value = '2026-09';
    app.importStatement();

    expect(mem['anubisland-budget']).toBeUndefined();
    expect(statusText()).toBe('st.monthChanged');
    expect(app._statementPreview()).not.toBeNull();
  });

  test('clearing the panel forgets the preview', () => {
    putStatement('Date,Description,Amount\n2026-08-03,Rent,-1500');
    app.previewStatement();

    window.clearStatementPanel();

    expect(app._statementPreview()).toBeNull();
    expect(document.getElementById('statementText').value).toBe('');
    expect(document.getElementById('statementPreviewBody').children).toHaveLength(0);
  });

  test('the panel opens and closes', () => {
    window.toggleStatementPanel();
    expect(panel().classList.contains('hidden')).toBe(false);

    putStatement('Date,Description,Amount\n2026-08-03,Rent,-1500');
    app.previewStatement();
    window.toggleStatementPanel();

    expect(panel().classList.contains('hidden')).toBe(true);
    expect(app._statementPreview()).toBeNull();
  });

  test('confirming without a preview adds nothing', () => {
    app.importStatement();

    expect(mem['anubisland-budget']).toBeUndefined();
    expect(statusText()).toBe('st.previewFirst');
  });
});

// ---------------------------------------------------------------------------
// renderAll() integration smoke test
// ---------------------------------------------------------------------------
describe('renderAll()', () => {
  beforeEach(() => {
    resetStorage();
    localStorageMock.getItem.mockReturnValue(null);
  });

  test('does not throw on empty data', () => {
    expect(() => app.renderAll()).not.toThrow();
  });

  test('does not throw with sample data', () => {
    storeSampleData({
      month: '2025-08',
      incomes: [{ name: 'Salary', amount: 5000, date: '2025-08-01' }],
      expenses: [
        { name: 'Rent', category: 'Rent', amount: 1500, date: '2025-08-02' },
        { name: 'Groceries', category: 'Food', amount: 400, date: '2025-08-05' },
      ],
    });
    expect(() => app.renderAll()).not.toThrow();
  });
});
