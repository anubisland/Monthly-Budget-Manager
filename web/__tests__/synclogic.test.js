/**
 * Tests for the sync decision logic — the half that decides push, pull,
 * nothing, or "ask the human". It is deliberately Firebase-free so the
 * conflict policy (last write wins, first sign-in asked) is asserted here
 * rather than inferred from an integration run.
 *
 * @jest-environment-options {"url": "https://anubisland.github.io/Monthly-Budget-Manager/"}
 */

require('../../mobile/src/budget_manager_mobile/web/synclogic.js');

const { hashOf, decide, friendlyAuthError } = window.__bmSyncLogic;

describe('hashOf', () => {
  test('same text, same hash; different text, different hash', () => {
    expect(hashOf('a')).toBe(hashOf('a'));
    expect(hashOf('a')).not.toBe(hashOf('b'));
  });

  test('length is part of the hash, so truncation cannot collide', () => {
    expect(hashOf('abcdef')).not.toBe(hashOf('abcde'));
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

  test('both sides diverged: the newer local write wins', () => {
    expect(decide({ localHash: B, remoteHash: C, lastHash: A, localAt: T + 5, remoteAt: T }))
      .toBe('push');
  });

  test('both sides diverged: the newer remote write wins', () => {
    expect(decide({ localHash: B, remoteHash: C, lastHash: A, localAt: T, remoteAt: T + 5 }))
      .toBe('pull');
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
