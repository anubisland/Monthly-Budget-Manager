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

  function canonical(value) {
    // Same content, same string — whatever order the keys arrived in. Firestore
    // hands map fields back in its own order, while the app writes them in the
    // order its own serializer chose. Comparing the raw strings therefore says
    // "different" forever, and the bridge spends its life pushing a copy the
    // cloud already has and pulling a copy the device already holds. Sorting
    // recursively (arrays keep their order; they mean something) makes the
    // comparison mean what it claims.
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') {
      return '{' + Object.keys(value).sort().map(function (k) {
        return JSON.stringify(k) + ':' + canonical(value[k]);
      }).join(',') + '}';
    }
    return JSON.stringify(value === undefined ? null : value);
  }

  function hashOfDoc(value) {
    return hashOf(canonical(value));
  }

  /** True when the document holds nothing a user would miss: no month with
   *  content, no goals, no recurring rules, no settled marks. The document's
   *  own `months` map already omits blank months (see budget_data.to_doc), so an
   *  empty device reads `months: {}`. Kept conservative — any content anywhere
   *  makes it non-empty — because it gates an automatic pull, and an automatic
   *  pull must never discard a real copy. */
  function isEmptyDoc(d) {
    if (!d || typeof d !== "object") return true;
    var m = d.months;
    if (m && typeof m === "object" && Object.keys(m).length) return false;
    if (d.goals && d.goals.length) return false;
    if (d.recurring && d.recurring.length) return false;
    if (d.rules && d.rules.length) return false;
    var s = d.settled;
    if (s && typeof s === "object") {
      for (var k in s) { if (s[k] && s[k].length) return false; }
    }
    return true;
  }

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
   *   'ask'  — the two sides diverged in a way this function cannot order:
   *            first sign-in, or both moved since the last agreement, AND the
   *            local copy holds something. The user chooses which copy wins.
   *
   *  `localEmpty` (optional) says the device holds nothing worth keeping. An
   *  empty device is never a conflict worth asking about: there is nothing to
   *  overwrite, so the cloud is simply the user's data. Absent/false leaves the
   *  old behaviour, so callers that do not compute it are unaffected.
   */
  function decide(s) {
    if (s.localHash === s.remoteHash) return 'none';
    if (s.remoteHash === s.lastHash) return 'push';   // remote is what we left it
    if (s.localHash === s.lastHash) return 'pull';    // we left it matching; cloud moved
    // Diverged: neither side is what we left, and both hashes differ.
    //
    // If the device is empty this is not really a contest. Pulling the cloud
    // cannot lose anything here, and asking instead is what made a signed-in
    // reopen greet a returning user with an empty screen and a question — when
    // the only sensible answer was "of course, take the cloud copy".
    if (s.localEmpty) return 'pull';
    //
    // Otherwise neither side is what we left, and both hold something new. This
    // used to fall back to "last write wins" on the two timestamps. It does not
    // any more, because the timestamps are not evidence. The remote one comes
    // from whoever's phone wrote it; the local one is our own clock. A device an
    // hour fast therefore wins every argument it has, forever, and the other
    // device's work is overwritten each time it connects. Calling that
    // last-write-wins was generous: it is wrongest-clock-wins.
    //
    // Ordering these two edits honestly needs a clock both sides trust. Our own
    // un-sent edits do not have one — they have no server time until they are
    // pushed, and pushing is the very thing in question — so the answer is to
    // ask, which is the same protection already used at first sign-in. The
    // everyday case is unaffected: one active device always lands in push or
    // pull above, where the order is actually known.
    return 'ask';
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

  window.__bmSyncLogic = { hashOf, hashOfDoc, canonical, isEmptyDoc, decide, friendlyAuthError };
}());
