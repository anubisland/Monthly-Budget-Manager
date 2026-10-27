/*
 * synclogic.js — the pure decision half of sync, in a plain script so the
 * bridge (sync.js, a module importing Firebase from the CDN) can use it and
 * the tests can assert it without Firebase or a network at all.
 *
 * Conflict policy (the owner's choice): last write wins. The state record
 * (what was last agreed with the cloud, and when we last saw a change) makes
 * every case decidable except one: a first sign-in while both sides already
 * hold different data. That one is the user's call, never the code's.
 */
(function () {
  'use strict';

  function hashOf(text) {
    // FNV-1a over the serialized document. Sync correctness leans on the hash
    // only to answer "is anything different", never to authenticate.
    var h = 0x811c9dc5;
    for (var i = 0; i < text.length; i++) {
      h ^= text.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return (h >>> 0).toString(16) + ':' + text.length;
  }

  /**
   * decide({localHash, remoteHash, lastHash, localAt, remoteAt}) →
   *   'none' — nothing to do (same content, or a remote echo of our own push)
   *   'push' — local changed; send it
   *   'pull' — remote changed; apply it
   *   'ask'  — first sign-in and both sides have different data: the user
   *            chooses which device wins
   */
  function decide(s) {
    if (s.localHash === s.remoteHash) return 'none';
    if (s.remoteHash === s.lastHash) return 'push';   // remote is what we left it
    if (s.localHash === s.lastHash) return 'pull';    // we left it matching; cloud moved
    if (s.lastHash === null) return 'ask';            // first sign-in, both sides differ
    return (s.localAt > s.remoteAt) ? 'push' : 'pull'; // diverged: last write wins
  }

  var AUTH_ERRORS = {
    'auth/invalid-email': 'that email address does not look right',
    'auth/invalid-credential': 'wrong email or password',
    'auth/user-not-found': 'wrong email or password',
    'auth/wrong-password': 'wrong email or password',
    'auth/email-already-in-use': 'that email already has an account — sign in instead',
    'auth/weak-password': 'use a password of at least 6 characters',
    'auth/network-request-failed': 'no network — sync is offline',
    'auth/too-many-requests': 'too many tries — wait a minute',
    'auth/operation-not-allowed': 'email sign-in is not enabled on this Firebase project yet',
    'auth/configuration-not-found': 'email sign-in is not enabled on this Firebase project yet',
    'permission-denied': 'this account cannot write its own sync document'
  };

  function friendlyAuthError(code) {
    if (!AUTH_ERRORS[code] && code) {
      try { console.error('[sync] unmapped error code:', code); } catch (e) {}
    }
    return AUTH_ERRORS[code] || 'sync error — see console';
  }

  window.__bmSyncLogic = { hashOf, decide, friendlyAuthError };
}());
