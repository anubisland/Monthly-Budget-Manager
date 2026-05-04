// Live-browser evidence capture for the first-run tour (ANU-701).
// Drives `web/index.html` via headless Chromium and emits the artifacts §5 DoD
// of the First-Run Tour Standard (ANU-681) requires from a real browser pass:
//   - DoD #1: fresh-profile auto-start screenshot
//   - DoD #6: telemetry buffer dumps for one full + one skipped walkthrough
//   - DoD #4: AR + RTL screenshot of a mid-tour tooltip (visual layout flip)
//   - DoD #5: a11y wiring snapshot (role/aria attributes, focus, live region)
//
// The deterministic-only artifacts (telemetry buffers, a11y wiring snapshot,
// contrast math) are also produced by `capture-tour-evidence-jsdom.mjs`,
// which runs without a browser. This script ADDS the rendered screenshots.
// Outputs go to web/evidence/. Use the `web-tour-evidence.yml` CI workflow
// to run this on ubuntu-latest where the Chromium system libs are present.

import puppeteer from 'puppeteer';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEB_DIR = resolve(__dirname, '..');
const EVIDENCE_DIR = join(WEB_DIR, 'evidence');
const INDEX_URL = pathToFileURL(join(WEB_DIR, 'index.html')).toString();

const VIEWPORT = { width: 1280, height: 900, deviceScaleFactor: 1 };

async function bootPage(browser, { lang } = {}) {
  const page = await browser.newPage();
  await page.setViewport(VIEWPORT);

  // Stamp Date.now() to a fixed origin so dwell_ms / total_duration_ms are
  // reproducible across captures. Each call to Date.now() advances 100 ms.
  await page.evaluateOnNewDocument(() => {
    let t = Date.UTC(2026, 4, 4, 9, 0, 0); // 2026-05-04T09:00:00Z
    const realDate = Date;
    // eslint-disable-next-line no-global-assign
    Date = class extends realDate {
      constructor(...args) {
        if (args.length === 0) return new realDate(t);
        return new realDate(...args);
      }
      static now() { const v = t; t += 100; return v; }
    };
    Date.UTC = realDate.UTC;
    Date.parse = realDate.parse;
    // Skip-on-overlay path uses window.confirm; auto-confirm so the script
    // never blocks waiting for a dialog.
    window.confirm = () => true;
  });

  // Pre-seed locale BEFORE the page scripts run so i18n.init() picks it up
  // and the tour mounts in the right direction on the very first frame.
  if (lang) {
    await page.evaluateOnNewDocument((l) => {
      try { localStorage.setItem('anubisland-lang', l); } catch (_) {}
    }, lang);
  }

  // Always start from a clean profile (no completion flag).
  await page.evaluateOnNewDocument(() => {
    try { localStorage.removeItem('anubisland-tour-completed-at'); } catch (_) {}
  });

  page.on('pageerror', (err) => console.error('[pageerror]', err));
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.error('[console error]', msg.text());
  });

  await page.goto(INDEX_URL, { waitUntil: 'load' });
  // Tour auto-boot defers via setTimeout(50). Wait for the tooltip to mount.
  await page.waitForSelector('.mbm-tour-tooltip', { timeout: 5000 });
  return page;
}

async function captureAutoStart(browser) {
  const page = await bootPage(browser);
  await page.screenshot({
    path: join(EVIDENCE_DIR, '01-autostart-fresh-profile.png'),
    fullPage: false,
  });
  // Snapshot the welcome step's wiring while we have it on screen.
  const wiring = await page.evaluate(() => {
    const tt = document.querySelector('.mbm-tour-tooltip');
    const live = document.querySelector('.mbm-tour-live');
    const title = tt && tt.querySelector('.mbm-tour-title');
    const body = tt && tt.querySelector('.mbm-tour-body');
    return {
      htmlLang: document.documentElement.lang,
      htmlDir: document.documentElement.dir,
      tooltip: tt && {
        role: tt.getAttribute('role'),
        ariaModal: tt.getAttribute('aria-modal'),
        ariaLabelledby: tt.getAttribute('aria-labelledby'),
        ariaDescribedby: tt.getAttribute('aria-describedby'),
        tabindex: tt.getAttribute('tabindex'),
        dir: tt.dir,
        lang: tt.lang,
        focused: document.activeElement === tt,
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
      tourCompletionFlag: localStorage.getItem('anubisland-tour-completed-at'),
    };
  });
  await page.close();
  return wiring;
}

async function captureFullWalkthrough(browser) {
  const page = await bootPage(browser);
  // Walk all 12 steps to completion.
  const totalSteps = await page.evaluate(() => window.tour.steps.length);
  for (let i = 0; i < totalSteps; i++) {
    await page.evaluate(() => window.tour.next());
  }
  // Tour should now be torn down and flag persisted.
  const result = await page.evaluate(() => ({
    buffer: window.__tourTelemetryBuffer,
    completionFlag: localStorage.getItem('anubisland-tour-completed-at'),
    isActive: window.tour.isActive(),
  }));
  await page.close();
  return result;
}

async function captureSkippedWalkthrough(browser) {
  const page = await bootPage(browser);
  // Advance two steps then skip.
  await page.evaluate(() => window.tour.next());
  await page.evaluate(() => window.tour.next());
  await page.evaluate(() => window.tour.skip());
  const result = await page.evaluate(() => ({
    buffer: window.__tourTelemetryBuffer,
    completionFlag: localStorage.getItem('anubisland-tour-completed-at'),
    isActive: window.tour.isActive(),
  }));
  await page.close();
  return result;
}

async function captureArabicMidTour(browser) {
  const page = await bootPage(browser, { lang: 'ar' });
  // Advance to step 4 (add-income) so the screenshot shows a non-welcome step
  // with spotlight + tooltip in mid-tour layout.
  await page.evaluate(() => window.tour.next());
  await page.evaluate(() => window.tour.next());
  await page.evaluate(() => window.tour.next());
  await page.screenshot({
    path: join(EVIDENCE_DIR, '03-arabic-rtl-mid-tour.png'),
    fullPage: false,
  });
  const wiring = await page.evaluate(() => {
    const tt = document.querySelector('.mbm-tour-tooltip');
    const title = tt && tt.querySelector('.mbm-tour-title');
    const body = tt && tt.querySelector('.mbm-tour-body');
    return {
      htmlLang: document.documentElement.lang,
      htmlDir: document.documentElement.dir,
      tooltipDir: tt && tt.dir,
      tooltipLang: tt && tt.lang,
      titleText: title && title.textContent,
      bodyText: body && body.textContent,
      stepIndex: 3,
    };
  });
  await page.close();
  return wiring;
}

// WCAG 2.2 relative-luminance and contrast-ratio formulas.
function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = h.length === 3
    ? h.split('').map((c) => c + c).join('')
    : h;
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
    const aaNormal = ratio >= 4.5;
    const aaLarge = ratio >= 3.0;
    return {
      ...p,
      ratio: Math.round(ratio * 100) / 100,
      passesAANormal: aaNormal,
      passesAALarge: aaLarge,
    };
  });
}

async function main() {
  await mkdir(EVIDENCE_DIR, { recursive: true });

  const launchOpts = {
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage'],
  };
  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOpts.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }
  const browser = await puppeteer.launch(launchOpts);
  try {
    const autoStart = await captureAutoStart(browser);
    const fullRun = await captureFullWalkthrough(browser);
    const skippedRun = await captureSkippedWalkthrough(browser);
    const arabic = await captureArabicMidTour(browser);

    await writeFile(
      join(EVIDENCE_DIR, '02-telemetry-full-walkthrough.json'),
      JSON.stringify(fullRun.buffer, null, 2),
    );
    await writeFile(
      join(EVIDENCE_DIR, '02-telemetry-skipped-walkthrough.json'),
      JSON.stringify(skippedRun.buffer, null, 2),
    );

    const report = {
      capturedAt: new Date(Date.UTC(2026, 4, 4, 9, 0, 0)).toISOString(),
      tourVersion: '1.0.0',
      surface: 'web',
      indexUrl: INDEX_URL,
      autoStart: {
        screenshot: '01-autostart-fresh-profile.png',
        documentLang: autoStart.htmlLang,
        documentDir: autoStart.htmlDir,
        tooltipMounted: !!autoStart.tooltip,
        focusOnTooltip: autoStart.tooltip && autoStart.tooltip.focused,
        completionFlagBeforeWalkthrough: autoStart.tourCompletionFlag,
      },
      a11yWiring: {
        tooltip: autoStart.tooltip,
        title: autoStart.title,
        body: autoStart.body,
        liveRegion: autoStart.liveRegion,
        buttons: autoStart.buttons,
      },
      fullWalkthrough: {
        eventCount: fullRun.buffer.length,
        firstEvent: fullRun.buffer[0] && fullRun.buffer[0].name,
        lastEvent: fullRun.buffer[fullRun.buffer.length - 1] && fullRun.buffer[fullRun.buffer.length - 1].name,
        completionFlagAfter: fullRun.completionFlag,
        tourActiveAfter: fullRun.isActive,
        bufferFile: '02-telemetry-full-walkthrough.json',
      },
      skippedWalkthrough: {
        eventCount: skippedRun.buffer.length,
        lastEvent: skippedRun.buffer[skippedRun.buffer.length - 1] && skippedRun.buffer[skippedRun.buffer.length - 1].name,
        completionFlagAfter: skippedRun.completionFlag,
        tourActiveAfter: skippedRun.isActive,
        bufferFile: '02-telemetry-skipped-walkthrough.json',
      },
      arabic: {
        screenshot: '03-arabic-rtl-mid-tour.png',
        ...arabic,
      },
      contrast: contrastReport(),
    };
    await writeFile(
      join(EVIDENCE_DIR, '00-evidence-report.json'),
      JSON.stringify(report, null, 2),
    );
    console.log('Evidence captured:');
    console.log(JSON.stringify(report, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
