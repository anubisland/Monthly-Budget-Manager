/**
 * Reading a bank statement pasted as CSV — the browser twin of
 * mobile/src/budget_manager_mobile/statement.py.
 *
 * A bank gives you a date, a description and an amount; the app's own CSV
 * export gives you a `type` column saying which side of the ledger a row
 * belongs to. Those are different problems, so this reads the first and
 * leaves the second to importCsv().
 *
 * Nothing here writes anything. Parsing produces candidate rows for the user
 * to look at; committing them is a separate step, because dropping two hundred
 * rows into someone's budget unseen is not an import, it is an accident.
 */
(function () {
  'use strict';

  // Header names seen in real exports, lowercased. Matching is by substring so
  // "Transaction Date" and "Value date" both find the date column.
  var DATE_HEADERS = ['date', 'posted', 'transaction date', 'value date', 'التاريخ'];
  var NAME_HEADERS = [
    'description', 'details', 'narrative', 'particulars', 'payee',
    'reference', 'memo', 'name', 'البيان', 'الوصف',
  ];
  var AMOUNT_HEADERS = ['amount', 'value', 'المبلغ'];
  var DEBIT_HEADERS = ['debit', 'withdrawal', 'paid out', 'مدين', 'منصرف'];
  var CREDIT_HEADERS = ['credit', 'deposit', 'paid in', 'دائن', 'وارد'];

  var DELIMITERS = [',', ';', '\t', '|'];

  // Rows beyond this are refused outright. A statement of this size is a sign
  // something else was pasted, and parsing it would freeze the page.
  var MAX_ROWS = 2000;

  function _fail(code) {
    var err = new Error(code);
    err.code = code;
    return err;
  }

  /**
   * Work out the delimiter from the header line. Banks vary, and a semicolon
   * file read as commas produces one enormous column that looks like a header
   * problem.
   */
  function sniffDelimiter(text) {
    var lines = String(text).split(/\r?\n/);
    var line = '';
    for (var i = 0; i < lines.length; i++) {
      if (lines[i].trim()) { line = lines[i]; break; }
    }

    var counts = {};
    DELIMITERS.forEach(function (d) { counts[d] = 0; });

    var inQuotes = false;
    for (var j = 0; j < line.length; j++) {
      var ch = line[j];
      if (ch === '"') {
        inQuotes = !inQuotes;
      } else if (!inQuotes && counts[ch] !== undefined) {
        counts[ch]++;
      }
    }

    var best = ',';
    var bestCount = 0;
    DELIMITERS.forEach(function (d) {
      if (counts[d] > bestCount) { bestCount = counts[d]; best = d; }
    });
    return best;
  }

  /** Split CSV text into rows, honouring quotes and doubled quotes. */
  function parseCsvRows(text, delimiter) {
    var rows = [];
    var row = [];
    var field = '';
    var inQuotes = false;

    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
        } else {
          field += ch;
        }
        continue;
      }
      if (ch === '"') { inQuotes = true; continue; }
      if (ch === delimiter) { row.push(field); field = ''; continue; }
      if (ch === '\n') { row.push(field); rows.push(row); row = []; field = ''; continue; }
      if (ch === '\r') continue;
      field += ch;
    }
    row.push(field);
    rows.push(row);

    // A trailing newline should not become a row of its own.
    while (rows.length && rows[rows.length - 1].every(function (c) { return !String(c).trim(); })) {
      rows.pop();
    }
    return rows;
  }

  /**
   * Index of the first header containing any candidate, or -1.
   *
   * Exact matches are preferred over substring ones so that a file with both
   * "Amount" and "Amount in account currency" picks the plain one.
   */
  function findColumn(headers, candidates) {
    var lowered = headers.map(function (h) { return String(h).trim().toLowerCase(); });
    for (var i = 0; i < candidates.length; i++) {
      var exact = lowered.indexOf(candidates[i]);
      if (exact >= 0) return exact;
    }
    for (var index = 0; index < lowered.length; index++) {
      for (var c = 0; c < candidates.length; c++) {
        if (lowered[index].indexOf(candidates[c]) >= 0) return index;
      }
    }
    return -1;
  }

  /**
   * Rewrite a number into the one convention the app understands.
   *
   * The most dangerous function here. A comma is a thousands separator in the
   * app's own data and a decimal point in half the world's banks: read that
   * way "1.200,00" becomes 1.2 and "1200,00" becomes 120000 — a hundred times
   * the rent. Both results are plausible numbers, so nothing downstream would
   * question them.
   *
   * The rules, in order:
   *  - both separators present: the rightmost is the decimal point;
   *  - one separator appearing more than once: grouping;
   *  - one separator followed by exactly three digits: grouping ("1,200" is
   *    genuinely ambiguous; bank amounts carry two decimals);
   *  - otherwise: a decimal point.
   */
  function normaliseSeparators(text) {
    var s = String(text);
    var lastDot = s.lastIndexOf('.');
    var lastComma = s.lastIndexOf(',');

    if (lastDot >= 0 && lastComma >= 0) {
      if (lastComma > lastDot) return s.split('.').join('').replace(',', '.');
      return s.replace(/,/g, '');
    }

    var separator = lastDot >= 0 ? '.' : (lastComma >= 0 ? ',' : '');
    if (!separator) return s;
    if (s.split(separator).length - 1 > 1) return s.split(separator).join('');
    if (s.length - s.lastIndexOf(separator) - 1 === 3) return s.split(separator).join('');
    return s.replace(separator, '.');
  }

  /**
   * A statement amount, sign preserved.
   *
   * Banks write negatives three ways — a minus, parentheses, or a trailing DR
   * — and separators differ by locale. The sign is stripped here, the
   * magnitude checked, and the sign reapplied.
   */
  function parseAmount(raw) {
    if (raw === null || raw === undefined) return null;
    var text = String(raw).trim();
    if (!text) return null;

    var negative = false;
    if (text.charAt(0) === '(' && text.charAt(text.length - 1) === ')') {
      negative = true;
      text = text.slice(1, -1);
    }

    var upper = text.replace(/ /g, '').toUpperCase();
    if (upper.slice(-2) === 'DR' || upper.slice(-2) === 'DB') {
      negative = true;
      text = text.slice(0, -2).trim();
    } else if (upper.slice(-2) === 'CR') {
      text = text.slice(0, -2).trim();
    }

    if (text.charAt(0) === '-') {
      negative = true;
      text = text.slice(1);
    } else if (text.charAt(0) === '+') {
      text = text.slice(1);
    }

    text = text.split('\u00a0').join('').split(' ').join('');
    ['$', '\u00a3', '\u20ac', '\u062c.\u0645', 'EGP', 'USD'].forEach(function (symbol) {
      text = text.split(symbol).join('');
    });

    text = normaliseSeparators(text);
    if (!/^(\d+(\.\d+)?|\.\d+)$/.test(text)) return null;
    var magnitude = parseFloat(text);
    if (isNaN(magnitude)) return null;
    return negative ? -magnitude : magnitude;
  }

  function _validYmd(s) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var d = new Date(s + 'T00:00:00Z');
    return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
  }

  /** ISO, or day/month/year with any of - / . as the separator. */
  function readDate(raw) {
    if (!raw) return null;
    var head = String(raw).trim().slice(0, 10);
    if (_validYmd(head)) return head;

    var separators = ['/', '-', '.'];
    for (var s = 0; s < separators.length; s++) {
      var parts = String(raw).trim().split(separators[s]);
      if (parts.length !== 3) continue;
      var digits = parts.every(function (p) { return /^\d+$/.test(p.trim()); });
      if (!digits) continue;
      var day = parts[0].trim();
      var monthPart = parts[1].trim();
      var year = parts[2].trim();
      if (year.length === 2) year = '20' + year;
      var candidate = year + '-' + _pad2(parseInt(monthPart, 10)) + '-' + _pad2(parseInt(day, 10));
      if (_validYmd(candidate)) return candidate;
    }
    return null;
  }

  function _pad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  function _cell(row, index) {
    if (index < 0 || index >= row.length) return '';
    return row[index];
  }

  function _columns(headers) {
    return {
      date: findColumn(headers, DATE_HEADERS),
      name: findColumn(headers, NAME_HEADERS),
      amount: findColumn(headers, AMOUNT_HEADERS),
      debit: findColumn(headers, DEBIT_HEADERS),
      credit: findColumn(headers, CREDIT_HEADERS),
    };
  }

  /**
   * Positive for money in, negative for money out.
   *
   * Two layouts exist and they disagree about sign. A single amount column
   * carries it; separate debit and credit columns are both written positive,
   * and the column decides. Reading the second as the first turns every
   * withdrawal into income.
   */
  function _signedAmount(row, columns) {
    if (columns.amount >= 0) {
      var amount = parseAmount(_cell(row, columns.amount));
      if (amount !== null && amount !== 0) return amount;
    }
    var debit = columns.debit >= 0 ? parseAmount(_cell(row, columns.debit)) : null;
    if (debit) return -Math.abs(debit);
    var credit = columns.credit >= 0 ? parseAmount(_cell(row, columns.credit)) : null;
    if (credit) return Math.abs(credit);
    return null;
  }

  /**
   * The row's date if readable and inside `month`, else the 1st.
   *
   * A date from another month is dropped rather than kept: the import lands in
   * one month, and a row dated outside it would claim to belong somewhere it
   * is not stored.
   */
  function _date(row, columns, month) {
    var parsed = readDate(_cell(row, columns.date));
    if (parsed && parsed.slice(0, 7) === month) return parsed;
    return month + '-01';
  }

  /**
   * One candidate row, or null if it cannot be trusted.
   *
   * Skipped rather than guessed at: a statement usually carries running-balance
   * lines and section headers among the transactions, and inventing a value for
   * those would import money that was never spent.
   */
  function _entry(row, columns, month) {
    var name = String(_cell(row, columns.name)).trim();
    if (!name) return null;

    var amount = _signedAmount(row, columns);
    if (amount === null || amount === 0) return null;

    return {
      name: name,
      amount: Math.round(Math.abs(amount) * 100) / 100,
      kind: amount > 0 ? 'income' : 'expense',
      date: _date(row, columns, month),
    };
  }

  /**
   * Read pasted CSV into candidate rows for `month`.
   *
   * Returns the rows plus counts of what was skipped, so the user can see that
   * 40 lines produced 38 rows rather than wondering where two went. Throws an
   * Error carrying a `code` the UI translates.
   */
  function parse(text, month) {
    if (!text || !String(text).trim()) throw _fail('empty');

    var body = String(text).trim();
    var rows = parseCsvRows(body, sniffDelimiter(body));
    if (!rows.length) throw _fail('empty');
    if (rows.length > MAX_ROWS + 1) throw _fail('tooManyRows');

    var columns = _columns(rows[0]);
    if (columns.name < 0) throw _fail('noDescription');
    if (columns.amount < 0 && columns.debit < 0 && columns.credit < 0) throw _fail('noAmount');

    var entries = [];
    var skipped = 0;
    for (var i = 1; i < rows.length; i++) {
      var entry = _entry(rows[i], columns, month);
      if (entry === null) skipped++; else entries.push(entry);
    }
    return { entries: entries, skipped: skipped, read: rows.length - 1 };
  }

  function _key(name, amount, date) {
    return String(name).trim().toLowerCase() + '|' + Number(amount).toFixed(2) + '|' + String(date);
  }

  /**
   * Flag candidates that already exist in `data`.
   *
   * Pasting the same statement twice is the obvious mistake, and an import
   * that silently doubled a month would be worse than one that refused to run.
   * Matching is on name, amount and date together — the three a bank line
   * carries — and a repeat within the paste is flagged too, since the same
   * coffee bought twice on one day is indistinguishable from a duplicated row.
   *
   * Flagged, not removed: only the user knows whether they really did buy the
   * same coffee twice, so the decision is theirs at the preview.
   */
  function markDuplicates(entries, data) {
    var existing = {};
    var rows = (data.incomes || []).concat(data.expenses || []);
    rows.forEach(function (row) {
      existing[_key(row.name, row.amount, row.date || '')] = true;
    });

    var seen = {};
    entries.forEach(function (entry) {
      var key = _key(entry.name, entry.amount, entry.date);
      entry.duplicate = existing[key] === true || seen[key] === true;
      seen[key] = true;
    });
    return entries;
  }

  window.statementParser = {
    parse: parse,
    markDuplicates: markDuplicates,
    parseAmount: parseAmount,
    normaliseSeparators: normaliseSeparators,
    findColumn: findColumn,
    readDate: readDate,
    sniffDelimiter: sniffDelimiter,
    parseCsvRows: parseCsvRows,
    MAX_ROWS: MAX_ROWS,
  };
})();
