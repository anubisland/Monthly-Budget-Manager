/**
 * Tests for the first-run guided tour (web/tour.js).
 *
 * Verifies the contracts from the company First-Run Tour Standard v1.0:
 *   - shouldAutoStart() based on the persisted completion flag.
 *   - All four telemetry events (tour_started, tour_step_completed,
 *     tour_completed, tour_skipped) fire with the documented props.
 *   - Skip and replay behaviour (flag set on skip; replay clears the flag).
 *   - Step list covers each anchor present in the DOM fixture.
 *   - Tour mounts overlay/spotlight/tooltip and live region; teardown removes them.
 */

// localStorage mock
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: jest.fn((key) => (key in store ? store[key] : null)),
    setItem: jest.fn((key, value) => { store[key] = String(value); }),
    removeItem: jest.fn((key) => { delete store[key]; }),
    clear: jest.fn(() => { store = {}; }),
    _reset: () => { store = {}; },
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock, configurable: true });

window.alert = jest.fn();
window.confirm = jest.fn(() => true);
window.scrollTo = jest.fn();
HTMLElement.prototype.scrollIntoView = jest.fn();

// i18n mock — return key so assertions stay readable.
window.i18n = {
  t: jest.fn((key) => key),
  getCurrentLang: jest.fn(() => 'en'),
  setLanguage: jest.fn(),
  render: jest.fn(),
  init: jest.fn(),
};

// Capture telemetry through the documented sink.
const telemetry = [];
window.tourTelemetry = { emit: (name, props) => telemetry.push({ name, props }) };

// Build a fixture that has an anchor for every tour step's selector.
function buildFixture() {
  document.body.innerHTML = `
    <div data-tour-id="welcome">welcome</div>
    <div data-tour-id="month"><input id="monthInput" type="month"></div>
    <button data-tour-id="tab-income">Income</button>
    <div data-tour-id="add-income">add</div>
    <button data-tour-id="tab-expenses">Expenses</button>
    <div data-tour-id="expense-cat"><select id="expenseCategory"></select></div>
    <button data-tour-id="tab-report">Report</button>
    <label data-tour-id="import-csv">Import CSV</label>
    <span data-tour-id="export">Export</span>
    <button data-tour-id="new-budget">New Budget</button>
    <button data-tour-id="language">EN/AR</button>
    <button data-tour-id="replay">Replay</button>
  `;
  // Stub bounding rects so positioning doesn't fall back to centred modal.
  Element.prototype.getBoundingClientRect = function () {
    return { top: 100, left: 100, width: 200, height: 40, right: 300, bottom: 140, x: 100, y: 100, toJSON() {} };
  };
}

buildFixture();

// Load the module (IIFE) — exposes window.tour.
require('../tour.js');

const tour = window.tour;

function reset() {
  if (tour.isActive()) tour.skip();
  localStorageMock._reset();
  telemetry.length = 0;
  window.confirm.mockReturnValue(true);
}

describe('tour.shouldAutoStart()', () => {
  beforeEach(reset);

  test('true when completion flag absent', () => {
    expect(tour.shouldAutoStart()).toBe(true);
  });

  test('false when completion flag is set', () => {
    window.localStorage.setItem(tour.completionKey, '2026-05-04T00:00:00Z');
    expect(tour.shouldAutoStart()).toBe(false);
  });
});

describe('tour.start() / next()', () => {
  beforeEach(reset);

  test('emits tour_started with required props', () => {
    tour.start({ trigger: 'first_run' });
    const evt = telemetry.find((e) => e.name === 'tour_started');
    expect(evt).toBeTruthy();
    expect(evt.props.tour_version).toBe('1.0.0');
    expect(evt.props.trigger).toBe('first_run');
    expect(evt.props.locale).toBe('en');
    expect(evt.props.surface).toBe('web');
  });

  test('next() emits tour_step_completed with step_id, step_index, dwell_ms', () => {
    tour.start({ trigger: 'first_run' });
    tour.next();
    const evt = telemetry.find((e) => e.name === 'tour_step_completed');
    expect(evt).toBeTruthy();
    expect(evt.props.step_id).toBe('welcome');
    expect(evt.props.step_index).toBe(0);
    expect(typeof evt.props.dwell_ms).toBe('number');
  });

  test('walks all steps and emits tour_completed at the end', () => {
    tour.start({ trigger: 'first_run' });
    const total = tour.steps.length;
    for (let i = 0; i < total; i++) {
      tour.next();
    }
    const completed = telemetry.find((e) => e.name === 'tour_completed');
    expect(completed).toBeTruthy();
    expect(completed.props.total_steps).toBe(total);
    expect(typeof completed.props.total_duration_ms).toBe('number');
    expect(window.localStorage.getItem(tour.completionKey)).toBeTruthy();
    expect(tour.isActive()).toBe(false);
  });
});

describe('tour.skip()', () => {
  beforeEach(reset);

  test('emits tour_skipped, sets completion flag, tears down DOM', () => {
    tour.start({ trigger: 'first_run' });
    tour.next(); // advance to step index 1 so the skipped step is meaningful
    tour.skip();
    const skipped = telemetry.find((e) => e.name === 'tour_skipped');
    expect(skipped).toBeTruthy();
    expect(skipped.props.step_id).toBe('month');
    expect(skipped.props.step_index).toBe(1);
    expect(window.localStorage.getItem(tour.completionKey)).toBeTruthy();
    expect(document.querySelector('.mbm-tour-tooltip')).toBeNull();
    expect(document.querySelector('.mbm-tour-overlay')).toBeNull();
  });
});

describe('tour.replay()', () => {
  beforeEach(reset);

  test('clears completion flag and re-starts with trigger=replay', () => {
    window.localStorage.setItem(tour.completionKey, '2026-05-04T00:00:00Z');
    expect(tour.shouldAutoStart()).toBe(false);

    tour.replay();
    const started = telemetry.find((e) => e.name === 'tour_started');
    expect(started.props.trigger).toBe('replay');
    expect(window.localStorage.getItem(tour.completionKey)).toBeNull();
    expect(tour.isActive()).toBe(true);
  });
});

describe('a11y / chrome', () => {
  beforeEach(reset);

  test('mounts a tooltip with role=dialog and a polite live region', () => {
    tour.start({ trigger: 'first_run' });
    const tooltip = document.querySelector('.mbm-tour-tooltip');
    const live = document.querySelector('.mbm-tour-live');
    expect(tooltip).toBeTruthy();
    expect(tooltip.getAttribute('role')).toBe('dialog');
    expect(tooltip.getAttribute('aria-modal')).toBe('true');
    expect(live).toBeTruthy();
    expect(live.getAttribute('aria-live')).toBe('polite');
  });

  test('renders Skip button on every step', () => {
    tour.start({ trigger: 'first_run' });
    const skipBtn = document.querySelector('[data-tour-action="skip"]');
    expect(skipBtn).toBeTruthy();
    tour.next();
    const skipBtn2 = document.querySelector('[data-tour-action="skip"]');
    expect(skipBtn2).toBeTruthy();
  });

  test('Escape with confirmation triggers skip', () => {
    tour.start({ trigger: 'first_run' });
    window.confirm.mockReturnValueOnce(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(tour.isActive()).toBe(false);
    expect(telemetry.find((e) => e.name === 'tour_skipped')).toBeTruthy();
  });

  test('RTL: tooltip dir flips when locale is Arabic', () => {
    window.i18n.getCurrentLang.mockReturnValue('ar');
    tour.start({ trigger: 'first_run' });
    const tooltip = document.querySelector('.mbm-tour-tooltip');
    expect(tooltip.dir).toBe('rtl');
    window.i18n.getCurrentLang.mockReturnValue('en');
  });
});

describe('coverage of value-moment anchors', () => {
  test('every step selector resolves against the rendered fixture', () => {
    tour.steps.forEach((step) => {
      expect(document.querySelector(step.selector)).toBeTruthy();
    });
  });
});
