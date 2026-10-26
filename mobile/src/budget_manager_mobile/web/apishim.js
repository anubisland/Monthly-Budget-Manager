/**
 * The localStorage twin of the mobile app's local HTTP API.
 *
 * The page in this folder talks to a Python server on Android; the same page
 * served from GitHub Pages has no server, so this file answers the same
 * /api/* routes from localStorage with the same JSON shapes:
 *
 *  - validation and error text mirror mobile/src/budget_manager_mobile/api.py
 *    and validate.py, so the page's toasts say the same thing on both hosts;
 *  - the stored document is the exact to_doc() shape (version 2), so backups
 *    written by the mobile app restore here and vice versa;
 *  - GET /api/data and every POST success return api_state(), which is what
 *    the page re-renders from.
 *
 * On 127.0.0.1/localhost the real Python server is behind these paths, so the
 * whole file does nothing at all there.
 */
(function () {
  'use strict';

  // Android serves the WebView from the loopback interface. Any other origin
  // is Pages (or a dev server) with no Python behind /api/*.
  if (/^(127\.0\.0\.1|localhost)$/.test(window.location.hostname)) return;

  var DOC_KEY = 'bm.data';
  var SETTINGS_KEY = 'bm.settings';
  var BEFORE_RESTORE_PREFIX = 'bm.before-restore-';

  var SCHEMA_VERSION = 2;
  var APP_VERSION = '2.1.0-web';
  var SAVINGS_CATEGORY = 'Savings';
  var MAX_AMOUNT = 1e12;
  var UNWRITABLE = /[\x00-\x1f\x7f"\\]/;
  var DEFAULT_SPAN = 6;
  var MIN_DAYS = 4;

  // Same palette as app.py's CAT_COLORS: api_state carries the colour with
  // the category, so the two hosts must not disagree on it.
  var CAT_COLORS = {
    'Food': '#FF6B6B', 'Rent': '#4ECDC4', 'Fuel': '#FFE66D', 'Electricity': '#FFD93D',
    'Internet': '#6BCB77', 'Water': '#4D96FF', 'Transport': '#FF6B35', 'Healthcare': '#FF4757',
    'Entertainment': '#A29BFE', 'Education': '#00CEC9', 'Clothing': '#FD79A8', 'Savings': '#00B894',
    'Debt': '#E17055', 'Subscriptions': '#0984E3', 'Gifts': '#E84393', 'Misc': '#636E72',
    'Uncategorized': '#B2BEC3',
  };

  // The JS parser (web/statement.js) reports codes; the page expects the
  // Python parser's wording wrapped in the same sentence as api.py does.
  var STATEMENT_ERROR_TEXT = {
    empty: 'nothing to read',
    tooManyRows: 'too many rows (limit 2000)',
    noDescription: 'no description column found',
    noAmount: 'no amount column found',
  };

  /** A request we will not carry out, with the status to answer. Mirrors errors.ApiError. */
  function ApiError(message, status, detail) {
    this.message = message;
    this.status = status || 400;
    if (detail) this.detail = detail;
  }
  ApiError.prototype = Object.create(Error.prototype);

  // ── small helpers ──────────────────────────────────────────────────────────
  function round2(n) { return Math.round(n * 100) / 100; }
  function round1(n) { return Math.round(n * 10) / 10; }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function pad4(n) { return String(n).padStart(4, '0'); }

  function todayIso() {
    var d = new Date();
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function thisMonth() { return todayIso().slice(0, 7); }
  function todayParts() {
    var d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() + 1, day: d.getDate() };
  }
  function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }
  function asList(value) { return Array.isArray(value) ? value : []; }

  // ── month keys (port of store.py) ──────────────────────────────────────────
  function isMonthKey(key) {
    if (key === null || key === undefined) return false;
    var parts = String(key).split('-');
    if (parts.length !== 2) return false;
    if (parts[0].length !== 4 || parts[1].length !== 2) return false;
    if (!/^\d{4}$/.test(parts[0]) || !/^\d{2}$/.test(parts[1])) return false;
    var year = parseInt(parts[0], 10), month = parseInt(parts[1], 10);
    return month >= 1 && month <= 12 && year >= 1;
  }

  function monthKey(year, month) {
    return pad4(Math.trunc(Number(year))) + '-' + pad2(Math.trunc(Number(month)));
  }

  function shiftMonth(key, delta) {
    var parts = String(key).split('-');
    var total = parseInt(parts[0], 10) * 12 + (parseInt(parts[1], 10) - 1) + delta;
    return monthKey(Math.floor(total / 12), (total % 12) + 1);
  }

  // ── validators (port of validate.py) ───────────────────────────────────────
  function validateText(value, limit) {
    if (typeof value !== 'string') return null;
    var cleaned = value.split(/\s+/).filter(function (p) { return p; }).join(' ');
    if (!cleaned) return null;
    return cleaned.slice(0, limit === undefined ? 120 : limit);
  }

  // Python's float() accepts 'inf'/'nan' and validate.py rejects them again;
  // refusing them here lands on the same None either way.
  var NUMERIC = /^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/;

  function validateAmount(value, allowZero) {
    if (typeof value === 'boolean') return null;
    var result;
    if (typeof value === 'number') {
      result = value;
    } else if (typeof value === 'string') {
      var cleaned = value.split(',').join('').split('\u066c').join('').trim();
      if (!NUMERIC.test(cleaned)) return null;
      result = parseFloat(cleaned);
    } else {
      return null;
    }
    if (isNaN(result) || !isFinite(result)) return null;
    if (Math.abs(result) > MAX_AMOUNT) return null;
    if (result < 0) return null;
    if (result === 0 && !allowZero) return null;
    return round2(result);
  }

  function validateIndex(value, length) {
    if (typeof value !== 'number' || !Number.isInteger(value)) return null;
    if (!(0 <= value && value < length)) return null;
    return value;
  }

  function validateDateText(value) {
    if (typeof value !== 'string') return null;
    var parts = value.trim().split('-');
    if (parts.length !== 3) return null;
    if (!parts.every(function (p) { return /^\d+$/.test(p); })) return null;
    if (parts[0].length !== 4 || parts[1].length !== 2 || parts[2].length !== 2) return null;
    if (!(1 <= parseInt(parts[1], 10) && parseInt(parts[1], 10) <= 12)) return null;
    if (!(1 <= parseInt(parts[2], 10) && parseInt(parts[2], 10) <= 31)) return null;
    return parts.join('-');
  }

  // ── the data model ─────────────────────────────────────────────────────────
  // months: key -> {incomes:[{name,amount,date}], expenses:[+category], total_budget}
  var model = null;
  var session = {
    note: null, dropped: 0,
    pendingRestore: null, restorePreview: null,
    statementPreview: null, lastExport: null, lastImport: null,
  };

  function emptyDoc(current) {
    return { version: SCHEMA_VERSION, current: current, months: {}, goals: [] };
  }

  /** Port of store.migrate: any document we have ever written, up to v2. */
  function migrateDoc(raw, fallbackCurrent) {
    if (!isPlainObject(raw)) return { doc: emptyDoc(fallbackCurrent), note: 'unreadable' };
    if (raw.version === SCHEMA_VERSION) return { doc: coerceV2(raw, fallbackCurrent), note: null };
    if (raw.version === undefined && raw.budget !== undefined) return fromV1(raw, fallbackCurrent);
    if (raw.version === undefined && Object.keys(raw).length === 0) {
      return { doc: emptyDoc(fallbackCurrent), note: null };
    }
    return { doc: emptyDoc(fallbackCurrent), note: 'future-version' };
  }

  function coerceV2(raw, fallbackCurrent) {
    var months = {};
    if (isPlainObject(raw.months)) {
      Object.keys(raw.months).forEach(function (k) {
        if (isMonthKey(k) && isPlainObject(raw.months[k])) months[k] = raw.months[k];
      });
    }
    var doc = {
      version: SCHEMA_VERSION,
      current: isMonthKey(raw.current) ? String(raw.current) : fallbackCurrent,
      months: months,
      goals: asList(raw.goals).filter(isPlainObject),
    };
    ['recurring', 'rules', 'settled'].forEach(function (key) {
      if (key in raw) doc[key] = raw[key];
    });
    return doc;
  }

  function fromV1(raw, fallbackCurrent) {
    var doc = emptyDoc(fallbackCurrent);
    var key = labelOf(raw) || fallbackCurrent;
    if (isPlainObject(raw.budget) && Object.keys(raw.budget).length) doc.months[key] = raw.budget;
    doc.goals = asList(raw.goals).filter(isPlainObject);
    return { doc: doc, note: 'migrated-v1' };
  }

  function labelOf(raw) {
    var key = monthKey(raw.year, raw.month);
    return isMonthKey(key) ? key : null;
  }
  // ── decoding (port of decode.py: drop bad rows, never a whole month) ───────
  function decodeRows(raw, isExpense) {
    if (!Array.isArray(raw)) return { rows: [], dropped: 1 };
    var rows = [], dropped = 0;
    raw.forEach(function (item) {
      if (!isPlainObject(item)) { dropped++; return; }
      var name = validateText(item.name);
      var amount = validateAmount(item.amount, true);
      if (name === null || amount === null) { dropped++; return; }
      var row = { name: name, amount: amount };
      if (isExpense) {
        var cat = validateText(item.category, 40);
        row.category = cat === null ? 'Uncategorized' : cat;
      }
      row.date = validateDateText(item.date);
      rows.push(row);
    });
    return { rows: rows, dropped: dropped };
  }

  function decodeMonth(raw, key) {
    var bm = { incomes: [], expenses: [], total_budget: 0 };
    var dropped = 0;
    var inc = decodeRows(raw.incomes !== undefined ? raw.incomes : [], false);
    var exp = decodeRows(raw.expenses !== undefined ? raw.expenses : [], true);
    dropped += inc.dropped + exp.dropped;
    bm.incomes = inc.rows;
    bm.expenses = exp.rows;
    var budget = validateAmount(raw.total_budget, true);
    bm.total_budget = budget === null ? 0 : budget;
    return { month: bm, dropped: dropped };
  }

  function decodeGoal(raw) {
    if (!isPlainObject(raw)) return null;
    var name = validateText(raw.name);
    var target = validateAmount(raw.target);
    if (name === null || target === null) return null;
    var baseline = validateAmount(raw.current, true);
    return {
      name: name,
      target: target,
      current: baseline === null ? 0 : baseline,
      icon: typeof raw.icon === 'string' ? raw.icon : '\ud83c\udfaf',
      target_month: typeof raw.target_month === 'string' ? raw.target_month : '',
    };
  }

  /** Rules need pattern, category and an id >= 1, exactly like decode.templates. */
  function decodeRules(raw) {
    if (raw === undefined || raw === null) return { list: [], dropped: 0 };
    if (!Array.isArray(raw)) return { list: [], dropped: 1 };
    var list = [], dropped = 0, seen = {};
    raw.forEach(function (item) {
      var rule = decodeRule(item);
      if (rule === null || seen[rule.id] === true) { dropped++; return; }
      seen[rule.id] = true;
      list.push(rule);
    });
    return { list: list, dropped: dropped };
  }

  function decodeRule(item) {
    if (!isPlainObject(item)) return null;
    var pattern = validateText(item.pattern, 60);
    var category = validateText(item.category, 40);
    var id = item.id;
    if (pattern === null || category === null) return null;
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) return null;
    return {
      pattern: pattern,
      category: category,
      enabled: typeof item.enabled === 'boolean' ? item.enabled : true,
      id: id,
    };
  }

  function decodeSettled(raw) {
    if (raw === undefined || raw === null) return { settled: {}, dropped: 0 };
    if (!isPlainObject(raw)) return { settled: {}, dropped: 1 };
    var settled = {}, dropped = 0;
    Object.keys(raw).forEach(function (key) {
      var ids = raw[key];
      if (!isMonthKey(key) || !Array.isArray(ids)) { dropped++; return; }
      var clean = ids.filter(function (i) {
        return typeof i === 'number' && Number.isInteger(i) && i > 0;
      });
      dropped += ids.length - clean.length;
      if (clean.length) settled[key] = clean.slice().sort(function (a, b) { return a - b; });
    });
    return { settled: settled, dropped: dropped };
  }

  function buildModel(doc) {
    var dropped = Number(doc.dropped) || 0;
    var months = {};
    Object.keys(doc.months).forEach(function (key) {
      var decoded = decodeMonth(doc.months[key], key);
      dropped += decoded.dropped;
      months[key] = decoded.month;
    });
    var goals = [];
    doc.goals.forEach(function (raw) {
      var goal = decodeGoal(raw);
      if (goal === null) dropped++; else goals.push(goal);
    });
    var rules = decodeRules(doc.rules);
    dropped += rules.dropped;
    var settled = decodeSettled(doc.settled);
    dropped += settled.dropped;
    var current = isMonthKey(doc.current) ? String(doc.current) : thisMonth();
    if (current > thisMonth()) current = thisMonth();
    return {
      model: {
        current: current, months: months, goals: goals, rules: rules.list,
        recurring: doc.recurring === undefined ? [] : doc.recurring,
        settled: settled.settled,
      },
      dropped: dropped,
    };
  }

  // ── month arithmetic ───────────────────────────────────────────────────────
  function currentMonth() {
    if (!model.months[model.current]) {
      model.months[model.current] = { incomes: [], expenses: [], total_budget: 0 };
    }
    return model.months[model.current];
  }

  function isBlank(bm) { return !bm.incomes.length && !bm.expenses.length && !bm.total_budget; }
  function totalIncome(bm) { return bm.incomes.reduce(function (s, i) { return s + i.amount; }, 0); }
  function totalExpenses(bm) { return bm.expenses.reduce(function (s, e) { return s + e.amount; }, 0); }

  function profitMargin(bm) {
    var income = totalIncome(bm);
    if (income <= 0) return 0;
    return (totalIncome(bm) - totalExpenses(bm)) / income * 100;
  }

  function expensesByCategory(bm) {
    var buckets = {};
    bm.expenses.forEach(function (e) {
      buckets[e.category] = (buckets[e.category] || 0) + e.amount;
    });
    return buckets;
  }

  /** The same reading as core.apply_auto_category: first match wins. */
  function applyAutoCategory(name, rules, fallback) {
    var lowered = String(name === undefined || name === null ? '' : name).toLowerCase();
    var list = Array.isArray(rules) ? rules : [];
    for (var i = 0; i < list.length; i++) {
      var rule = list[i];
      if (!rule || !rule.pattern) continue;
      var pattern = String(rule.pattern).trim().toLowerCase();
      if (pattern && lowered.indexOf(pattern) >= 0) return rule.category;
    }
    return fallback;
  }

  // ── goals (port of goals.py) ───────────────────────────────────────────────
  function deposits(goalName, monthsMap) {
    var total = 0;
    Object.keys(monthsMap).forEach(function (key) {
      monthsMap[key].expenses.forEach(function (e) {
        if (e.category === SAVINGS_CATEGORY && e.name === String(goalName).trim()) {
          total += Number(e.amount) || 0;
        }
      });
    });
    return round2(total);
  }

  function funded(goal, monthsMap) {
    return round2((goal.current || 0) + deposits(goal.name, monthsMap));
  }

  /** A deposit is a Savings expense named for the goal, capped at what is left. */
  function fundGoalInto(goal, bm, amount, dateStr, monthsMap) {
    var already = funded(goal, monthsMap);
    var room = goal.target > 0 ? round2(goal.target - already) : amount;
    var taken = room > 0 ? round2(Math.min(amount, room)) : 0;
    if (taken <= 0) return 0;
    bm.expenses.push({
      name: String(goal.name).trim(), amount: taken,
      category: SAVINGS_CATEGORY, date: dateStr,
    });
    return taken;
  }

  function goalStatus(goal, monthsMap, currentKey) {
    var total = funded(goal, monthsMap);
    var target = Number(goal.target || 0);
    var thisMonthDeposits = (currentKey in monthsMap)
      ? deposits(goal.name, makePair(currentKey, monthsMap[currentKey])) : 0;
    var done = total >= target && target > 0;
    return {
      funded: total,
      remaining: round2(Math.max(target - total, 0)),
      pct: target > 0 ? round1(Math.min(total / target, 1) * 100) : 0,
      done: done,
      this_month: thisMonthDeposits,
      carried_over: startedBefore(goal.name, monthsMap, currentKey) && !done,
    };
  }

  function makePair(key, bm) { var pair = {}; pair[key] = bm; return pair; }

  function startedBefore(goalName, monthsMap, currentKey) {
    return Object.keys(monthsMap).some(function (key) {
      return key < currentKey && deposits(goalName, makePair(key, monthsMap[key])) > 0;
    });
  }

  // ── pace (port of pace.py) ─────────────────────────────────────────────────
  function daysIn(year, month) { return new Date(year, month, 0).getDate(); }

  function elapsed(year, month, today) {
    var total = daysIn(year, month);
    if (year * 12 + month < today.y * 12 + today.m) return 1.0;
    if (year * 12 + month > today.y * 12 + today.m) return 0.0;
    return Math.min(today.day, total) / total;
  }

  function forecast(spent, year, month, today) {
    if (year !== today.y || month !== today.m) return null;
    if (today.day < MIN_DAYS) return null;
    var share = elapsed(year, month, today);
    if (share <= 0 || spent <= 0) return null;
    return round2(spent / share);
  }

  function marginAt(share) {
    var taper = 0.10 + Math.max(0, 1 - share) * 0.25;
    return Math.min(taper, Math.max(0, 1 - share) * 0.5);
  }

  function paceStatus(spent, budget, year, month, today) {
    var share = elapsed(year, month, today);
    var result = {
      elapsed: round1(share * 100),
      spent: round2(spent),
      budget: round2(budget),
      projected: forecast(spent, year, month, today),
      days_left: (year === today.y && month === today.m)
        ? Math.max(daysIn(year, month) - today.day, 0) : 0,
      state: 'no_budget',
      used: 0.0,
    };
    if (year * 12 + month > today.y * 12 + today.m) { result.state = 'not_started'; return result; }
    if (budget <= 0) return result;
    var used = spent / budget;
    result.used = round1(used * 100);
    if (used >= 1.0) result.state = 'over';
    else if (used > share + marginAt(share)) result.state = 'ahead';
    else result.state = 'on_track';
    return result;
  }

  // ── trend (port of trend.py) ───────────────────────────────────────────────
  function trendSeries(monthsMap, current) {
    var span = Math.max(1, Math.min(DEFAULT_SPAN, 24));
    var points = [];
    for (var offset = -(span - 1); offset <= 0; offset++) {
      var key = shiftMonth(current, offset);
      var bm = monthsMap[key];
      if (!bm || (!bm.incomes.length && !bm.expenses.length)) {
        points.push({ month: key, income: 0.0, expenses: 0.0, net: 0.0, empty: true });
      } else {
        points.push({
          month: key,
          income: round2(totalIncome(bm)),
          expenses: round2(totalExpenses(bm)),
          net: round2(totalIncome(bm) - totalExpenses(bm)),
          empty: false,
        });
      }
    }
    return points;
  }

  function trendAverages(points) {
    var filled = points.filter(function (p) { return !p.empty; });
    if (!filled.length) return { months: 0, income: 0.0, expenses: 0.0, net: 0.0 };
    function mean(field) {
      return round2(filled.reduce(function (s, p) { return s + p[field]; }, 0) / filled.length);
    }
    return { months: filled.length, income: mean('income'), expenses: mean('expenses'), net: mean('net') };
  }
  // ── the document (the exact to_doc() shape, so mobile backups round-trip) ───
  function roundMap(map) {
    var out = {};
    Object.keys(map).forEach(function (k) { out[k] = round2(map[k]); });
    return out;
  }

  function pctMap(byCat, base) {
    var out = {};
    Object.keys(byCat).forEach(function (k) {
      out[k] = base > 0 ? round2(byCat[k] / base * 100) : 0;
    });
    return out;
  }

  function monthToDict(bm, key) {
    var income = totalIncome(bm), expenses = totalExpenses(bm), net = income - expenses;
    var byCat = expensesByCategory(bm);
    return {
      month: key,
      incomes: bm.incomes.map(function (i) {
        return { name: i.name, amount: i.amount, date: i.date === undefined ? null : i.date };
      }),
      expenses: bm.expenses.map(function (e) {
        return {
          name: e.name, amount: e.amount, category: e.category,
          date: e.date === undefined ? null : e.date,
        };
      }),
      budget_limits: {},
      total_budget: bm.total_budget,
      totals: {
        income: round2(income), expenses: round2(expenses),
        net: round2(net), profit_margin_pct: round2(profitMargin(bm)),
      },
      breakdown: {
        by_category: roundMap(byCat),
        percent_of_income: pctMap(byCat, income),
        percent_of_expenses: pctMap(byCat, expenses),
      },
    };
  }

  function toDoc() {
    var months = {};
    Object.keys(model.months).forEach(function (key) {
      if (!isBlank(model.months[key])) months[key] = monthToDict(model.months[key], key);
    });
    var settled = {};
    Object.keys(model.settled).forEach(function (key) {
      var ids = model.settled[key];
      if (ids && ids.length) settled[key] = ids.slice().sort(function (a, b) { return a - b; });
    });
    return {
      version: SCHEMA_VERSION,
      current: model.current,
      months: months,
      goals: model.goals.map(function (g) {
        return { name: g.name, target: g.target, current: g.current, icon: g.icon, target_month: g.target_month };
      }),
      recurring: model.recurring,
      rules: model.rules.map(function (r) {
        return { pattern: r.pattern, category: r.category, enabled: r.enabled, id: r.id };
      }),
      settled: settled,
    };
  }

  function saveDoc() {
    try {
      localStorage.setItem(DOC_KEY, JSON.stringify(toDoc()));
    } catch (err) {
      throw new ApiError('could not save', 507, String(err && err.message || err));
    }
    // Every note describes a state the stored document has now resolved —
    // a corrupt load included: after this save, bm.data is valid again.
    if (session.note === 'migrated-v1' || session.note === 'partial' ||
        session.note === 'corrupt') {
      session.note = null;
      session.dropped = 0;
    }
  }

  // ── settings (own key; app.py's startup defaults are the fallback) ─────────
  function settings() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(SETTINGS_KEY)); } catch (err) { raw = null; }
    if (!isPlainObject(raw)) return { lang: 'ar', currency: 'EGP', dark: false };
    return {
      lang: (raw.lang === 'en' || raw.lang === 'ar') ? raw.lang : 'ar',
      currency: raw.currency || 'EGP',
      dark: !!raw.dark,
    };
  }

  function saveSettings(next) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch (err) { /* settings, not data */ }
  }

  // ── state for the page to render (port of app.api_state) ───────────────────
  function knownMonths() {
    return Object.keys(model.months).filter(function (k) { return !isBlank(model.months[k]); }).sort();
  }

  function previousSummary() {
    var key = shiftMonth(model.current, -1);
    var bm = model.months[key];
    if (!bm || (!bm.incomes.length && !bm.expenses.length)) return null;
    return {
      month_key: key,
      total_income: totalIncome(bm),
      total_expenses: totalExpenses(bm),
      net: totalIncome(bm) - totalExpenses(bm),
      categories: expensesByCategory(bm),
    };
  }

  function goalsState() {
    return model.goals.map(function (g) {
      var status = goalStatus(g, model.months, model.current);
      return {
        name: g.name, target: g.target, icon: g.icon,
        current: status.funded,
        remaining: status.remaining,
        pct: status.pct,
        done: status.done,
        this_month: status.this_month,
        carried_over: status.carried_over,
        target_month: g.target_month,
      };
    });
  }

  function categoriesOf(bm) {
    var out = {};
    var byCat = expensesByCategory(bm);
    Object.keys(byCat).forEach(function (c) {
      out[c] = { amount: byCat[c], color: CAT_COLORS[c] || '#B2BEC3' };
    });
    return out;
  }

  function apiState() {
    var bm = currentMonth();
    var parts = model.current.split('-');
    var year = parseInt(parts[0], 10), month = parseInt(parts[1], 10);
    var s = settings();
    var series = trendSeries(model.months, model.current);
    return {
      year: year, month: month,
      month_key: model.current,
      is_current_month: model.current === thisMonth(),
      can_go_back: knownMonths().some(function (k) { return k < model.current; }),
      can_go_forward: model.current < thisMonth(),
      known_months: knownMonths(),
      previous: previousSummary(),
      incomes: bm.incomes.map(function (i) { return { name: i.name, amount: i.amount, date: i.date || '' }; }),
      expenses: bm.expenses.map(function (e) {
        return { name: e.name, amount: e.amount, category: e.category, date: e.date || '' };
      }),
      total_income: totalIncome(bm),
      total_expenses: totalExpenses(bm),
      net: totalIncome(bm) - totalExpenses(bm),
      margin: profitMargin(bm),
      categories: categoriesOf(bm),
      total_budget: bm.total_budget,
      goals: goalsState(),
      dark: s.dark, lang: s.lang, currency: s.currency,
      version: APP_VERSION,
      today: todayIso(),
      note: session.note,
      dropped: session.dropped,
      last_export: session.lastExport,
      restore_preview: session.restorePreview,
      statement_preview: session.statementPreview,
      last_import: session.lastImport,
      pace: paceStatus(totalExpenses(bm), bm.total_budget, year, month, todayParts()),
      trend: series,
      trend_avg: trendAverages(series),
    };
  }

  // ── entry helpers (port of api.py) ─────────────────────────────────────────
  function defaultDate() {
    if (model.current === thisMonth()) return todayIso();
    return model.current + '-01';
  }

  function entryDate(d) {
    if (d.date === undefined || d.date === null || d.date === '') return defaultDate();
    var parsed = validateDateText(d.date);
    if (parsed === null) throw new ApiError('date must be YYYY-MM-DD');
    return parsed;
  }

  function entryFields(d) {
    var name = validateText(d.name);
    if (name === null) throw new ApiError('a name is required');
    var amount = validateAmount(d.amount);
    if (amount === null) throw new ApiError('amount must be a positive number');
    return { name: name, amount: amount, date: entryDate(d) };
  }

  function categoryFor(d, name) {
    var chosen = validateText(d.category, 40);
    if (chosen) return chosen;
    return applyAutoCategory(name, model.rules, 'Uncategorized');
  }

  function rowIndex(d, rows) {
    var index = validateIndex(d.index, rows.length);
    if (index === null) throw new ApiError('no such row', 404);
    return index;
  }

  function applyEdits(row, d, fields) {
    var validators = {
      name: function (v) { return validateText(v); },
      amount: function (v) { return validateAmount(v); },
      category: function (v) { return validateText(v, 40); },
      date: function (v) { return validateDateText(v); },
    };
    // Validate every supplied field before writing any, so a rejected edit
    // cannot land half-applied — the same all-or-nothing rule as _apply_edits.
    var accepted = {};
    fields.forEach(function (field) {
      if (!(field in d)) return;
      var value = validators[field](d[field]);
      if (value === null || value === undefined) throw new ApiError('invalid ' + field);
      accepted[field] = value;
    });
    fields.forEach(function (field) {
      if (field in accepted) row[field] = accepted[field];
    });
  }

  function goTo(key) {
    if (!isMonthKey(key) || String(key) > thisMonth()) return false;
    model.current = String(key);
    return true;
  }

  function currencySymbol(value) {
    if (value === undefined || value === null) return null;
    var symbol = validateText(value, 8);
    if (symbol === null || UNWRITABLE.test(symbol)) {
      throw new ApiError('that currency cannot be written to a spreadsheet');
    }
    return symbol;
  }
  // ── route handlers ─────────────────────────────────────────────────────────
  function doAddIncome(d) {
    var f = entryFields(d);
    currentMonth().incomes.push({ name: f.name, amount: f.amount, date: f.date });
  }

  function doAddExpense(d) {
    var f = entryFields(d);
    currentMonth().expenses.push({
      name: f.name, amount: f.amount, category: categoryFor(d, f.name), date: f.date,
    });
  }

  function doDeleteIncome(d) {
    var rows = currentMonth().incomes;
    rows.splice(rowIndex(d, rows), 1);
  }

  function doDeleteExpense(d) {
    var rows = currentMonth().expenses;
    rows.splice(rowIndex(d, rows), 1);
  }

  function doEditIncome(d) {
    var rows = currentMonth().incomes;
    applyEdits(rows[rowIndex(d, rows)], d, ['name', 'amount', 'date']);
  }

  function doEditExpense(d) {
    var rows = currentMonth().expenses;
    applyEdits(rows[rowIndex(d, rows)], d, ['name', 'amount', 'category', 'date']);
  }

  function doSetMonth(d) {
    if (!goTo(d.month)) throw new ApiError('that month cannot be shown');
  }

  function doStepMonth(d) {
    var delta = d.delta;
    if (delta !== -1 && delta !== 1) throw new ApiError('delta must be -1 or 1');
    if (!goTo(shiftMonth(model.current, delta))) throw new ApiError('no month there');
  }

  function doAddGoal(d) {
    var name = validateText(d.name);
    var target = validateAmount(d.target);
    if (name === null) throw new ApiError('a goal needs a name');
    if (target === null) throw new ApiError('a goal needs a positive target');
    var exists = model.goals.some(function (g) { return g.name === name; });
    if (exists) throw new ApiError('a goal with that name already exists');
    // Deposits join to goals by name, and deleting a goal leaves its deposits
    // where they were spent; reusing the name would inherit that progress.
    if (deposits(name, model.months) > 0) {
      throw new ApiError('that name still has past deposits; choose another');
    }
    var icon = validateText(d.icon, 8) || '\ud83c\udfaf';
    model.goals.push({ name: name, target: target, current: 0, icon: icon, target_month: '' });
  }

  function doDeleteGoal(d) {
    model.goals.splice(rowIndex(d, model.goals), 1);
  }

  function doFundGoal(d) {
    var idx = validateIndex(d.index, model.goals.length);
    if (idx === null) throw new ApiError('no such goal', 404);
    var amount = validateAmount(d.amount);
    if (amount === null) throw new ApiError('amount must be a positive number');
    var taken = fundGoalInto(model.goals[idx], currentMonth(), amount, defaultDate(), model.months);
    if (taken <= 0) throw new ApiError('that goal is already fully funded');
  }

  function doSyncApply(d) {
    var raw = d.doc;
    if (!isPlainObject(raw)) throw new ApiError('doc must be a saved document of this app');
    var migrated = migrateDoc(raw, thisMonth());
    if (migrated.note === 'unreadable' || migrated.note === 'future-version') {
      throw new ApiError('that document was not written by this app');
    }
    // The last local document before a pull, on a side key: on the phone this
    // is the before-sync file, and the browser is owed the same undo.
    try {
      localStorage.setItem(DOC_KEY + '.presync', JSON.stringify(toDoc()));
    } catch (err) { /* full or private mode: the cloud itself is the other copy */ }
    var built = buildModel(migrated.doc);
    model = built.model;
    session.dropped = built.dropped;
    session.note = migrated.note || (built.dropped ? 'partial' : null);
  }

  function doSetBudget(d) {
    var amount = validateAmount(d.total_budget, true);
    if (amount === null) throw new ApiError('budget must be zero or a positive number');
    currentMonth().total_budget = amount;
  }

  function doToggleTheme() {
    var s = settings();
    s.dark = !s.dark;
    saveSettings(s);
  }

  function doSetLanguage(d) {
    if (d.lang !== 'en' && d.lang !== 'ar') throw new ApiError('unsupported language');
    var s = settings();
    s.lang = d.lang;
    saveSettings(s);
  }

  function doSetCurrency(d) {
    var currency = currencySymbol(d.currency);
    if (currency === null) throw new ApiError('a currency is required');
    var s = settings();
    s.currency = currency;
    saveSettings(s);
  }

  function doReset() {
    model.months = {};
    model.goals = [];
    model.recurring = [];
    model.rules = [];
    model.settled = {};
    model.current = thisMonth();
  }

  // ── downloads (the browser's answer to the share sheet) ────────────────────
  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime });
    var url = URL.createObjectURL(blob);
    var anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  function csvCell(value) {
    var text = String(value === undefined || value === null ? '' : value);
    return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;
  }

  function doExport(d) {
    var key = isMonthKey(d.month) ? String(d.month) : model.current;
    var bm = model.months[key] || { incomes: [], expenses: [], total_budget: 0 };
    var lines = ['type,name,category,amount,date'];
    bm.incomes.forEach(function (i) {
      lines.push(['income', csvCell(i.name), '', i.amount, i.date || ''].join(','));
    });
    bm.expenses.forEach(function (e) {
      lines.push(['expense', csvCell(e.name), csvCell(e.category), e.amount, e.date || ''].join(','));
    });
    var name = 'budget-' + key + '.csv';
    try {
      download(name, lines.join('\n') + '\n', 'text/csv;charset=utf-8');
    } catch (err) {
      throw new ApiError(String(err && err.message || err), 500);
    }
    session.lastExport = { path: name, shared: false, reason: 'downloaded by the browser' };
  }

  function doBackupFile() {
    var name = 'budget-backup-' + model.current + '.json';
    try {
      download(name, JSON.stringify(toDoc(), null, 2), 'application/json');
    } catch (err) {
      throw new ApiError('could not write the backup: ' + String(err && err.message || err), 507);
    }
    session.lastExport = { path: name, shared: false, reason: 'downloaded by the browser' };
  }

  // ── restoring (preview first, then apply; mirrors api.py) ──────────────────
  function monthSummary(bm) {
    if (!bm) return null;
    return {
      entries: bm.incomes.length + bm.expenses.length,
      income: round2(totalIncome(bm)),
      expenses: round2(totalExpenses(bm)),
    };
  }

  function difference(a, b) {
    var keys = Object.keys(a.months).concat(Object.keys(b.months));
    var unique = keys.filter(function (k, i) { return keys.indexOf(k) === i; }).sort();
    return {
      months: unique.map(function (key) {
        return { month: key, mine: monthSummary(a.months[key]), theirs: monthSummary(b.months[key]) };
      }),
      goals_now: a.goals.length,
      goals_after: b.goals.length,
    };
  }

  function doPreviewRestore(d) {
    var text = d.text;
    if (typeof text !== 'string' || !text.trim()) {
      throw new ApiError('paste the contents of a backup file');
    }
    var raw;
    try {
      raw = JSON.parse(text);
    } catch (err) {
      throw new ApiError('that is not a readable backup: ' + err.message);
    }
    var migrated = migrateDoc(raw, thisMonth());
    if (migrated.note === 'unreadable' || migrated.note === 'future-version') {
      throw new ApiError('that file was not written by this app');
    }
    session.pendingRestore = { doc: migrated.doc, model: buildModel(migrated.doc) };
    session.restorePreview = difference(model, session.pendingRestore.model);
  }

  function doRestore() {
    if (session.pendingRestore === null) {
      throw new ApiError('nothing has been previewed to restore', 409);
    }
    // A restore is reversible for exactly as long as this copy survives.
    var name = BEFORE_RESTORE_PREFIX + model.current + '.json';
    try {
      localStorage.setItem(name, JSON.stringify(toDoc(), null, 2));
    } catch (err) {
      throw new ApiError('could not save the current data first: ' + String(err && err.message || err), 507);
    }
    model = session.pendingRestore.model;
    session.pendingRestore = null;
    session.restorePreview = null;
    session.lastExport = { path: name, shared: false, reason: 'kept as a safety copy' };
  }

  // ── statement import (two steps, mirroring api.py) ─────────────────────────
  function doPreviewStatement(d) {
    var text = d.text;
    if (typeof text !== 'string' || !text.trim()) throw new ApiError('paste the statement text');
    var parser = window.statementParser;
    if (!parser) throw new ApiError('could not read that statement: no parser available', 500);
    var parsed;
    try {
      parsed = parser.parse(text, model.current);
    } catch (err) {
      throw new ApiError('could not read that statement: ' + (STATEMENT_ERROR_TEXT[err.code] || err.message));
    }
    var entries = parser.markDuplicates(parsed.entries, currentMonth());
    session.statementPreview = {
      month: model.current,
      entries: entries,
      read: parsed.read,
      skipped: parsed.skipped,
      duplicates: entries.filter(function (e) { return e.duplicate; }).length,
    };
  }

  function doImportStatement(d) {
    var preview = session.statementPreview;
    if (preview === null) throw new ApiError('nothing has been previewed to import', 409);
    if (preview.month !== model.current) {
      throw new ApiError('the month changed since the preview; read it again', 409);
    }
    var include = ('include_duplicates' in d) ? d.include_duplicates : false;
    if (typeof include !== 'boolean') throw new ApiError('include_duplicates must be true or false');
    var bm = currentMonth(), added = 0, skipped = 0;
    preview.entries.forEach(function (entry) {
      if (entry.duplicate && !include) { skipped++; return; }
      if (entry.kind === 'income') {
        bm.incomes.push({ name: entry.name, amount: entry.amount, date: entry.date });
      } else {
        bm.expenses.push({
          name: entry.name, amount: entry.amount, date: entry.date,
          category: applyAutoCategory(entry.name, model.rules, 'Uncategorized'),
        });
      }
      added++;
    });
    session.statementPreview = null;
    session.lastImport = { month: preview.month, added: added, skipped: skipped };
  }

  // ── routing (the same table, the same persist-after semantics) ─────────────
  var ROUTES = {
    '/api/add-income': doAddIncome,
    '/api/add-expense': doAddExpense,
    '/api/delete-income': doDeleteIncome,
    '/api/delete-expense': doDeleteExpense,
    '/api/edit-income': doEditIncome,
    '/api/edit-expense': doEditExpense,
    '/api/set-month': doSetMonth,
    '/api/step-month': doStepMonth,
    '/api/add-goal': doAddGoal,
    '/api/delete-goal': doDeleteGoal,
    '/api/fund-goal': doFundGoal,
    '/api/export': doExport,
    '/api/backup-file': doBackupFile,
    '/api/preview-restore': doPreviewRestore,
    '/api/restore': doRestore,
    '/api/sync-apply': doSyncApply,
    '/api/preview-statement': doPreviewStatement,
    '/api/import-statement': doImportStatement,
    '/api/set-budget': doSetBudget,
    '/api/toggle-theme': doToggleTheme,
    '/api/set-language': doSetLanguage,
    '/api/set-currency': doSetCurrency,
    '/api/reset': doReset,
  };

  var SETTINGS_ROUTES = { '/api/toggle-theme': 1, '/api/set-language': 1, '/api/set-currency': 1 };
  var READ_ONLY_ROUTES = {
    '/api/export': 1, '/api/backup-file': 1, '/api/preview-restore': 1, '/api/preview-statement': 1,
  };

  function dispatch(route, payload) {
    var handler = ROUTES[route];
    if (!handler) throw new ApiError('no such endpoint: ' + route, 404);
    handler(payload);
    if (READ_ONLY_ROUTES[route]) return apiState();
    if (!SETTINGS_ROUTES[route]) saveDoc();
    return apiState();
  }

  function readPayload(raw) {
    if (!raw) return {};
    var payload;
    try {
      payload = JSON.parse(raw);
    } catch (err) {
      throw new ApiError('malformed JSON body');
    }
    if (!isPlainObject(payload)) throw new ApiError('body must be a JSON object');
    return payload;
  }

  // ── the fetch patch ────────────────────────────────────────────────────────
  var originalFetch = typeof window.fetch === 'function' ? window.fetch.bind(window) : null;

  function delegate(input, init) {
    if (!originalFetch) return Promise.reject(new Error('no fetch available for this URL'));
    return originalFetch(input, init);
  }

  function resolvePathname(input) {
    var href = typeof input === 'string' ? input
      : (input && typeof input.url === 'string' ? input.url : null);
    if (href === null) return null;
    return new URL(href, window.location.href).pathname;
  }

  // Matched on the last path segment so the Pages base path
  // (/Monthly-Budget-Manager/) is irrelevant.
  function apiRoute(pathname) {
    var match = pathname && pathname.match(/\/api\/[a-z0-9-]+$/);
    return match ? match[0] : null;
  }

  function bodyText(input, init) {
    if (init && init.body !== undefined && init.body !== null) {
      return Promise.resolve(typeof init.body === 'string' ? init.body : '');
    }
    if (input && typeof input.text === 'function') return input.text();
    return Promise.resolve('');
  }

  function handleRequest(pathname, input, init) {
    var route = apiRoute(pathname);
    var method = String((init && init.method) ||
      (input && typeof input !== 'string' && input.method) || 'GET').toUpperCase();
    if (method === 'GET') {
      // do_GET on the Python side answers only these; anything else 404s.
      if (route === '/api/data' || route === '/api/backup') return Promise.resolve(apiState());
      if (route === '/api/doc') return Promise.resolve(toDoc());
      throw new ApiError('not found', 404);
    }
    return bodyText(input, init).then(function (raw) {
      return dispatch(route, readPayload(raw));
    });
  }

  function jsonResponse(obj, status) {
    return new Response(JSON.stringify(obj), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  window.fetch = function (input, init) {
    var pathname;
    try {
      pathname = resolvePathname(input);
    } catch (err) {
      return delegate(input, init);
    }
    if (apiRoute(pathname) === null) return delegate(input, init);
    try {
      return handleRequest(pathname, input, init)
        .then(function (state) { return jsonResponse(state, 200); })
        .catch(function (err) {
          if (err instanceof ApiError) {
            var body = { error: err.message };
            if (err.detail) body.detail = err.detail;
            return jsonResponse(body, err.status);
          }
          return jsonResponse({ error: 'could not handle the request' }, 500);
        });
    } catch (err) {
      if (!(err instanceof ApiError)) throw err;
      var body = { error: err.message };
      if (err.detail) body.detail = err.detail;
      return Promise.resolve(jsonResponse(body, err.status));
    }
  };

  // ── first load ─────────────────────────────────────────────────────────────
  (function load() {
    var raw = null;
    try { raw = localStorage.getItem(DOC_KEY); } catch (err) { raw = null; }
    if (raw === null || raw === undefined) {
      var blank = buildModel(emptyDoc(thisMonth()));
      model = blank.model;
      return;
    }
    var parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (err) {
      // localStorage cannot quarantine a file beside the data, but it can
      // keep a side copy: without one, the first save after a corrupt load
      // would overwrite the only trace of what the data used to be.
      try {
        for (var i = 0; i < localStorage.length; i++) {
          var k = localStorage.key(i);
          if (k && k.indexOf(DOC_KEY + '.corrupt.') === 0 &&
              localStorage.getItem(k) === raw) { i = -1; break; }
        }
        if (i !== -1) localStorage.setItem(DOC_KEY + '.corrupt.' + Date.now(), raw);
      } catch (quarantineErr) { /* full or private mode: the note is all we have */ }
      var clean = buildModel(emptyDoc(thisMonth()));
      model = clean.model;
      session.note = 'corrupt';
      return;
    }
    var migrated = migrateDoc(parsed, thisMonth());
    var built = buildModel(migrated.doc);
    model = built.model;
    session.dropped = built.dropped;
    session.note = migrated.note || (built.dropped ? 'partial' : null);
  }());
})();
