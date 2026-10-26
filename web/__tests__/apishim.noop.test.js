/**
 * The shim must stay inert on 127.0.0.1/localhost, where the mobile app's real
 * Python server answers /api/*. If it patched fetch there, the APK would
 * silently switch from the device store to localStorage.
 *
 * This file runs at the default jsdom URL (http://localhost/) on purpose.
 */

test('fetch is left untouched on localhost', () => {
  const sentinel = jest.fn();
  window.fetch = sentinel;
  jest.resetModules();
  require('../../mobile/src/budget_manager_mobile/web/apishim.js');
  expect(window.fetch).toBe(sentinel);
  expect(localStorage.getItem('bm.data')).toBeNull();
});
