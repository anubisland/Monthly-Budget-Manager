(function () {
  'use strict';

  var translations = {
    en: {
      'app.title': 'Monthly Budget Manager',
      'app.tagline': 'Track your monthly income and expenses',

      'toolbar.month': 'Month (YYYY-MM)',
      'toolbar.newBudget': 'New Budget',
      'toolbar.importCsv': 'Import CSV',
      'toolbar.exportCsv': 'Export CSV',
      'toolbar.exportJson': 'Export JSON',

      'tab.income': 'Income',
      'tab.expenses': 'Expenses',
      'tab.report': 'Report',

      'income.addTitle': 'Add Income',
      'income.name': 'Name',
      'income.amount': 'Amount',
      'income.date': 'Date (YYYY-MM-DD)',
      'income.addBtn': 'Add Income',
      'income.removeSelected': 'Remove Selected',
      'income.clearAll': 'Clear All',
      'income.noEntries': 'No income entries yet',
      'income.table.name': 'Name',
      'income.table.amount': 'Amount',
      'income.table.date': 'Date',
      'income.table.remove': 'Remove',

      'expense.addTitle': 'Add Expense',
      'expense.name': 'Name',
      'expense.category': 'Category',
      'expense.amount': 'Amount',
      'expense.date': 'Date (YYYY-MM-DD)',
      'expense.addBtn': 'Add Expense',
      'expense.removeSelected': 'Remove Selected',
      'expense.clearAll': 'Clear All',
      'expense.noEntries': 'No expense entries yet',
      'expense.table.name': 'Name',
      'expense.table.category': 'Category',
      'expense.table.amount': 'Amount',
      'expense.table.date': 'Date',
      'expense.table.remove': 'Remove',

      'report.summary': 'Summary',
      'report.totalIncome': 'Total Income',
      'report.totalExpenses': 'Total Expenses',
      'report.net': 'Net (Profit)',
      'report.margin': 'Profit Margin',
      'report.breakdownTitle': 'Expense Breakdown by Category',
      'report.breakdown.category': 'Category',
      'report.breakdown.amount': 'Amount',
      'report.breakdown.pctIncome': '% of Income',
      'report.breakdown.pctExpenses': '% of Expenses',
      'report.chart.incomeVsExpenses': 'Income vs Expenses',
      'report.chart.expenseCategories': 'Expense Categories',
      'report.chart.noExpenses': 'No expenses to chart',
      'report.noData': 'Add income or expenses to see your report',

      'cat.food': 'Food',
      'cat.rent': 'Rent',
      'cat.fuel': 'Fuel',
      'cat.electricity': 'Electricity',
      'cat.internet': 'Internet',
      'cat.water': 'Water',
      'cat.transport': 'Transport',
      'cat.healthcare': 'Healthcare',
      'cat.entertainment': 'Entertainment',
      'cat.education': 'Education',
      'cat.clothing': 'Clothing',
      'cat.savings': 'Savings',
      'cat.debt': 'Debt',
      'cat.subscriptions': 'Subscriptions',
      'cat.gifts': 'Gifts',
      'cat.misc': 'Misc',
      'cat.uncategorized': 'Uncategorized',
      'cat.selectCategory': 'Select category',

      'form.namePlaceholder': 'e.g. Salary',
      'form.expenseNamePlaceholder': 'e.g. Rent',
      'form.amountPlaceholder': '0.00',
      'form.datePlaceholder': 'YYYY-MM-DD',
      'form.monthPlaceholder': 'YYYY-MM',

      'alert.invalidAmount': 'Amount must be a non-negative number.',
      'alert.invalidDate': 'Invalid date. Use YYYY-MM or YYYY-MM-DD.',
      'alert.confirmNew': 'Start a new budget? All current entries will be cleared.',
      'alert.confirmClearIncome': 'Remove all income entries?',
      'alert.confirmClearExpenses': 'Remove all expense entries?',

      'status.ready': 'Ready',
      'status.incomeAdded': 'Income added.',
      'status.expenseAdded': 'Expense added.',
      'status.removed': 'Entry removed.',
      'status.cleared': 'All entries cleared.',
      'status.new': 'New budget created.',
      'status.imported': 'Imported {count} entries.',
      'status.exportedCsv': 'CSV exported.',
      'status.exportedJson': 'JSON report exported.',

      'lang.ariaLabel': 'Switch to Arabic / التحويل إلى العربية',
    },

    ar: {
      'app.title': 'مدير الميزانية الشهرية',
      'app.tagline': 'تتبع دخلك ومصروفاتك الشهرية',

      'toolbar.month': 'الشهر (YYYY-MM)',
      'toolbar.newBudget': 'ميزانية جديدة',
      'toolbar.importCsv': 'استيراد CSV',
      'toolbar.exportCsv': 'تصدير CSV',
      'toolbar.exportJson': 'تصدير JSON',

      'tab.income': 'الدخل',
      'tab.expenses': 'المصروفات',
      'tab.report': 'التقرير',

      'income.addTitle': 'إضافة دخل',
      'income.name': 'الاسم',
      'income.amount': 'المبلغ',
      'income.date': 'التاريخ (YYYY-MM-DD)',
      'income.addBtn': 'إضافة دخل',
      'income.removeSelected': 'حذف المحدد',
      'income.clearAll': 'مسح الكل',
      'income.noEntries': 'لا توجد إدخالات دخل بعد',
      'income.table.name': 'الاسم',
      'income.table.amount': 'المبلغ',
      'income.table.date': 'التاريخ',
      'income.table.remove': 'حذف',

      'expense.addTitle': 'إضافة مصروف',
      'expense.name': 'الاسم',
      'expense.category': 'الفئة',
      'expense.amount': 'المبلغ',
      'expense.date': 'التاريخ (YYYY-MM-DD)',
      'expense.addBtn': 'إضافة مصروف',
      'expense.removeSelected': 'حذف المحدد',
      'expense.clearAll': 'مسح الكل',
      'expense.noEntries': 'لا توجد إدخالات مصروفات بعد',
      'expense.table.name': 'الاسم',
      'expense.table.category': 'الفئة',
      'expense.table.amount': 'المبلغ',
      'expense.table.date': 'التاريخ',
      'expense.table.remove': 'حذف',

      'report.summary': 'الملخص',
      'report.totalIncome': 'إجمالي الدخل',
      'report.totalExpenses': 'إجمالي المصروفات',
      'report.net': 'الصافي (الربح)',
      'report.margin': 'هامش الربح',
      'report.breakdownTitle': 'تفصيل المصروفات حسب الفئة',
      'report.breakdown.category': 'الفئة',
      'report.breakdown.amount': 'المبلغ',
      'report.breakdown.pctIncome': '% من الدخل',
      'report.breakdown.pctExpenses': '% من المصروفات',
      'report.chart.incomeVsExpenses': 'الدخل مقابل المصروفات',
      'report.chart.expenseCategories': 'فئات المصروفات',
      'report.chart.noExpenses': 'لا توجد مصروفات للرسم البياني',
      'report.noData': 'أضف دخلاً أو مصروفات لرؤية تقريرك',

      'cat.food': 'طعام',
      'cat.rent': 'إيجار',
      'cat.fuel': 'وقود',
      'cat.electricity': 'كهرباء',
      'cat.internet': 'إنترنت',
      'cat.water': 'ماء',
      'cat.transport': 'مواصلات',
      'cat.healthcare': 'رعاية صحية',
      'cat.entertainment': 'ترفيه',
      'cat.education': 'تعليم',
      'cat.clothing': 'ملابس',
      'cat.savings': 'مدخرات',
      'cat.debt': 'ديون',
      'cat.subscriptions': 'اشتراكات',
      'cat.gifts': 'هدايا',
      'cat.misc': 'متفرقات',
      'cat.uncategorized': 'غير مصنّف',
      'cat.selectCategory': 'اختر الفئة',

      'form.namePlaceholder': 'مثال: راتب',
      'form.expenseNamePlaceholder': 'مثال: إيجار',
      'form.amountPlaceholder': '0.00',
      'form.datePlaceholder': 'YYYY-MM-DD',
      'form.monthPlaceholder': 'YYYY-MM',

      'alert.invalidAmount': 'يجب أن يكون المبلغ رقماً غير سالب.',
      'alert.invalidDate': 'تاريخ غير صحيح. استخدم YYYY-MM أو YYYY-MM-DD.',
      'alert.confirmNew': 'إنشاء ميزانية جديدة؟ سيتم مسح جميع الإدخالات الحالية.',
      'alert.confirmClearIncome': 'حذف جميع إدخالات الدخل؟',
      'alert.confirmClearExpenses': 'حذف جميع إدخالات المصروفات؟',

      'status.ready': 'جاهز',
      'status.incomeAdded': 'تمت إضافة الدخل.',
      'status.expenseAdded': 'تمت إضافة المصروف.',
      'status.removed': 'تم حذف الإدخال.',
      'status.cleared': 'تم مسح جميع الإدخالات.',
      'status.new': 'تم إنشاء ميزانية جديدة.',
      'status.imported': 'تم استيراد {count} إدخال.',
      'status.exportedCsv': 'تم تصدير CSV.',
      'status.exportedJson': 'تم تصدير تقرير JSON.',

      'lang.ariaLabel': 'Switch to English / التحويل إلى الإنجليزية',
    },
  };

  var STORAGE_KEY = 'anubisland-lang';

  function t(key, params) {
    var lang = getCurrentLang();
    var str =
      (translations[lang] && translations[lang][key]) ||
      (translations['en'] && translations['en'][key]) ||
      key;
    if (!params) return str;
    return str.replace(/\{(\w+)\}/g, function (_, k) {
      return params[k] !== undefined ? params[k] : '{' + k + '}';
    });
  }

  function getCurrentLang() {
    return localStorage.getItem(STORAGE_KEY) || 'en';
  }

  function setLanguage(lang) {
    localStorage.setItem(STORAGE_KEY, lang);
    applyLanguage(lang);
  }

  function applyLanguage(lang) {
    var html = document.documentElement;
    html.setAttribute('lang', lang);
    html.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');

    if (lang === 'ar') {
      html.classList.add('lang-ar');
      html.classList.remove('lang-en');
    } else {
      html.classList.add('lang-en');
      html.classList.remove('lang-ar');
    }

    render();
    _updateToggle(lang);
    document.title = t('app.title');

    document.dispatchEvent(new CustomEvent('langchange', { detail: { lang: lang } }));
  }

  function _updateToggle(lang) {
    var toggle = document.getElementById('langToggle');
    if (!toggle) return;
    toggle.setAttribute('aria-label', t('lang.ariaLabel'));
    toggle.setAttribute('aria-checked', lang === 'ar' ? 'true' : 'false');

    var enLabel = toggle.querySelector('.lang-label-en');
    var arLabel = toggle.querySelector('.lang-label-ar');
    if (enLabel) {
      enLabel.style.fontWeight = lang === 'en' ? '700' : '400';
      enLabel.style.color = lang === 'en' ? '#1d4ed8' : '#6b7280';
    }
    if (arLabel) {
      arLabel.style.fontWeight = lang === 'ar' ? '700' : '400';
      arLabel.style.color = lang === 'ar' ? '#1d4ed8' : '#6b7280';
    }
  }

  function render() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n'));
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder')));
    });
    document.querySelectorAll('[data-i18n-option]').forEach(function (el) {
      el.textContent = t(el.getAttribute('data-i18n-option'));
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function (el) {
      el.setAttribute('title', t(el.getAttribute('data-i18n-title')));
    });
  }

  function init() {
    applyLanguage(getCurrentLang());
  }

  window.i18n = {
    t: t,
    setLanguage: setLanguage,
    getCurrentLang: getCurrentLang,
    render: render,
    init: init,
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
