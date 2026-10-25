/**
 * The page itself, checked against the scripts that drive it.
 *
 * A restyle moves markup, and a moved id is a screen that silently stops
 * updating: getElementById returns null, the guard in the script skips it,
 * and nothing throws. These are the ids the scripts and the tour need.
 */

const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function page() {
  return new DOMParser().parseFromString(HTML, 'text/html');
}

const REQUIRED_IDS = [
  // shell + month
  'langToggle', 'monthInput', 'csvImport', 'statusBar',
  // month at a glance
  'heroNet', 'heroBarFill', 'heroSub', 'heroFootIncome', 'heroFootExpenses',
  'statIncome', 'statExpenses', 'statNet',
  // tabs and forms
  'tab-income', 'tab-expenses', 'tab-report',
  'incomeName', 'incomeAmount', 'incomeDate',
  'expenseName', 'expenseCategory', 'expenseAmount', 'expenseDate',
  // tables
  'incomeTableBody', 'incomeEmpty', 'expenseTableBody', 'expenseEmpty',
  'breakdownTableBody', 'reportEmpty',
  // report
  'reportTotalIncome', 'reportTotalExpenses', 'reportNet', 'reportMargin',
  'barChart', 'pieChart',
  // statement import
  'statementPanel', 'statementText', 'statementMonth', 'statementPreview',
  'statementPreviewBody', 'statementCounts', 'statementMore',
  'statementConfirmBtn', 'statementIncludeDups',
  // rules
  'rulesPanel', 'rulesList', 'rulePattern', 'ruleCategory',
];

describe('index.html', () => {
  test('has every id the scripts look up', () => {
    const doc = page();
    const missing = REQUIRED_IDS.filter(id => !doc.getElementById(id));
    expect(missing).toEqual([]);
  });

  test('has no duplicated id', () => {
    const doc = page();
    const seen = new Set();
    const dups = [];
    doc.querySelectorAll('[id]').forEach(el => {
      if (seen.has(el.id)) dups.push(el.id);
      seen.add(el.id);
    });
    expect(dups).toEqual([]);
  });

  test('every label on the page is translated in both languages', () => {
    const doc = page();
    const attrs = ['data-i18n', 'data-i18n-placeholder', 'data-i18n-title', 'data-i18n-option'];
    const keys = [];
    attrs.forEach(attr => {
      doc.querySelectorAll('[' + attr + ']').forEach(el => keys.push(el.getAttribute(attr)));
    });
    expect(keys.length).toBeGreaterThan(50);

    require('../i18n.js');
    const untranslated = [];
    ['en', 'ar'].forEach(lang => {
      window.i18n.setLanguage(lang);
      keys.forEach(key => {
        if (window.i18n.t(key) === key) untranslated.push(lang + ':' + key);
      });
    });
    expect(untranslated).toEqual([]);
  });

  test('loads the parser and the app in that order', () => {
    const doc = page();
    const sources = [...doc.querySelectorAll('script[src]')].map(s => s.getAttribute('src'));
    expect(sources.indexOf('statement.js')).toBeLessThan(sources.indexOf('script.js'));
  });
});
