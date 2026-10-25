/**
 * Tests for web/statement.js — the browser port of the bank statement parser.
 *
 * The parser only reads: it produces candidate rows and never touches
 * localStorage. These tests cover the two things that go wrong quietly in an
 * import — a number read as the wrong magnitude, and a duplicate added twice.
 */

require('../statement.js');

const parser = window.statementParser;

const MONTH = '2026-08';

function parse(text, month = MONTH) {
  return parser.parse(text, month);
}

function codeOf(fn) {
  try {
    fn();
  } catch (err) {
    return err.code;
  }
  return null;
}

describe('parse()', () => {
  test('reads a comma statement with a header line', () => {
    const out = parse(
      'Date,Description,Amount\n' +
      '2026-08-02,Salary,5000.00\n' +
      '2026-08-03,Carrefour,-120.50\n'
    );

    expect(out.read).toBe(2);
    expect(out.skipped).toBe(0);
    expect(out.entries).toHaveLength(2);
    expect(out.entries[0]).toMatchObject({
      name: 'Salary', amount: 5000, kind: 'income', date: '2026-08-02',
    });
    expect(out.entries[1].name).toBe('Carrefour');
    expect(out.entries[1].amount).toBe(120.5);
    expect(out.entries[1].kind).toBe('expense');
  });

  test('reads a semicolon statement', () => {
    const out = parse('Date;Description;Amount\n2026-08-04;Fuel;45,50');
    expect(out.entries).toHaveLength(1);
    expect(out.entries[0].name).toBe('Fuel');
    expect(out.entries[0].amount).toBe(45.5);
  });

  test('reads quoted fields containing the delimiter', () => {
    const out = parse('Date,Description,Amount\n2026-08-05,"Coffee, milk",12.00');
    expect(out.entries[0].name).toBe('Coffee, milk');
  });

  test('reads Arabic headers', () => {
    const out = parse('التاريخ,البيان,المبلغ\n2026-08-06,بقالة,-80');
    expect(out.entries[0].name).toBe('بقالة');
    expect(out.entries[0].kind).toBe('expense');
    expect(out.entries[0].amount).toBe(80);
  });

  test('counts the rows it cannot trust instead of inventing them', () => {
    const out = parse(
      'Date,Description,Amount\n' +
      '2026-08-01,Opening balance,\n' +
      '2026-08-02,,50.00\n' +
      '2026-08-03,Coffee,0\n' +
      '2026-08-04,Rent,-1000\n' +
      'TOTAL,,,\n'
    );
    expect(out.read).toBe(5);
    expect(out.entries).toHaveLength(1);
    expect(out.skipped).toBe(4);
  });

  test('refuses an empty paste', () => {
    expect(codeOf(() => parse('   '))).toBe('empty');
  });

  test('refuses text with no description column', () => {
    expect(codeOf(() => parse('Date,Amount\n2026-08-01,10'))).toBe('noDescription');
  });

  test('refuses text with no amount column at all', () => {
    expect(codeOf(() => parse('Date,Description\n2026-08-01,Coffee'))).toBe('noAmount');
  });

  test('refuses a paste far larger than a statement', () => {
    const lines = ['Date,Description,Amount'];
    for (let i = 0; i < parser.MAX_ROWS + 1; i++) {
      lines.push('2026-08-01,Coffee,-5');
    }
    expect(codeOf(() => parse(lines.join('\n')))).toBe('tooManyRows');
  });
});

describe('parseAmount()', () => {
  test('keeps the sign the bank wrote', () => {
    expect(parser.parseAmount('-120.50')).toBe(-120.5);
    expect(parser.parseAmount('(120.50)')).toBe(-120.5);
    expect(parser.parseAmount('120.50 DR')).toBe(-120.5);
    expect(parser.parseAmount('120.50 CR')).toBe(120.5);
    expect(parser.parseAmount('+75.00')).toBe(75);
  });

  test('strips currency symbols and spaces', () => {
    expect(parser.parseAmount('$1,200.00')).toBe(1200);
    expect(parser.parseAmount('EGP 300.00')).toBe(300);
    expect(parser.parseAmount('  90.25  ')).toBe(90.25);
  });

  test('reads a decimal comma as a decimal point', () => {
    // Read the other way these become 120000 and 1.2 — plausible numbers, so
    // nothing downstream would question them.
    expect(parser.parseAmount('1200,00')).toBe(1200);
    expect(parser.parseAmount('1.200,00')).toBe(1200);
    expect(parser.parseAmount('45,50')).toBe(45.5);
  });

  test('reads a thousands separator as grouping', () => {
    expect(parser.parseAmount('1,200')).toBe(1200);
    expect(parser.parseAmount('1,200,000.00')).toBe(1200000);
  });

  test('returns null for text that is not a number', () => {
    expect(parser.parseAmount('')).toBeNull();
    expect(parser.parseAmount(null)).toBeNull();
    expect(parser.parseAmount('abc')).toBeNull();
    expect(parser.parseAmount('--')).toBeNull();
  });
});

describe('debit and credit columns', () => {
  test('debit is an expense and credit is income, both written positive', () => {
    const out = parse(
      'Date,Description,Debit,Credit\n' +
      '2026-08-02,Salary,,5000.00\n' +
      '2026-08-03,Rent,1500.00,\n'
    );

    expect(out.entries[0]).toMatchObject({ name: 'Salary', amount: 5000, kind: 'income' });
    expect(out.entries[1]).toMatchObject({ name: 'Rent', amount: 1500, kind: 'expense' });
  });
});

describe('dates', () => {
  test('reads day/month/year with any separator', () => {
    const out = parse(
      'Date,Description,Amount\n' +
      '05/08/2026,A,-10\n' +
      '06-08-2026,B,-10\n' +
      '07.08.2026,C,-10\n'
    );
    expect(out.entries.map(e => e.date)).toEqual(['2026-08-05', '2026-08-06', '2026-08-07']);
  });

  test('a date outside the month becomes the 1st rather than claiming another month', () => {
    const out = parse('Date,Description,Amount\n2026-07-31,A,-10');
    expect(out.entries[0].date).toBe('2026-08-01');
  });

  test('an unreadable date becomes the 1st', () => {
    const out = parse('Date,Description,Amount\n,Tuesday,-10');
    expect(out.entries[0].date).toBe('2026-08-01');
  });
});

describe('markDuplicates()', () => {
  const data = {
    incomes: [{ name: 'Salary', amount: 5000, date: '2026-08-02' }],
    expenses: [{ name: 'Rent', amount: 1500, date: '2026-08-03' }],
  };

  test('flags rows already stored in the month', () => {
    const entries = [
      { name: 'Salary', amount: 5000, date: '2026-08-02' },
      { name: 'Coffee', amount: 12, date: '2026-08-04' },
    ];
    parser.markDuplicates(entries, data);
    expect(entries[0].duplicate).toBe(true);
    expect(entries[1].duplicate).toBe(false);
  });

  test('matches on name, amount and date together, ignoring case and spacing', () => {
    const entries = [{ name: '  rent ', amount: 1500, date: '2026-08-03' }];
    parser.markDuplicates(entries, data);
    expect(entries[0].duplicate).toBe(true);

    const sameAmountOtherDay = [{ name: 'Rent', amount: 1500, date: '2026-08-04' }];
    parser.markDuplicates(sameAmountOtherDay, data);
    expect(sameAmountOtherDay[0].duplicate).toBe(false);
  });

  test('flags a repeat inside the same paste', () => {
    const entries = [
      { name: 'Coffee', amount: 12, date: '2026-08-04' },
      { name: 'Coffee', amount: 12, date: '2026-08-04' },
    ];
    parser.markDuplicates(entries, { incomes: [], expenses: [] });
    expect(entries[0].duplicate).toBe(false);
    expect(entries[1].duplicate).toBe(true);
  });
});

describe('sniffDelimiter()', () => {
  test('finds the delimiter on the header line', () => {
    expect(parser.sniffDelimiter('a;b;c')).toBe(';');
    expect(parser.sniffDelimiter('a\tb\tc')).toBe('\t');
    expect(parser.sniffDelimiter('a|b|c')).toBe('|');
  });

  test('ignores delimiters inside quotes', () => {
    expect(parser.sniffDelimiter('"one, two";three;four')).toBe(';');
  });
});
