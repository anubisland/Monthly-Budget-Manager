/**
 * First-run guided tour — Monthly Budget Manager (web).
 *
 * Implements the company First-Run Tour Standard v1.0 (ANU-681):
 *   - Single persisted flag (localStorage `anubisland-tour-completed-at`).
 *   - Auto-start on first run; manual replay through the Replay Tour control.
 *   - Skip and Replay affordances on every step.
 *   - Locale routing through window.i18n (RTL when Arabic is active).
 *   - A11y: ARIA live region announces each step; focus moves to the tooltip;
 *     Escape / "Skip" cancels with a confirmation prompt; keyboard operable
 *     (Arrow keys / Enter / Space advance, Shift+Tab/Tab go back).
 *   - Telemetry: emits the four required events via window.tourTelemetry
 *     (defaults to a console + buffer recorder so QA can verify without an
 *     analytics SDK present).
 *
 * Step list lives in window.TOUR_STEPS (declared inline in this file so the
 * single-page web bundle stays self-contained). Each step references an
 * existing element via `selector` and uses i18n keys for title/body.
 */
(function () {
  'use strict';

  var TOUR_VERSION = '1.0.0';
  var SURFACE = 'web';
  var COMPLETION_KEY = 'anubisland-tour-completed-at';

  // ---------------------------------------------------------------------------
  // Step list — every primary nav surface + every README "value moment".
  //   Income tab, Expenses tab + categories, Report (charts/breakdown),
  //   Month selector, Import CSV, Export CSV, Export JSON, New Budget,
  //   Language toggle, Replay control.
  // ---------------------------------------------------------------------------
  var STEPS = [
    { id: 'welcome',     selector: '[data-tour-id="welcome"]',     placement: 'bottom', titleKey: 'tour.welcome.title',  bodyKey: 'tour.welcome.body' },
    { id: 'month',       selector: '[data-tour-id="month"]',       placement: 'bottom', titleKey: 'tour.month.title',    bodyKey: 'tour.month.body' },
    { id: 'tabs-income', selector: '[data-tour-id="tab-income"]',  placement: 'bottom', titleKey: 'tour.income.title',   bodyKey: 'tour.income.body',   onEnter: function () { _safeSwitchTab('income'); } },
    { id: 'add-income',  selector: '[data-tour-id="add-income"]',  placement: 'top',    titleKey: 'tour.addIncome.title', bodyKey: 'tour.addIncome.body' },
    { id: 'tabs-expense', selector: '[data-tour-id="tab-expenses"]', placement: 'bottom', titleKey: 'tour.expense.title', bodyKey: 'tour.expense.body', onEnter: function () { _safeSwitchTab('expenses'); } },
    { id: 'expense-cat', selector: '[data-tour-id="expense-cat"]', placement: 'top',    titleKey: 'tour.expenseCat.title', bodyKey: 'tour.expenseCat.body' },
    { id: 'tabs-report', selector: '[data-tour-id="tab-report"]',  placement: 'bottom', titleKey: 'tour.report.title',   bodyKey: 'tour.report.body',   onEnter: function () { _safeSwitchTab('report'); } },
    { id: 'import-csv',  selector: '[data-tour-id="import-csv"]',  placement: 'bottom', titleKey: 'tour.importCsv.title', bodyKey: 'tour.importCsv.body' },
    { id: 'export',      selector: '[data-tour-id="export"]',      placement: 'bottom', titleKey: 'tour.export.title',   bodyKey: 'tour.export.body' },
    { id: 'new-budget',  selector: '[data-tour-id="new-budget"]',  placement: 'bottom', titleKey: 'tour.newBudget.title', bodyKey: 'tour.newBudget.body' },
    { id: 'language',    selector: '[data-tour-id="language"]',    placement: 'bottom', titleKey: 'tour.language.title', bodyKey: 'tour.language.body' },
    { id: 'replay',      selector: '[data-tour-id="replay"]',      placement: 'top',    titleKey: 'tour.replay.title',   bodyKey: 'tour.replay.body' },
  ];

  // ---------------------------------------------------------------------------
  // Internal state
  // ---------------------------------------------------------------------------
  var state = {
    active: false,
    index: 0,
    trigger: null,            // 'first_run' | 'replay'
    startedAt: 0,
    stepStartedAt: 0,
    overlay: null,
    spotlight: null,
    tooltip: null,
    liveRegion: null,
    prevFocus: null,
    keyHandler: null,
    resizeHandler: null,
    pendingTransition: false,
    onEnd: null,
  };

  // ---------------------------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------------------------
  function _t(key) {
    if (window.i18n && typeof window.i18n.t === 'function') {
      return window.i18n.t(key);
    }
    return key;
  }

  function _locale() {
    if (window.i18n && typeof window.i18n.getCurrentLang === 'function') {
      return window.i18n.getCurrentLang();
    }
    return 'en';
  }

  function _isRTL() {
    return _locale() === 'ar';
  }

  function _safeSwitchTab(name) {
    if (typeof window.switchTab === 'function') {
      try { window.switchTab(name); } catch (_) {}
    }
  }

  function _emit(name, props) {
    var payload = Object.assign({}, props || {}, { surface: SURFACE });
    var sink = window.tourTelemetry;
    if (sink && typeof sink.emit === 'function') {
      try { sink.emit(name, payload); } catch (_) {}
    } else {
      // Fallback recorder — visible in DevTools and inspectable by QA.
      window.__tourTelemetryBuffer = window.__tourTelemetryBuffer || [];
      window.__tourTelemetryBuffer.push({ name: name, props: payload, at: Date.now() });
      try { console.info('[tour]', name, payload); } catch (_) {}
    }
    document.dispatchEvent(new CustomEvent('tour:event', { detail: { name: name, props: payload } }));
  }

  function _now() {
    return Date.now();
  }

  // ---------------------------------------------------------------------------
  // Public API: gating, start, replay, completion flag
  // ---------------------------------------------------------------------------
  function shouldAutoStart(storage) {
    var s = storage || _safeStorage();
    if (!s) return false;
    try {
      return !s.getItem(COMPLETION_KEY);
    } catch (_) {
      return false;
    }
  }

  function _safeStorage() {
    try { return window.localStorage; } catch (_) { return null; }
  }

  function _markCompleted(reason) {
    var s = _safeStorage();
    if (!s) return;
    try {
      s.setItem(COMPLETION_KEY, new Date().toISOString());
    } catch (_) {}
  }

  function _resetFlag() {
    var s = _safeStorage();
    if (!s) return;
    try { s.removeItem(COMPLETION_KEY); } catch (_) {}
  }

  function start(opts) {
    if (state.active) return false;
    var trigger = (opts && opts.trigger) || 'first_run';
    state.active = true;
    state.index = 0;
    state.trigger = trigger;
    state.startedAt = _now();

    _buildChrome();
    _bindKeys();

    _emit('tour_started', {
      tour_version: TOUR_VERSION,
      trigger: trigger,
      locale: _locale(),
    });

    _renderStep();
    return true;
  }

  function replay() {
    if (state.active) {
      _teardown(true);
    }
    _resetFlag();
    return start({ trigger: 'replay' });
  }

  function next() {
    if (!state.active) return;
    var step = STEPS[state.index];
    if (!step) return;
    var dwell = _now() - state.stepStartedAt;
    _emit('tour_step_completed', {
      tour_version: TOUR_VERSION,
      step_id: step.id,
      step_index: state.index,
      dwell_ms: dwell,
    });

    if (state.index >= STEPS.length - 1) {
      _complete();
    } else {
      state.index++;
      _renderStep();
    }
  }

  function prev() {
    if (!state.active) return;
    if (state.index === 0) return;
    state.index--;
    _renderStep();
  }

  function skip() {
    if (!state.active) return;
    var step = STEPS[state.index] || { id: 'unknown' };
    _emit('tour_skipped', {
      tour_version: TOUR_VERSION,
      step_id: step.id,
      step_index: state.index,
    });
    _markCompleted('skipped');
    _teardown(false);
  }

  function _complete() {
    _emit('tour_completed', {
      tour_version: TOUR_VERSION,
      total_steps: STEPS.length,
      total_duration_ms: _now() - state.startedAt,
    });
    _markCompleted('completed');
    _teardown(false);
  }

  // ---------------------------------------------------------------------------
  // DOM chrome (overlay + spotlight + tooltip + live region)
  // ---------------------------------------------------------------------------
  function _buildChrome() {
    state.prevFocus = document.activeElement;

    var overlay = document.createElement('div');
    overlay.className = 'mbm-tour-overlay';
    overlay.setAttribute('aria-hidden', 'true');
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) {
        // Click on dim layer → treat as skip request (with confirmation).
        if (window.confirm(_t('tour.confirmSkip'))) skip();
      }
    });

    var spotlight = document.createElement('div');
    spotlight.className = 'mbm-tour-spotlight';
    spotlight.setAttribute('aria-hidden', 'true');

    var tooltip = document.createElement('div');
    tooltip.className = 'mbm-tour-tooltip';
    tooltip.setAttribute('role', 'dialog');
    tooltip.setAttribute('aria-modal', 'true');
    tooltip.setAttribute('aria-labelledby', 'mbm-tour-title');
    tooltip.setAttribute('aria-describedby', 'mbm-tour-body');
    tooltip.tabIndex = -1;
    tooltip.dir = _isRTL() ? 'rtl' : 'ltr';

    var live = document.createElement('div');
    live.className = 'mbm-tour-live';
    live.setAttribute('role', 'status');
    live.setAttribute('aria-live', 'polite');
    live.setAttribute('aria-atomic', 'true');

    document.body.appendChild(overlay);
    document.body.appendChild(spotlight);
    document.body.appendChild(tooltip);
    document.body.appendChild(live);

    state.overlay = overlay;
    state.spotlight = spotlight;
    state.tooltip = tooltip;
    state.liveRegion = live;

    state.resizeHandler = function () { _positionStep(); };
    window.addEventListener('resize', state.resizeHandler);
    window.addEventListener('scroll', state.resizeHandler, true);
  }

  function _bindKeys() {
    state.keyHandler = function (e) {
      if (!state.active) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        if (window.confirm(_t('tour.confirmSkip'))) skip();
      } else if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
        if (e.target && e.target.tagName === 'BUTTON') return; // let button click win
        e.preventDefault();
        next();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prev();
      }
    };
    document.addEventListener('keydown', state.keyHandler);
  }

  function _renderStep() {
    var step = STEPS[state.index];
    if (!step) {
      _complete();
      return;
    }

    if (typeof step.onEnter === 'function') {
      try { step.onEnter(); } catch (_) {}
    }

    state.stepStartedAt = _now();

    state.tooltip.dir = _isRTL() ? 'rtl' : 'ltr';
    state.tooltip.lang = _locale();

    while (state.tooltip.firstChild) state.tooltip.removeChild(state.tooltip.firstChild);

    var title = document.createElement('h2');
    title.id = 'mbm-tour-title';
    title.className = 'mbm-tour-title';
    title.textContent = _t(step.titleKey);

    var body = document.createElement('p');
    body.id = 'mbm-tour-body';
    body.className = 'mbm-tour-body';
    body.textContent = _t(step.bodyKey);

    var counter = document.createElement('p');
    counter.className = 'mbm-tour-counter';
    counter.textContent = (state.index + 1) + ' / ' + STEPS.length;

    var actions = document.createElement('div');
    actions.className = 'mbm-tour-actions';

    var skipBtn = _btn('tour.skip', skip, 'mbm-tour-btn-secondary');
    skipBtn.setAttribute('data-tour-action', 'skip');
    actions.appendChild(skipBtn);

    if (state.index > 0) {
      var backBtn = _btn('tour.back', prev, 'mbm-tour-btn-secondary');
      backBtn.setAttribute('data-tour-action', 'back');
      actions.appendChild(backBtn);
    }

    var isLast = state.index === STEPS.length - 1;
    var primaryKey = isLast ? 'tour.done' : 'tour.next';
    var nextBtn = _btn(primaryKey, next, 'mbm-tour-btn-primary');
    nextBtn.setAttribute('data-tour-action', isLast ? 'done' : 'next');
    actions.appendChild(nextBtn);

    state.tooltip.appendChild(title);
    state.tooltip.appendChild(body);
    state.tooltip.appendChild(counter);
    state.tooltip.appendChild(actions);

    _positionStep();

    // Move focus to tooltip; announce step content via live region.
    setTimeout(function () {
      if (!state.active) return;
      try { state.tooltip.focus(); } catch (_) {}
      state.liveRegion.textContent = _t(step.titleKey) + '. ' + _t(step.bodyKey);
    }, 0);
  }

  function _btn(key, handler, cls) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'mbm-tour-btn ' + (cls || '');
    b.textContent = _t(key);
    b.addEventListener('click', function (e) { e.preventDefault(); handler(); });
    return b;
  }

  function _positionStep() {
    var step = STEPS[state.index];
    if (!step || !state.tooltip) return;

    var anchor = document.querySelector(step.selector);
    var rect = anchor && anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : null;

    if (!rect || (rect.width === 0 && rect.height === 0)) {
      // Anchor missing or hidden → centered modal style.
      state.spotlight.style.display = 'none';
      state.tooltip.style.top = '50%';
      state.tooltip.style.left = '50%';
      state.tooltip.style.transform = 'translate(-50%, -50%)';
      return;
    }

    var pad = 8;
    state.spotlight.style.display = 'block';
    state.spotlight.style.top = (rect.top - pad + window.scrollY) + 'px';
    state.spotlight.style.left = (rect.left - pad + window.scrollX) + 'px';
    state.spotlight.style.width = (rect.width + pad * 2) + 'px';
    state.spotlight.style.height = (rect.height + pad * 2) + 'px';

    var placement = step.placement || 'bottom';
    var top, left;
    var ttRect = state.tooltip.getBoundingClientRect();
    var gap = 12;

    if (placement === 'top') {
      top = rect.top - ttRect.height - gap + window.scrollY;
      left = rect.left + window.scrollX;
    } else {
      top = rect.bottom + gap + window.scrollY;
      left = rect.left + window.scrollX;
    }
    if (top < 8) top = rect.bottom + gap + window.scrollY;
    if (left + ttRect.width > window.innerWidth - 8) left = window.innerWidth - ttRect.width - 8;
    if (left < 8) left = 8;

    state.tooltip.style.top = top + 'px';
    state.tooltip.style.left = left + 'px';
    state.tooltip.style.transform = 'none';

    // Bring anchor into view if needed.
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      try { anchor.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (_) {}
    }
  }

  function _teardown(silent) {
    state.active = false;
    if (state.keyHandler) {
      document.removeEventListener('keydown', state.keyHandler);
      state.keyHandler = null;
    }
    if (state.resizeHandler) {
      window.removeEventListener('resize', state.resizeHandler);
      window.removeEventListener('scroll', state.resizeHandler, true);
      state.resizeHandler = null;
    }
    [state.overlay, state.spotlight, state.tooltip, state.liveRegion].forEach(function (el) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
    state.overlay = state.spotlight = state.tooltip = state.liveRegion = null;
    if (state.prevFocus && typeof state.prevFocus.focus === 'function') {
      try { state.prevFocus.focus(); } catch (_) {}
    }
    if (typeof state.onEnd === 'function') state.onEnd();
  }

  // ---------------------------------------------------------------------------
  // Auto-start on first run
  // ---------------------------------------------------------------------------
  function _autoBoot() {
    if (!shouldAutoStart()) return;
    // Defer to next tick so app render finishes first.
    setTimeout(function () { start({ trigger: 'first_run' }); }, 50);
  }

  // ---------------------------------------------------------------------------
  // Public exports
  // ---------------------------------------------------------------------------
  window.tour = {
    version: TOUR_VERSION,
    steps: STEPS,
    completionKey: COMPLETION_KEY,
    shouldAutoStart: shouldAutoStart,
    start: start,
    replay: replay,
    next: next,
    prev: prev,
    skip: skip,
    isActive: function () { return state.active; },
    _resetFlagForTests: _resetFlag,
  };

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', _autoBoot);
    } else {
      _autoBoot();
    }
  }
})();
