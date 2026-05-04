// Deterministic evidence capture for the first-run tour (ANU-701).
// Runs `web/tour.js` against `web/index.html` inside jsdom — no browser
// required — and emits the artifacts §5 DoD of the First-Run Tour Standard
// (ANU-681) needs that do NOT require a real renderer:
//   - DoD #1: auto-mount confirmation (tooltip present, focus on tooltip,
//             flag absent before walkthrough, flag set after).
//   - DoD #6: full telemetry buffer for one complete + one skipped walkthrough,
//             with all four event types and the documented props.
//   - DoD #5: a11y wiring snapshot — role / aria-modal / aria-labelledby /
//             aria-describedby / focus / live-region attrs, both EN and AR.
//   - DoD #4: AR + RTL DOM proof — html[dir=rtl], lang=ar, tooltip dir=rtl,
//             Arabic copy rendered. (Visual layout screenshot still requires
//             the puppeteer script — see capture-tour-evidence-puppeteer.mjs.)
//   - DoD #5: WCAG 2.2 AA contrast ratios for every tour color pair.
//
// Date.now() is stamped to a fixed origin so dwell_ms / total_duration_ms
// are reproducible across runs.

import { JSDOM } from 'jsdom';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = resolve(__dirname, '..');
const EVIDENCE_DIR = join(WEB_DIR, 'evidence');

async function buildDom({ lang = 'en' } = {}) {
  const html = await readFile(join(WEB_DIR, 'index.html'), 'utf8');
  const i18nSrc = await readFile(join(WEB_DIR, 'i18n.js'), 'utf8');
  const tourSrc = await readFile(join(WEB_DIR, 'tour.js'), 'utf8');

  const dom = new JSDOM(html, {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://example.test/',
  });
  const { window } = dom;

  // Deterministic Date.now(): each call advances 100 ms from a fixed origin.
  let t = Date.UTC(2026, 4, 4, 9, 0, 0);
  window.eval(`
    (function () {
      var t = ${t};
      var realDate = Date;
      Date = class extends realDate {
        constructor() {
          if (arguments.length === 0) return new realDate(t);
          return new realDate(...arguments);
        }
        static now() { var v = t; t += 100; return v; }
      };
      Date.UTC = realDate.UTC;
      Date.parse = realDate.parse;
    })();
  `);

  // Auto-confirm dialogs so Esc / overlay-click skip paths don't block.
  window.confirm = () => true;

  // Pre-seed locale before i18n.init() runs.
  if (lang) window.localStorage.setItem('anubisland-lang', lang);
  // Ensure no completion flag at start.
  window.localStorage.removeItem('anubisland-tour-completed-at');

  // Stub bounding rects so positioning doesn't fall back to centred-modal.
  window.eval(`
    Element.prototype.getBoundingClientRect = function () {
      return { top: 100, left: 100, width: 200, height: 40,
               right: 300, bottom: 140, x: 100, y: 100, toJSON: function(){} };
    };
  `);

  // Execute i18n then tour.js — this triggers _autoBoot() because the
  // completion flag is absent. Tour mounts via setTimeout(50) so we tick.
  window.eval(i18nSrc);
  window.eval(tourSrc);
  // Drain the autoBoot setTimeout(50). Run a few ticks just in case.
  await new Promise((r) => setTimeout(r, 80));
  return { dom, window };
}

function snapshotWiring(window) {
  const tt = window.document.querySelector('.mbm-tour-tooltip');
  const live = window.document.querySelector('.mbm-tour-live');
  const title = tt && tt.querySelector('.mbm-tour-title');
  const body = tt && tt.querySelector('.mbm-tour-body');
  return {
    htmlLang: window.document.documentElement.lang,
    htmlDir: window.document.documentElement.dir,
    tooltip: tt && {
      role: tt.getAttribute('role'),
      ariaModal: tt.getAttribute('aria-modal'),
      ariaLabelledby: tt.getAttribute('aria-labelledby'),
      ariaDescribedby: tt.getAttribute('aria-describedby'),
      tabindex: tt.getAttribute('tabindex'),
      dir: tt.dir,
      lang: tt.lang,
      focused: window.document.activeElement === tt,
    },
    title: title && { id: title.id, text: title.textContent },
    body: body && { id: body.id, text: body.textContent },
    liveRegion: live && {
      role: live.getAttribute('role'),
      ariaLive: live.getAttribute('aria-live'),
      ariaAtomic: live.getAttribute('aria-atomic'),
      text: live.textContent,
    },
    buttons: Array.from(tt ? tt.querySelectorAll('button') : []).map((b) => ({
      action: b.getAttribute('data-tour-action'),
      text: b.textContent,
    })),
  };
}

async function captureAutoStart() {
  const { window } = await buildDom();
  const tour = window.tour;
  const wiring = snapshotWiring(window);
  return {
    tooltipMounted: !!window.document.querySelector('.mbm-tour-tooltip'),
    completionFlagBeforeWalkthrough: window.localStorage.getItem('anubisland-tour-completed-at'),
    tourActiveOnLoad: tour.isActive(),
    welcomeStep: wiring,
  };
}

async function captureFullWalkthrough() {
  const { window } = await buildDom();
  const tour = window.tour;
  for (let i = 0; i < tour.steps.length; i++) tour.next();
  return {
    buffer: window.__tourTelemetryBuffer,
    completionFlagAfter: window.localStorage.getItem('anubisland-tour-completed-at'),
    tourActiveAfter: tour.isActive(),
  };
}

async function captureSkippedWalkthrough() {
  const { window } = await buildDom();
  const tour = window.tour;
  tour.next();
  tour.next();
  tour.skip();
  return {
    buffer: window.__tourTelemetryBuffer,
    completionFlagAfter: window.localStorage.getItem('anubisland-tour-completed-at'),
    tourActiveAfter: tour.isActive(),
  };
}

async function captureArabicMidTour() {
  const { window } = await buildDom({ lang: 'ar' });
  const tour = window.tour;
  // Advance to step 4 (add-income) so the snapshot shows a non-welcome step.
  tour.next();
  tour.next();
  tour.next();
  return {
    stepIndex: 3,
    ...snapshotWiring(window),
    htmlClassList: Array.from(window.document.documentElement.classList),
    tooltipOuterHTML: window.document.querySelector('.mbm-tour-tooltip').outerHTML,
  };
}

// WCAG 2.2 relative-luminance + contrast-ratio.
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
}
function relLuminance([r, g, b]) {
  const f = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}
function contrastRatio(fg, bg) {
  const a = relLuminance(hexToRgb(fg));
  const b = relLuminance(hexToRgb(bg));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}
function contrastReport() {
  const PAIRS = [
    { name: 'tooltip body text on tooltip surface', fg: '#374151', bg: '#ffffff', purpose: 'normal text' },
    { name: 'tooltip title text on tooltip surface', fg: '#111827', bg: '#ffffff', purpose: 'large text' },
    { name: 'tooltip counter on tooltip surface', fg: '#6b7280', bg: '#ffffff', purpose: 'normal text (small)' },
    { name: 'primary button text on primary button', fg: '#ffffff', bg: '#2563eb', purpose: 'normal text' },
    { name: 'secondary button text on secondary button', fg: '#1f2937', bg: '#f3f4f6', purpose: 'normal text' },
    { name: 'replay-tour button text on app surface', fg: '#2563eb', bg: '#ffffff', purpose: 'normal text' },
  ];
  return PAIRS.map((p) => {
    const ratio = contrastRatio(p.fg, p.bg);
    return {
      ...p,
      ratio: Math.round(ratio * 100) / 100,
      passesAANormal: ratio >= 4.5,
      passesAALarge: ratio >= 3.0,
    };
  });
}

async function main() {
  await mkdir(EVIDENCE_DIR, { recursive: true });

  const autoStart = await captureAutoStart();
  const full = await captureFullWalkthrough();
  const skipped = await captureSkippedWalkthrough();
  const arabic = await captureArabicMidTour();

  await writeFile(
    join(EVIDENCE_DIR, '02-telemetry-full-walkthrough.json'),
    JSON.stringify(full.buffer, null, 2),
  );
  await writeFile(
    join(EVIDENCE_DIR, '02-telemetry-skipped-walkthrough.json'),
    JSON.stringify(skipped.buffer, null, 2),
  );
  await writeFile(
    join(EVIDENCE_DIR, '04-arabic-mid-tour-dom.html'),
    arabic.tooltipOuterHTML,
  );

  const report = {
    capturedAt: new Date(Date.UTC(2026, 4, 4, 9, 0, 0)).toISOString(),
    tourVersion: '1.0.0',
    surface: 'web',
    captureMode: 'jsdom (deterministic, no real-renderer screenshots)',
    notes: [
      'This is the deterministic capture. Real-browser screenshots are produced',
      'by `capture-tour-evidence-puppeteer.mjs`, executed in CI by the',
      '`web-tour-evidence` GitHub Actions workflow on every push to this branch',
      'and PR. Screenshot artifacts are uploaded to that workflow run.',
    ],
    autoStart: {
      tooltipMounted: autoStart.tooltipMounted,
      tourActiveOnLoad: autoStart.tourActiveOnLoad,
      completionFlagBeforeWalkthrough: autoStart.completionFlagBeforeWalkthrough,
      welcomeStepWiring: autoStart.welcomeStep,
    },
    fullWalkthrough: {
      eventCount: full.buffer.length,
      eventNames: full.buffer.map((e) => e.name),
      tourActiveAfter: full.tourActiveAfter,
      completionFlagAfter: full.completionFlagAfter,
      bufferFile: '02-telemetry-full-walkthrough.json',
    },
    skippedWalkthrough: {
      eventCount: skipped.buffer.length,
      eventNames: skipped.buffer.map((e) => e.name),
      tourActiveAfter: skipped.tourActiveAfter,
      completionFlagAfter: skipped.completionFlagAfter,
      bufferFile: '02-telemetry-skipped-walkthrough.json',
    },
    arabic: {
      stepIndex: arabic.stepIndex,
      htmlLang: arabic.htmlLang,
      htmlDir: arabic.htmlDir,
      htmlClassList: arabic.htmlClassList,
      tooltipDir: arabic.tooltip && arabic.tooltip.dir,
      tooltipLang: arabic.tooltip && arabic.tooltip.lang,
      titleText: arabic.title && arabic.title.text,
      bodyText: arabic.body && arabic.body.text,
      domFile: '04-arabic-mid-tour-dom.html',
    },
    contrast: contrastReport(),
  };
  await writeFile(
    join(EVIDENCE_DIR, '00-evidence-report.json'),
    JSON.stringify(report, null, 2),
  );
  console.log('Evidence captured:');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
