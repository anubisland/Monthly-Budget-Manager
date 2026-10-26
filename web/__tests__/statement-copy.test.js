/**
 * statement.js exists twice on purpose: web/ ships it to the tests and the
 * old dashboard, and the mobile web directory serves it to the WebView and
 * to the Pages bundle (where apishim.js needs window.statementParser).
 *
 * Two copies drift; this test fails the moment they do, so the fix is a
 * re-copy, not a debugging session against an app that only breaks on
 * device.
 */

const fs = require('fs');
const path = require('path');

test('the mobile web copy of statement.js is byte-identical to web/statement.js', () => {
  const a = fs.readFileSync(path.join(__dirname, '..', 'statement.js'));
  const b = fs.readFileSync(path.join(
    __dirname, '..', '..', 'mobile', 'src', 'budget_manager_mobile', 'web', 'statement.js'));
  expect(b.equals(a)).toBe(true);
});
