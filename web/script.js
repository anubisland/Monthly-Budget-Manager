(function () {
  'use strict';

  var BUDGET_STORAGE_KEY = 'anubisland-budget';

  var CHART_COLORS = [
    '#4caf50', '#2196f3', '#ff9800', '#9c27b0', '#00bcd4',
    '#8bc34a', '#ffc107', '#e91e63', '#795548', '#607d8b',
  ];

  // ---------------------------------------------------------------------------
  // Data layer
  // ---------------------------------------------------------------------------

  function _emptyData() {
    return { month: '', incomes: [], expenses: [] };
  }

  function loadData() {
    try {
      var raw = localStorage.getItem(BUDGET_STORAGE_KEY);
      if (!raw) return _emptyData();
      var parsed = JSON.parse(raw);
      return {
        month: parsed.month || '',
        incomes: Array.isArray(parsed.incomes) ? parsed.incomes : [],
        expenses: Array.isArray(parsed.expenses) ? parsed.expenses : [],
      };
    } catch (_) {
      return _emptyData();
    }
  }

  function saveData(data) {
    try {
      localStorage.setItem(BUDGET_STORAGE_KEY, JSON.stringify(data));
    } catch (_) {}
  }

  function _clearChildren(el) {
    while (el.firstChild) {
      el.removeChild(el.firstChild);
    }
  }

  // ---------------------------------------------------------------------------
  // Business logic (pure — no DOM dependencies, exported for tests)
  // ---------------------------------------------------------------------------

  function totalIncome(data) {
    return data.incomes.reduce(function (s, e) { return s + (Number(e.amount) || 0); }, 0);
  }

  function totalExpenses(data) {
    return data.expenses.reduce(function (s, e) { return s + (Number(e.amount) || 0); }, 0);
  }

  function net(data) {
    return totalIncome(data) - totalExpenses(data);
  }

  function profitMargin(data) {
    var inc = totalIncome(data);
    if (inc === 0) return 0;
    return (net(data) / inc) * 100;
  }

  function expensesByCategory(data) {
    var bycat = {};
    data.expenses.forEach(function (e) {
      var cat = e.category || 'Uncategorized';
      bycat[cat] = (bycat[cat] || 0) + (Number(e.amount) || 0);
    });
    return bycat;
  }

  function expensePctByCategory(data, basis) {
    var bycat = expensesByCategory(data);
    var total = basis === 'income' ? totalIncome(data) : totalExpenses(data);
    var pct = {};
    Object.keys(bycat).forEach(function (cat) {
      pct[cat] = total > 0 ? (bycat[cat] / total) * 100 : 0;
    });
    return pct;
  }

  // ---------------------------------------------------------------------------
  // Validation helpers
  // ---------------------------------------------------------------------------

  function _validYM(s) {
    return s.length === 7 && s[4] === '-' && /^\d{4}$/.test(s.slice(0, 4)) && /^\d{2}$/.test(s.slice(5));
  }

  function _validYMD(s) {
    if (s.length !== 10 || s[4] !== '-' || s[7] !== '-') return false;
    var d = new Date(s);
    return !isNaN(d.getTime());
  }

  function validateDate(s) {
    if (!s) return true;
    return _validYM(s) || _validYMD(s);
  }

  function validateAmount(s) {
    var n = parseFloat(s);
    return !isNaN(n) && n >= 0;
  }

  // ---------------------------------------------------------------------------
  // Formatting
  // ---------------------------------------------------------------------------

  function fmtAmount(n) {
    return '$' + Number(n).toLocaleString('en', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function fmtDateDisplay(ds, lang) {
    if (!ds) return '';
    try {
      if (_validYMD(ds)) {
        var d = new Date(ds + 'T00:00:00');
        var loc = lang === 'ar' ? 'ar-u-nu-latn' : 'en';
        return d.toLocaleDateString(loc, { year: 'numeric', month: 'short', day: 'numeric' });
      }
    } catch (_) {}
    return ds;
  }

  function fmtCatLabel(cat) {
    var catKeyMap = {
      'Food': 'cat.food', 'Rent': 'cat.rent', 'Fuel': 'cat.fuel',
      'Electricity': 'cat.electricity', 'Internet': 'cat.internet', 'Water': 'cat.water',
      'Transport': 'cat.transport', 'Healthcare': 'cat.healthcare', 'Entertainment': 'cat.entertainment',
      'Education': 'cat.education', 'Clothing': 'cat.clothing', 'Savings': 'cat.savings',
      'Debt': 'cat.debt', 'Subscriptions': 'cat.subscriptions', 'Gifts': 'cat.gifts',
      'Misc': 'cat.misc', 'Uncategorized': 'cat.uncategorized',
    };
    var key = catKeyMap[cat];
    return key ? window.i18n.t(key) : cat;
  }

  // ---------------------------------------------------------------------------
  // DOM helpers
  // ---------------------------------------------------------------------------

  function setStatus(msgKey, params) {
    var el = document.getElementById('statusBar');
    if (el) el.textContent = window.i18n.t(msgKey, params);
  }

  function _makeTd(text, cls) {
    var td = document.createElement('td');
    td.className = 'py-2 ' + (cls || '');
    td.textContent = text;
    return td;
  }

  function _makeRemoveBtn(label, handler) {
    var btn = document.createElement('button');
    btn.className = 'text-red-500 hover:text-red-700 text-xs px-2 py-1';
    btn.textContent = label;
    btn.addEventListener('click', handler);
    var td = document.createElement('td');
    td.className = 'py-2 text-center';
    td.appendChild(btn);
    return td;
  }

  // ---------------------------------------------------------------------------
  // DOM rendering
  // ---------------------------------------------------------------------------

  function renderIncomeTab(data) {
    var tbody = document.getElementById('incomeTableBody');
    var empty = document.getElementById('incomeEmpty');
    if (!tbody) return;

    _clearChildren(tbody);
    var lang = window.i18n.getCurrentLang();

    if (data.incomes.length === 0) {
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';

    data.incomes.forEach(function (inc, idx) {
      var tr = document.createElement('tr');
      tr.className = 'border-b border-gray-100 hover:bg-gray-50';
      tr.appendChild(_makeTd(inc.name || '', 'text-gray-800'));
      tr.appendChild(_makeTd(fmtAmount(inc.amount), 'text-end text-green-700 font-medium'));
      tr.appendChild(_makeTd(fmtDateDisplay(inc.date, lang), 'text-center text-gray-500'));
      tr.appendChild(_makeRemoveBtn(
        window.i18n.t('income.table.remove'),
        (function (i) { return function () { removeEntry('income', i); }; })(idx)
      ));
      tbody.appendChild(tr);
    });
  }

  function renderExpenseTab(data) {
    var tbody = document.getElementById('expenseTableBody');
    var empty = document.getElementById('expenseEmpty');
    if (!tbody) return;

    _clearChildren(tbody);
    var lang = window.i18n.getCurrentLang();

    if (data.expenses.length === 0) {
      if (empty) empty.style.display = '';
      return;
    }
    if (empty) empty.style.display = 'none';

    data.expenses.forEach(function (exp, idx) {
      var tr = document.createElement('tr');
      tr.className = 'border-b border-gray-100 hover:bg-gray-50';
      tr.appendChild(_makeTd(exp.name || '', 'text-gray-800'));
      tr.appendChild(_makeTd(fmtCatLabel(exp.category || 'Uncategorized'), 'text-gray-600'));
      tr.appendChild(_makeTd(fmtAmount(exp.amount), 'text-end text-red-700 font-medium'));
      tr.appendChild(_makeTd(fmtDateDisplay(exp.date, lang), 'text-center text-gray-500'));
      tr.appendChild(_makeRemoveBtn(
        window.i18n.t('expense.table.remove'),
        (function (i) { return function () { removeEntry('expenses', i); }; })(idx)
      ));
      tbody.appendChild(tr);
    });
  }

  function renderReportTab(data) {
    var inc = totalIncome(data);
    var exp = totalExpenses(data);
    var n = net(data);
    var pm = profitMargin(data);

    var elInc = document.getElementById('reportTotalIncome');
    var elExp = document.getElementById('reportTotalExpenses');
    var elNet = document.getElementById('reportNet');
    var elMar = document.getElementById('reportMargin');
    if (elInc) elInc.textContent = fmtAmount(inc);
    if (elExp) elExp.textContent = fmtAmount(exp);
    if (elNet) {
      elNet.textContent = fmtAmount(n);
      elNet.className = 'text-xl font-bold ' + (n >= 0 ? 'text-green-700' : 'text-red-700');
    }
    if (elMar) elMar.textContent = pm.toFixed(2) + '%';

    var tbody = document.getElementById('breakdownTableBody');
    var empty = document.getElementById('reportEmpty');
    if (tbody) {
      _clearChildren(tbody);
      var bycat = expensesByCategory(data);
      var pctInc = expensePctByCategory(data, 'income');
      var pctExp = expensePctByCategory(data, 'expenses');
      var cats = Object.keys(bycat).sort();

      if (cats.length === 0) {
        if (empty) empty.style.display = '';
      } else {
        if (empty) empty.style.display = 'none';
        cats.forEach(function (cat) {
          var tr = document.createElement('tr');
          tr.className = 'border-b border-gray-100 hover:bg-gray-50';
          tr.appendChild(_makeTd(fmtCatLabel(cat), 'text-gray-800'));
          tr.appendChild(_makeTd(fmtAmount(bycat[cat]), 'text-end text-gray-800'));
          tr.appendChild(_makeTd((pctInc[cat] || 0).toFixed(2) + '%', 'text-end text-gray-600'));
          tr.appendChild(_makeTd((pctExp[cat] || 0).toFixed(2) + '%', 'text-end text-gray-600'));
          tbody.appendChild(tr);
        });
      }
    }

    drawBarChart(inc, exp);
    drawPieChart(expensesByCategory(data));
  }

  function renderAll() {
    var data = loadData();
    renderIncomeTab(data);
    renderExpenseTab(data);
    renderReportTab(data);
    var monthEl = document.getElementById('monthInput');
    if (monthEl && data.month && !monthEl.value) monthEl.value = data.month;
  }

  // ---------------------------------------------------------------------------
  // Canvas charts
  // ---------------------------------------------------------------------------

  function drawBarChart(income, expenses) {
    var canvas = document.getElementById('barChart');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.offsetWidth || 400;
    var h = canvas.height || 220;
    canvas.width = w;
    ctx.clearRect(0, 0, w, h);

    var pad = 32;
    var usableH = Math.max(1, h - 2 * pad);
    var usableW = Math.max(1, w - 3 * pad);
    var barW = Math.floor(usableW / 2) - 4;
    var maxVal = Math.max(income, expenses, 1);
    var scale = usableH / maxVal;
    var x1 = pad;
    var x2 = pad * 2 + barW;
    var yBase = h - pad;

    ctx.strokeStyle = '#e5e7eb';
    ctx.beginPath();
    ctx.moveTo(pad - 8, yBase);
    ctx.lineTo(w - pad + 8, yBase);
    ctx.stroke();

    ctx.fillStyle = '#4caf50';
    ctx.fillRect(x1, yBase - Math.round(income * scale), barW, Math.round(income * scale));

    ctx.fillStyle = '#ef4444';
    ctx.fillRect(x2, yBase - Math.round(expenses * scale), barW, Math.round(expenses * scale));

    var lang = window.i18n ? window.i18n.getCurrentLang() : 'en';
    ctx.fillStyle = '#374151';
    ctx.font = '12px ' + (lang === 'ar' ? 'Cairo' : 'Inter') + ', sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(window.i18n.t('report.totalIncome'), x1 + barW / 2, yBase + 16);
    ctx.fillText(window.i18n.t('report.totalExpenses'), x2 + barW / 2, yBase + 16);

    ctx.font = '11px ' + (lang === 'ar' ? 'Cairo' : 'Inter') + ', sans-serif';
    ctx.fillStyle = '#111827';
    if (income > 0) ctx.fillText('$' + income.toLocaleString('en', { maximumFractionDigits: 0 }), x1 + barW / 2, yBase - Math.round(income * scale) - 6);
    if (expenses > 0) ctx.fillText('$' + expenses.toLocaleString('en', { maximumFractionDigits: 0 }), x2 + barW / 2, yBase - Math.round(expenses * scale) - 6);
  }

  function drawPieChart(bycat) {
    var canvas = document.getElementById('pieChart');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var w = canvas.offsetWidth || 400;
    var h = canvas.height || 220;
    canvas.width = w;
    ctx.clearRect(0, 0, w, h);

    var items = Object.keys(bycat)
      .filter(function (k) { return bycat[k] > 0; })
      .map(function (k) { return { cat: k, amt: bycat[k] }; })
      .sort(function (a, b) { return b.amt - a.amt; });

    if (items.length === 0) {
      ctx.fillStyle = '#9ca3af';
      ctx.font = '13px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(window.i18n.t('report.chart.noExpenses'), w / 2, h / 2);
      return;
    }

    var total = items.reduce(function (s, x) { return s + x.amt; }, 0);
    var pad = 20;
    var r = Math.max(10, Math.min(w - 2 * pad, h - 2 * pad) / 2 - pad);
    var cx = w / 2;
    var cy = h / 2;
    var angle = -Math.PI / 2;

    items.forEach(function (item, i) {
      var frac = item.amt / total;
      var sweep = frac * 2 * Math.PI;

      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, angle, angle + sweep);
      ctx.closePath();
      ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
      ctx.fill();

      if (frac >= 0.05) {
        var mid = angle + sweep / 2;
        var lx = cx + Math.cos(mid) * r * 0.6;
        var ly = cy + Math.sin(mid) * r * 0.6;
        ctx.fillStyle = '#fff';
        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText((frac * 100).toFixed(0) + '%', lx, ly + 4);
      }
      angle += sweep;
    });
  }

  // ---------------------------------------------------------------------------
  // Event handlers
  // ---------------------------------------------------------------------------

  function addIncome() {
    var name = (document.getElementById('incomeName').value || '').trim() || 'Income';
    var amtStr = (document.getElementById('incomeAmount').value || '').trim();
    var dateStr = (document.getElementById('incomeDate').value || '').trim();

    if (!validateAmount(amtStr)) {
      alert(window.i18n.t('alert.invalidAmount'));
      return;
    }
    if (dateStr && !validateDate(dateStr)) {
      alert(window.i18n.t('alert.invalidDate'));
      return;
    }

    var data = loadData();
    data.incomes.push({ name: name, amount: parseFloat(amtStr) || 0, date: dateStr });
    if (!data.month) {
      var m = document.getElementById('monthInput').value;
      if (m) data.month = m;
    }
    saveData(data);

    document.getElementById('incomeName').value = '';
    document.getElementById('incomeAmount').value = '';
    document.getElementById('incomeDate').value = '';

    renderAll();
    setStatus('status.incomeAdded');
  }

  function addExpense() {
    var name = (document.getElementById('expenseName').value || '').trim() || 'Expense';
    var cat = document.getElementById('expenseCategory').value || 'Uncategorized';
    var amtStr = (document.getElementById('expenseAmount').value || '').trim();
    var dateStr = (document.getElementById('expenseDate').value || '').trim();

    if (!validateAmount(amtStr)) {
      alert(window.i18n.t('alert.invalidAmount'));
      return;
    }
    if (dateStr && !validateDate(dateStr)) {
      alert(window.i18n.t('alert.invalidDate'));
      return;
    }

    var data = loadData();
    data.expenses.push({ name: name, category: cat, amount: parseFloat(amtStr) || 0, date: dateStr });
    if (!data.month) {
      var m = document.getElementById('monthInput').value;
      if (m) data.month = m;
    }
    saveData(data);

    document.getElementById('expenseName').value = '';
    document.getElementById('expenseCategory').value = '';
    document.getElementById('expenseAmount').value = '';
    document.getElementById('expenseDate').value = '';

    renderAll();
    setStatus('status.expenseAdded');
  }

  function removeEntry(type, idx) {
    var data = loadData();
    if (type === 'income') {
      data.incomes.splice(idx, 1);
    } else {
      data.expenses.splice(idx, 1);
    }
    saveData(data);
    renderAll();
    setStatus('status.removed');
  }

  function clearAll(type) {
    var key = type === 'income' ? 'alert.confirmClearIncome' : 'alert.confirmClearExpenses';
    if (!confirm(window.i18n.t(key))) return;
    var data = loadData();
    if (type === 'income') {
      data.incomes = [];
    } else {
      data.expenses = [];
    }
    saveData(data);
    renderAll();
    setStatus('status.cleared');
  }

  function newBudget() {
    if (!confirm(window.i18n.t('alert.confirmNew'))) return;
    saveData(_emptyData());
    var monthEl = document.getElementById('monthInput');
    if (monthEl) monthEl.value = '';
    renderAll();
    setStatus('status.new');
  }

  function switchTab(name) {
    document.querySelectorAll('.tab-content').forEach(function (el) {
      el.classList.add('hidden');
    });
    document.querySelectorAll('.tab-btn').forEach(function (btn) {
      btn.classList.remove('active');
    });
    var target = document.getElementById('tab-' + name);
    if (target) target.classList.remove('hidden');
    var btn = document.querySelector('[data-tab="' + name + '"]');
    if (btn) btn.classList.add('active');
    if (name === 'report') renderReportTab(loadData());
  }

  function toggleLanguage() {
    var cur = window.i18n.getCurrentLang();
    window.i18n.setLanguage(cur === 'en' ? 'ar' : 'en');
  }

  // ---------------------------------------------------------------------------
  // CSV Import / Export
  // ---------------------------------------------------------------------------

  function importCsv(event) {
    var file = event.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function (e) {
      var text = e.target.result;
      var lines = text.split(/\r?\n/).filter(function (l) { return l.trim(); });
      if (lines.length < 2) return;
      var header = lines[0].split(',').map(function (h) { return h.trim().toLowerCase().replace(/^"|"$/g, ''); });
      var typeIdx = header.indexOf('type');
      var nameIdx = header.indexOf('name');
      var catIdx = header.indexOf('category');
      var amtIdx = header.indexOf('amount');
      var dateIdx = header.indexOf('date');
      if (typeIdx < 0 || nameIdx < 0 || amtIdx < 0) return;

      var data = loadData();
      var count = 0;
      for (var i = 1; i < lines.length; i++) {
        var cols = lines[i].split(',').map(function (c) { return c.trim().replace(/^"|"$/g, ''); });
        var type = (cols[typeIdx] || '').toLowerCase();
        var name = cols[nameIdx] || '';
        var cat = catIdx >= 0 ? (cols[catIdx] || '') : 'Uncategorized';
        var amt = parseFloat(cols[amtIdx] || '0') || 0;
        var date = dateIdx >= 0 ? (cols[dateIdx] || '') : '';
        if (!name || amt < 0) continue;
        if (type === 'income') {
          data.incomes.push({ name: name, amount: amt, date: date });
          count++;
        } else if (type === 'expense') {
          data.expenses.push({ name: name, category: cat || 'Uncategorized', amount: amt, date: date });
          count++;
        }
      }
      saveData(data);
      renderAll();
      setStatus('status.imported', { count: count });
    };
    reader.readAsText(file);
    event.target.value = '';
  }

  function exportCsv() {
    var data = loadData();
    var rows = [['type', 'name', 'category', 'amount', 'date']];
    data.incomes.forEach(function (inc) {
      rows.push(['income', inc.name, '', inc.amount.toFixed(2), inc.date || data.month || '']);
    });
    data.expenses.forEach(function (exp) {
      rows.push(['expense', exp.name, exp.category || 'Uncategorized', exp.amount.toFixed(2), exp.date || data.month || '']);
    });
    var csv = rows.map(function (r) {
      return r.map(function (c) { return '"' + String(c).replace(/"/g, '""') + '"'; }).join(',');
    }).join('\n');
    _triggerDownload(csv, 'budget.csv', 'text/csv');
    setStatus('status.exportedCsv');
  }

  function exportJson() {
    var data = loadData();
    var inc = totalIncome(data);
    var exp = totalExpenses(data);
    var n = net(data);
    var pm = profitMargin(data);
    var report = {
      month: data.month,
      total_income: inc,
      total_expenses: exp,
      net: n,
      profit_margin_pct: parseFloat(pm.toFixed(4)),
      incomes: data.incomes,
      expenses: data.expenses,
      expenses_by_category: expensesByCategory(data),
    };
    _triggerDownload(JSON.stringify(report, null, 2), 'budget_report.json', 'application/json');
    setStatus('status.exportedJson');
  }

  function _triggerDownload(content, filename, mimeType) {
    var blob = new Blob([content], { type: mimeType });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ---------------------------------------------------------------------------
  // Language change — re-render dynamic content
  // ---------------------------------------------------------------------------

  document.addEventListener('langchange', function () {
    renderAll();
  });

  // ---------------------------------------------------------------------------
  // Month input sync
  // ---------------------------------------------------------------------------

  document.addEventListener('DOMContentLoaded', function () {
    var monthEl = document.getElementById('monthInput');
    if (monthEl) {
      var data = loadData();
      if (data.month) monthEl.value = data.month;
      monthEl.addEventListener('change', function () {
        var d = loadData();
        d.month = monthEl.value;
        saveData(d);
      });
    }
    renderAll();
  });

  // ---------------------------------------------------------------------------
  // Public API (onclick handlers + tests)
  // ---------------------------------------------------------------------------

  window.addIncome = addIncome;
  window.addExpense = addExpense;
  window.removeEntry = removeEntry;
  window.clearAll = clearAll;
  window.newBudget = newBudget;
  window.switchTab = switchTab;
  window.toggleLanguage = toggleLanguage;
  window.importCsv = importCsv;
  window.exportCsv = exportCsv;
  window.exportJson = exportJson;

  window.budgetApp = {
    totalIncome: totalIncome,
    totalExpenses: totalExpenses,
    net: net,
    profitMargin: profitMargin,
    expensesByCategory: expensesByCategory,
    expensePctByCategory: expensePctByCategory,
    validateDate: validateDate,
    validateAmount: validateAmount,
    loadData: loadData,
    saveData: saveData,
    fmtAmount: fmtAmount,
    renderAll: renderAll,
  };
})();
