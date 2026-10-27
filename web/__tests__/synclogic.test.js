/**
 * Tests for the sync decision logic — the half that decides push, pull,
 * nothing, or "ask the human". It is deliberately Firebase-free so the
 * conflict policy (last write wins, first sign-in asked) is asserted here
 * rather than inferred from an integration run.
 *
 * @jest-environment-options {"url": "https://anubisland.github.io/Monthly-Budget-Manager/"}
 */

require('../../mobile/src/budget_manager_mobile/web/synclogic.js');

const { hashOf, hashOfDoc, canonical, decide, friendlyAuthError } = window.__bmSyncLogic;

describe('hashOf', () => {
  test('same text, same hash; different text, different hash', () => {
    expect(hashOf('a')).toBe(hashOf('a'));
    expect(hashOf('a')).not.toBe(hashOf('b'));
  });

  test('length is part of the hash, so truncation cannot collide', () => {
    expect(hashOf('abcdef')).not.toBe(hashOf('abcde'));
  });
});

describe('hashOfDoc', () => {
  // The bug this guards: the app hashes what it has, Firestore hands the same
  // document back with its map fields in its own order, a raw-string hash calls
  // that a change, and the bridge pushes and pulls forever — on a phone the
  // whole screen reloads several times a second.
  const doc = {
    version: 2, current: '2026-10',
    months: { '2026-10': { entries: [{ name: 'إيجار', amount: 1200.5 }], income: 0, expense: 1200.5 } },
    goals: [{ name: 'g', target: 100 }], recurring: [], rules: [], settled: {},
  };

  function reordered(value) {
    if (Array.isArray(value)) return value.map(reordered);
    if (value && typeof value === 'object') {
      const out = {};
      Object.keys(value).reverse().forEach((k) => { out[k] = reordered(value[k]); });
      return out;
    }
    return value;
  }

  test('key order does not change it', () => {
    const flipped = reordered(doc);
    expect(JSON.stringify(flipped)).not.toBe(JSON.stringify(doc)); // genuinely different strings
    expect(hashOfDoc(flipped)).toBe(hashOfDoc(doc));
  });

  test('nested key order does not change it either', () => {
    expect(hashOfDoc(reordered(reordered(doc)))).toBe(hashOfDoc(doc));
  });

  test('a real value change still changes it', () => {
    const changed = JSON.parse(JSON.stringify(doc));
    changed.months['2026-10'].entries[0].amount = 1201;
    expect(hashOfDoc(changed)).not.toBe(hashOfDoc(doc));
  });

  test('array order still matters — months and entries mean something', () => {
    const swapped = { list: [1, 2] };
    const other = { list: [2, 1] };
    expect(hashOfDoc(swapped)).not.toBe(hashOfDoc(other));
  });

  test('undefined reads as null, so a dropped field is not a phantom change', () => {
    expect(canonical({ a: undefined })).toBe(canonical({ a: null }));
  });

  test('the decide step agrees the two sides match, so nothing ping-pongs', () => {
    const h = hashOfDoc(doc);
    expect(decide({
      localHash: h, remoteHash: hashOfDoc(reordered(doc)),
      lastHash: h, localAt: 1, remoteAt: 2,
    })).toBe('none');
  });
});

describe('decide', () => {
  const T = 1000;
  const A = 'hashA';
  const B = 'hashB';
  const C = 'hashC';

  test('identical documents do nothing', () => {
    expect(decide({ localHash: A, remoteHash: A, lastHash: null, localAt: T, remoteAt: T }))
      .toBe('none');
  });

  test('a remote write that only echoes our own push does nothing', () => {
    // remoteHash is what we last agreed on and local never moved from it...
    expect(decide({ localHash: A, remoteHash: A, lastHash: A, localAt: T, remoteAt: T }))
      .toBe('none');
  });

  test('local changed while the cloud stayed where we left it: push', () => {
    expect(decide({ localHash: B, remoteHash: A, lastHash: A, localAt: T, remoteAt: T }))
      .toBe('push');
  });

  test('the cloud moved while local stayed where we left it: pull', () => {
    expect(decide({ localHash: A, remoteHash: B, lastHash: A, localAt: T, remoteAt: T }))
      .toBe('pull');
  });

  test('first sign-in with different data on both sides is asked, never assumed', () => {
    expect(decide({ localHash: B, remoteHash: A, lastHash: null, localAt: T, remoteAt: T }))
      .toBe('ask');
  });

  // Divergence is asked, not decided by a clock. These replaced "the newer
  // write wins" cases: comparing two device clocks does not establish order,
  // it just rewards whichever device is set wrong. A phone an hour fast used to
  // overwrite the other device on every connection, forever.
  test('both sides diverged is asked, whatever the clocks say', () => {
    expect(decide({ localHash: B, remoteHash: C, lastHash: A, localAt: T + 5, remoteAt: T }))
      .toBe('ask');
    expect(decide({ localHash: B, remoteHash: C, lastHash: A, localAt: T, remoteAt: T + 5 }))
      .toBe('ask');
    expect(decide({ localHash: B, remoteHash: C, lastHash: A, localAt: 0, remoteAt: 0 }))
      .toBe('ask');
  });

  test('a fast local clock does not quietly win the argument', () => {
    // The exact shape of the old bug: local timestamp years ahead of the cloud.
    const years = T + 1000 * 60 * 60 * 24 * 365 * 5;
    expect(decide({ localHash: B, remoteHash: C, lastHash: A, localAt: years, remoteAt: T }))
      .toBe('ask');
  });

  test('a fast remote clock does not quietly overwrite the device either', () => {
    const years = T + 1000 * 60 * 60 * 24 * 365 * 5;
    expect(decide({ localHash: B, remoteHash: C, lastHash: A, localAt: T, remoteAt: years }))
      .toBe('ask');
  });
});

describe('friendlyAuthError', () => {
  test('known codes read as plain language, not raw codes', () => {
    expect(friendlyAuthError('auth/wrong-password')).toBe('wrong email or password');
    expect(friendlyAuthError('auth/network-request-failed')).toContain('offline');
    expect(friendlyAuthError('auth/operation-not-allowed')).toContain('not enabled');
    expect(friendlyAuthError('permission-denied')).toContain('own sync document');
  });

  test('an unknown code is generic but never empty', () => {
    const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const text = friendlyAuthError('auth/made-up');
    expect(text).toBe('sync error — see console');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
