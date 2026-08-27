(function () {
  'use strict';

  var TOUR_VERSION = '1.0.0';
  var SURFACE = 'web';
  var COMPLETION_KEY = 'anubisland-tour-completed-at';
  var BUFFER = [];

  window.__tourTelemetryBuffer = BUFFER;

  var STYLE_ID = 'mbm-tour-styles';
  var TOOLTIP_CLASS = 'mbm-tour-tooltip';
  var OVERLAY_ID = 'mbm-tour-overlay';
  var LIVE_CLASS = 'mbm-tour-live';

  // ---------------------------------------------------------------------------
  // I18n (tour-specific — falls back to window.i18n.t)
  // ---------------------------------------------------------------------------

  var tourI18n = {
    en: {
      'tour.welcome.title': 'Welcome to Monthly Budget Manager',
      'tour.welcome.body': 'A quick tour will show you the main features in under a minute.',
      'tour.month.title': 'Select Month',
      'tour.month.body': 'Set the month you want to budget for. Entries are grouped by month.',
      'tour.tabs-income.title': 'Income Tab',
      'tour.tabs-income.body': 'The Income tab is where you add all your income sources — salary, freelance, side projects, etc.',
      'tour.add-income.title': 'Add an Income Entry',
      'tour.add-income.body': 'Enter the name, amount, and date, then click Add Income. Repeat for each income source.',
      'tour.tabs-expense.title': 'Expenses Tab',
      'tour.tabs-expense.body': 'Switch to the Expenses tab to track where your money goes each month.',
      'tour.expense-cat.title': 'Expense Categories',
      'tour.expense-cat.body': 'Assign each expense to a category like Food, Rent, or Transport for detailed breakdowns.',
      'tour.tabs-report.title': 'Report Tab',
      'tour.tabs-report.body': 'The Report tab shows totals, charts, and a category breakdown so you can see your full financial picture.',
      'tour.import-csv.title': 'Import CSV',
      'tour.import-csv.body': 'Already have budget data in a spreadsheet? Import it in one click from CSV.',
      'tour.export.title': 'Export Your Data',
      'tour.export.body': 'Export your budget as CSV for spreadsheets or JSON for automation and pipelines.',
      'tour.new-budget.title': 'New Budget',
      'tour.new-budget.body': 'Start fresh — clear all entries and begin a new budget for a different month.',
      'tour.language.title': 'Switch Language',
      'tour.language.body': 'Toggle between English and Arabic. The entire app (including this tour) supports both.',
      'tour.replay.title': 'Tour Complete!',
      'tour.replay.body': 'You\'ve seen the main features. Use this button or press the settings icon to replay the tour anytime.',
      'tour.btn.skip': 'Skip tour',
      'tour.btn.back': 'Back',
      'tour.btn.next': 'Next',
      'tour.btn.finish': 'Finish',
      'tour.btn.replay': 'Replay tour',
      'tour.counter': '{current} / {total}',
      'alert.confirmSkipTour': 'Skip the tour? You can replay it anytime from the status bar.',
    },
    ar: {
      'tour.welcome.title': 'مرحباً بك في مدير الميزانية الشهرية',
      'tour.welcome.body': 'جولة سريعة ستريك الميزات الرئيسية في أقل من دقيقة.',
      'tour.month.title': 'اختر الشهر',
      'tour.month.body': 'حدد الشهر الذي تريد إعداد ميزانيته. تُجمّع الإدخالات حسب الشهر.',
      'tour.tabs-income.title': 'علامة الدخل',
      'tour.tabs-income.body': 'علامة الدخل هي المكان الذي تضيف فيه جميع مصادر دخلك — الراتب، العمل الحر، المشاريع الجانبية، إلخ.',
      'tour.add-income.title': 'أضف إدخال دخل',
      'tour.add-income.body': 'اكتب الاسم والمبلغ والتاريخ ثم اضغط إضافة دخل. كرّر لكل مصدر دخل.',
      'tour.tabs-expense.title': 'علامة المصروفات',
      'tour.tabs-expense.body': 'انتقل إلى علامة المصروفات لتتبع أين تذهب أموالك كل شهر.',
      'tour.expense-cat.title': 'فئات المصروفات',
      'tour.expense-cat.body': 'خصّص كل مصروف لفئة مثل الطعام أو الإيجار أو المواصلات للحصول على تفاصيل دقيقة.',
      'tour.tabs-report.title': 'علامة التقرير',
      'tour.tabs-report.body': 'تعرض علامة التقرير الإجماليات والرسوم البيانية وتفصيل الفئات لرؤية صورتك المالية الكاملة.',
      'tour.import-csv.title': 'استيراد CSV',
      'tour.import-csv.body': 'هل لديك بيانات ميزانية في جدول بيانات؟ استوردها بنقرة واحدة من CSV.',
      'tour.export.title': 'صدّر بياناتك',
      'tour.export.body': 'صدّر ميزانيتك بصيغة CSV لجداول البيانات أو JSON للأتمتة والأنابيب البرمجية.',
      'tour.new-budget.title': 'ميزانية جديدة',
      'tour.new-budget.body': 'ابدأ من جديد — امسح جميع الإدخالات وابدأ ميزانية جديدة لشهر مختلف.',
      'tour.language.title': 'تغيير اللغة',
      'tour.language.body': 'تناوب بين الإنجليزية والعربية. التطبيق بالكامل (بما في ذلك هذه الجولة) يدعم اللغتين.',
      'tour.replay.title': 'اكتملت الجولة!',
      'tour.replay.body': 'لقد رأيت الميزات الرئيسية. استخدم هذا الزر أو أيقونة الإعدادات لإعادة الجولة في أي وقت.',
      'tour.btn.skip': 'تخطي الجولة',
      'tour.btn.back': 'السابق',
      'tour.btn.next': 'التالي',
      'tour.btn.finish': 'إنهاء',
      'tour.btn.replay': 'إعادة الجولة',
      'tour.counter': '{current} / {total}',
      'alert.confirmSkipTour': 'تخطي الجولة؟ يمكنك إعادتها في أي وقت من شريط الحالة.',
    },
  };

  function t(key, params) {
    var lang = window.i18n ? window.i18n.getCurrentLang() : 'en';
    var str =
      (tourI18n[lang] && tourI18n[lang][key]) ||
      (tourI18n['en'] && tourI18n['en'][key]) ||
      key;
    if (!params) return str;
    return str.replace(/\{(\w+)\}/g, function (_, k) {
      return params[k] !== undefined ? params[k] : '{' + k + '}';
    });
  }

  // ---------------------------------------------------------------------------
  // Step definitions
  // ---------------------------------------------------------------------------

  var STEPS = [
    { id: 'welcome',      target: null },
    { id: 'month',        target: '#monthInput' },
    { id: 'tabs-income',  target: '[data-tab="income"]' },
    { id: 'add-income',   target: '#incomeName' },
    { id: 'tabs-expense', target: '[data-tab="expenses"]' },
    { id: 'expense-cat',  target: '#expenseCategory' },
    { id: 'tabs-report',  target: '[data-tab="report"]' },
    { id: 'import-csv',   target: '#csvImport' },
    { id: 'export',       target: '[onclick="exportCsv()"]' },
    { id: 'new-budget',   target: '[onclick="newBudget()"]' },
    { id: 'language',     target: '#langToggle' },
    { id: 'replay',       target: null },
  ];

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  var active = false;
  var currentIdx = 0;
  var stepEnteredAt = 0;

  // ---------------------------------------------------------------------------
  // Inject styles
  // ---------------------------------------------------------------------------

  function injectStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      '#mbm-tour-overlay {',
      '  position: fixed; top: 0; left: 0; width: 100%; height: 100%;',
      '  background: rgba(0, 0, 0, 0.45);',
      '  z-index: 9998;',
      '  pointer-events: auto;',
      '}',
      '.mbm-tour-tooltip {',
      '  position: absolute;',
      '  z-index: 9999;',
      '  background: #ffffff;',
      '  border-radius: 12px;',
      '  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.10);',
      '  padding: 20px 24px;',
      '  max-width: 360px;',
      '  min-width: 260px;',
      '  outline: none;',
      '}',
      '.mbm-tour-title {',
      '  margin: 0 0 6px;',
      '  font-size: 1.1rem;',
      '  font-weight: 700;',
      '  color: #111827;',
      '  line-height: 1.4;',
      '}',
      '.mbm-tour-body {',
      '  margin: 0 0 12px;',
      '  font-size: 0.9rem;',
      '  color: #374151;',
      '  line-height: 1.6;',
      '}',
      '.mbm-tour-counter {',
      '  margin: 0 0 12px;',
      '  font-size: 0.75rem;',
      '  color: #6b7280;',
      '}',
      '.mbm-tour-actions {',
      '  display: flex;',
      '  gap: 8px;',
      '  flex-wrap: wrap;',
      '}',
      '.mbm-tour-btn {',
      '  padding: 8px 16px;',
      '  border-radius: 8px;',
      '  font-size: 0.85rem;',
      '  font-weight: 500;',
      '  cursor: pointer;',
      '  border: none;',
      '  transition: background 0.15s, opacity 0.15s;',
      '}',
      '.mbm-tour-btn-primary {',
      '  background: #2563eb;',
      '  color: #ffffff;',
      '}',
      '.mbm-tour-btn-primary:hover {',
      '  background: #1d4ed8;',
      '}',
      '.mbm-tour-btn-secondary {',
      '  background: #f3f4f6;',
      '  color: #1f2937;',
      '}',
      '.mbm-tour-btn-secondary:hover {',
      '  background: #e5e7eb;',
      '}',
      '.mbm-tour-live {',
      '  position: absolute;',
      '  width: 1px; height: 1px;',
      '  padding: 0; margin: -1px;',
      '  overflow: hidden;',
      '  clip: rect(0,0,0,0);',
      '  white-space: nowrap;',
      '  border: 0;',
      '}',
      '[dir="rtl"] .mbm-tour-tooltip {',
      '  direction: rtl;',
      '  text-align: right;',
      '}',
      '.mbm-tour-tooltip[dir="rtl"] .mbm-tour-actions {',
      '  flex-direction: row-reverse;',
      '}',
    ].join('\n');
    document.head.appendChild(style);
  }

  // ---------------------------------------------------------------------------
  // DOM elements
  // ---------------------------------------------------------------------------

  function createTooltip() {
    var tt = document.createElement('div');
    tt.className = 'mbm-tour-tooltip';
    tt.setAttribute('role', 'dialog');
    tt.setAttribute('aria-modal', 'true');
    tt.setAttribute('aria-labelledby', 'mbm-tour-title');
    tt.setAttribute('aria-describedby', 'mbm-tour-body');
    tt.setAttribute('tabindex', '-1');
    return tt;
  }

  function createLiveRegion() {
    var live = document.createElement('div');
    live.className = 'mbm-tour-live';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('aria-atomic', 'true');
    return live;
  }

  function getOrCreateTooltip() {
    var tt = document.querySelector('.' + TOOLTIP_CLASS);
    if (!tt) {
      tt = createTooltip();
      document.body.appendChild(tt);
    }
    return tt;
  }

  function getOrCreateOverlay() {
    var overlay = document.getElementById(OVERLAY_ID);
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = OVERLAY_ID;
      overlay.addEventListener('click', function () {
        if (confirm(t('alert.confirmSkipTour'))) {
          skip();
        }
      });
      document.body.appendChild(overlay);
    }
    return overlay;
  }

  function getOrCreateLiveRegion() {
    var live = document.querySelector('.' + LIVE_CLASS);
    if (!live) {
      live = createLiveRegion();
      document.body.appendChild(live);
    }
    return live;
  }

  // ---------------------------------------------------------------------------
  // Positioning
  // ---------------------------------------------------------------------------

  function positionTooltip(tt, targetEl) {
    var lang = window.i18n ? window.i18n.getCurrentLang() : 'en';
    var isRTL = lang === 'ar';

    if (!targetEl) {
      // Centered modal (welcome / replay steps)
      tt.style.top = '50%';
      tt.style.left = '50%';
      tt.style.transform = 'translate(-50%, -50%)';
      tt.style.position = 'fixed';
      return;
    }

    var rect = targetEl.getBoundingClientRect();
    var gap = 12;
    var ttW = tt.offsetWidth || 320;

    // Position below target by default, clamp to viewport
    var top = rect.bottom + gap;
    var left = isRTL ? rect.right - ttW : rect.left;

    // If not enough room below, try above
    if (top + 200 > window.innerHeight) {
      top = rect.top - 210;
      if (top < 8) top = 8;
    }

    // Clamp horizontal
    if (left < 8) left = 8;
    if (left + ttW > window.innerWidth - 8) {
      left = window.innerWidth - ttW - 8;
    }

    tt.style.position = 'fixed';
    tt.style.top = Math.round(top) + 'px';
    tt.style.left = Math.round(left) + 'px';
    tt.style.transform = 'none';
  }

  // ---------------------------------------------------------------------------
  // Rendering
  // ---------------------------------------------------------------------------

  function renderStep() {
    var step = STEPS[currentIdx];
    var tt = getOrCreateTooltip();
    var lang = window.i18n ? window.i18n.getCurrentLang() : 'en';
    var isRTL = lang === 'ar';
    var total = STEPS.length;
    var isLast = currentIdx === total - 1;
    var isFirst = currentIdx === 0;

    tt.dir = isRTL ? 'rtl' : 'ltr';
    tt.lang = lang;

    tt.innerHTML = [
      '<h2 id="mbm-tour-title" class="mbm-tour-title">' + t('tour.' + step.id + '.title') + '</h2>',
      '<p id="mbm-tour-body" class="mbm-tour-body">' + t('tour.' + step.id + '.body') + '</p>',
      '<p class="mbm-tour-counter">' + t('tour.counter', { current: currentIdx + 1, total: total }) + '</p>',
      '<div class="mbm-tour-actions">',
      '  <button type="button" class="mbm-tour-btn mbm-tour-btn-secondary" data-tour-action="skip">' + t('tour.btn.skip') + '</button>',
      (!isFirst ? '  <button type="button" class="mbm-tour-btn mbm-tour-btn-secondary" data-tour-action="back">' + t('tour.btn.back') + '</button>' : ''),
      '  <button type="button" class="mbm-tour-btn mbm-tour-btn-primary" data-tour-action="next">' + (isLast ? t('tour.btn.finish') : t('tour.btn.next')) + '</button>',
      '</div>',
    ].join('\n');

    // Wire buttons
    tt.querySelectorAll('button').forEach(function (btn) {
      var action = btn.getAttribute('data-tour-action');
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (action === 'skip') skip();
        else if (action === 'back') prev();
        else if (action === 'next') next();
      });
    });

    // Visibility
    tt.style.display = '';

    // Overlay (on non-welcome/non-replay steps we show an overlay)
    var overlay = getOrCreateOverlay();
    if (step.target) {
      overlay.style.display = '';
    } else {
      overlay.style.display = 'none';
    }

    // Position (defer to next frame so offsetWidth is available)
    var targetEl = step.target ? document.querySelector(step.target) : null;
    // Switch to the relevant tab so target element is visible
    if (step.id === 'tabs-income' || step.id === 'add-income') {
      switchTabSilent('income');
    } else if (step.id === 'tabs-expense' || step.id === 'expense-cat') {
      switchTabSilent('expenses');
    } else if (step.id === 'tabs-report') {
      switchTabSilent('report');
    }

    positionTooltip(tt, targetEl);
    tt.focus();

    // Update live region
    var live = getOrCreateLiveRegion();
    live.textContent = t('tour.' + step.id + '.title') + '. ' + t('tour.' + step.id + '.body');
  }

  function switchTabSilent(name) {
    if (window.switchTab) window.switchTab(name);
  }

  // ---------------------------------------------------------------------------
  // Telemetry
  // ---------------------------------------------------------------------------

  function emit(name, props) {
    var evt = {
      name: name,
      props: props,
      at: Date.now(),
    };
    BUFFER.push(evt);
  }

  function emitStepCompleted() {
    var step = STEPS[currentIdx];
    var now = Date.now();
    var dwell = stepEnteredAt > 0 ? now - stepEnteredAt : 0;
    emit('tour_step_completed', {
      tour_version: TOUR_VERSION,
      step_id: step.id,
      step_index: currentIdx,
      dwell_ms: dwell,
      surface: SURFACE,
    });
  }

  function emitStarted() {
    emit('tour_started', {
      tour_version: TOUR_VERSION,
      trigger: 'first_run',
      locale: window.i18n ? window.i18n.getCurrentLang() : 'en',
      surface: SURFACE,
    });
  }

  function emitCompleted() {
    var firstEvt = BUFFER[0];
    var lastEvt = BUFFER[BUFFER.length - 1];
    var totalDuration = firstEvt && lastEvt ? lastEvt.at - firstEvt.at : 0;
    emit('tour_completed', {
      tour_version: TOUR_VERSION,
      total_steps: STEPS.length,
      total_duration_ms: totalDuration,
      surface: SURFACE,
    });
  }

  function emitSkipped() {
    var step = STEPS[currentIdx];
    emit('tour_skipped', {
      tour_version: TOUR_VERSION,
      step_id: step.id,
      step_index: currentIdx,
      surface: SURFACE,
    });
  }

  // ---------------------------------------------------------------------------
  // Lifecycle
  // ---------------------------------------------------------------------------

  function tearDown() {
    var tt = document.querySelector('.' + TOOLTIP_CLASS);
    var overlay = document.getElementById(OVERLAY_ID);
    if (tt) tt.style.display = 'none';
    if (overlay) overlay.style.display = 'none';
  }

  function persistCompletion() {
    try {
      localStorage.setItem(COMPLETION_KEY, new Date().toISOString());
    } catch (_) {}
  }

  function clearCompletion() {
    try {
      localStorage.removeItem(COMPLETION_KEY);
    } catch (_) {}
  }

  function start() {
    if (active) return;
    active = true;
    currentIdx = 0;
    BUFFER.length = 0;
    injectStyles();
    getOrCreateLiveRegion();
    stepEnteredAt = Date.now();
    emitStarted();
    renderStep();
  }

  function next() {
    if (!active) return;
    emitStepCompleted();
    currentIdx++;
    if (currentIdx >= STEPS.length) {
      emitCompleted();
      tearDown();
      persistCompletion();
      active = false;
      showReplayButton();
      return;
    }
    stepEnteredAt = Date.now();
    renderStep();
  }

  function prev() {
    if (!active) return;
    emitStepCompleted();
    currentIdx = Math.max(0, currentIdx - 1);
    stepEnteredAt = Date.now();
    renderStep();
  }

  function skip() {
    if (!active) return;
    emitSkipped();
    tearDown();
    persistCompletion();
    active = false;
    showReplayButton();
  }

  function isActive() {
    return active;
  }

  // ---------------------------------------------------------------------------
  // Replay button
  // ---------------------------------------------------------------------------

  function showReplayButton() {
    var existing = document.getElementById('mbm-tour-replay');
    if (existing) return;
    var btn = document.createElement('button');
    btn.id = 'mbm-tour-replay';
    btn.textContent = t('tour.btn.replay');
    btn.style.cssText = 'font-size:0.8rem;color:#2563eb;background:none;border:none;cursor:pointer;text-decoration:underline;padding:4px 0;';
    btn.addEventListener('click', function () {
      clearCompletion();
      removeReplayButton();
      start();
    });
    var status = document.getElementById('statusBar');
    if (status) status.appendChild(btn);
  }

  function removeReplayButton() {
    var btn = document.getElementById('mbm-tour-replay');
    if (btn) btn.remove();
  }

  // ---------------------------------------------------------------------------
  // Auto-boot
  // ---------------------------------------------------------------------------

  function hasCompleted() {
    try {
      return !!localStorage.getItem(COMPLETION_KEY);
    } catch (_) {
      return false;
    }
  }

  function _autoBoot() {
    if (hasCompleted()) {
      showReplayButton();
      return;
    }
    // Defer so i18n has time to initialise and DOM settles.
    setTimeout(function () {
      // Check again — another script might have set the flag by now.
      if (hasCompleted()) {
        showReplayButton();
        return;
      }
      start();
    }, 50);
  }

  // ---------------------------------------------------------------------------
  // Listen for locale changes
  // ---------------------------------------------------------------------------

  document.addEventListener('langchange', function () {
    if (active) renderStep();
  });

  // ---------------------------------------------------------------------------
  // Keyboard support
  // ---------------------------------------------------------------------------

  document.addEventListener('keydown', function (e) {
    if (!active) return;
    if (e.key === 'Escape') { skip(); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { next(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { prev(); }
  });

  // ---------------------------------------------------------------------------
  // Public API
  // ---------------------------------------------------------------------------

  window.tour = {
    isActive: isActive,
    next: next,
    prev: prev,
    skip: skip,
    steps: STEPS,
  };

  // ---------------------------------------------------------------------------
  // Bootstrap
  // ---------------------------------------------------------------------------

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _autoBoot);
  } else {
    _autoBoot();
  }

})();
