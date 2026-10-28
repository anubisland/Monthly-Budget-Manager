/*
 * sync.js — optional cross-device sync for Budget Manager.
 *
 * The app behaves exactly as before without it: localStorage (web) or the
 * device file (phone) stays the source of truth. When a user signs in, this
 * module mirrors the whole saved document to Firestore at budgets/{uid},
 * where the deployed rules let only that user read and write it.
 *
 * It reaches the app through the two document routes every host answers —
 * GET /api/doc and POST /api/sync-apply — so the same file drives the Pages
 * build (apishim-backed) and the phone (Python-backed) identically. The
 * conflict decisions live in synclogic.js, next to its tests; this file is
 * only Firebase, fetch and timers around them.
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.2/firebase-app.js";
import {
  getAuth, onAuthStateChanged, signInWithEmailAndPassword,
  createUserWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-auth.js";
import {
  getFirestore, initializeFirestore, persistentLocalCache, persistentMultipleTabManager,
  doc, getDoc, setDoc, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.13.2/firebase-firestore.js";

const LOGIC = window.__bmSyncLogic; // hashOf, decide, friendlyAuthError

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAhQJckeshPLMWva3crKA0iQKe3U9amMgE",
  authDomain: "budget-manager-31025.firebaseapp.com",
  projectId: "budget-manager-31025",
  storageBucket: "budget-manager-31025.firebasestorage.app",
  messagingSenderId: "895949815098",
  appId: "1:895949815098:web:88ec953159aeee9cb9a403"
};

const MAX_DOC_BYTES = 900000; // margin under Firestore's 1 MiB document limit
const PUSH_DEBOUNCE_MS = 1500;

const app = initializeApp(FIREBASE_CONFIG);
const auth = getAuth(app);
// Persistent cache with the usual degrade-to-memory fallback, the same shape
// the other apps on this machine use; localStorage stays the store the app
// itself runs on either way.
let db;
try {
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
} catch (e) {
  db = getFirestore(app);
}

let uid = null;
let unsub = null;
let applyingRemote = false; // a pull in flight must not echo back as a push
let pushTimer = null;
// A parked "ask" conflict: the cloud copy waits here for an explicit tap on
// one of the two buttons in the Settings card. Never auto-resolved.
let pendingConflict = null;
// Set when the reload guard stops a reload: this page is now showing a
// document the cloud has moved past, so its own writes are refused until
// someone reloads it. See the fetch wrapper.
let syncStale = false;

// This wraps fetch after apishim, so mutations on both hosts are visible
// here; everything the bridge itself sends goes through realFetch.
const realFetch = window.fetch.bind(window);

const state = {
  // The keys carry a scheme version. v2.2.5 changed what a hash *is* (a
  // canonical form rather than a raw serialization), and a remembered hash
  // from the old scheme never matches a new one — not even for a document that
  // has not changed at all. Read as a live value it routes decide() past the
  // "first sign-in, ask the human" branch and into last-write-wins, which can
  // replace the user's cloud copy without asking, on an install that did
  // nothing wrong but upgrade. Read as null it routes to the ask branch, which
  // is the honest answer: the two sides have not agreed on anything lately.
  // Bump this suffix whenever the meaning of a stored value changes.
  key: (name) => "bm.sync." + (uid || "-") + "." + name + ".v2",
  lastHash() { try { return localStorage.getItem(this.key("hash")); } catch (e) { return null; } },
  // The time is kept for debugging only. It is deliberately not read back: a
  // device clock that never reaches a decision cannot overwrite anyone's work.
  remember(hash, when) {
    try {
      localStorage.setItem(this.key("hash"), hash);
      localStorage.setItem(this.key("at"), String(when));
    } catch (e) { /* private mode: sync still runs, just forgets between pages */ }
  },
};

function apiPath(input) {
  const href = typeof input === "string" ? input : (input && input.url);
  if (!href) return "";
  try { return new URL(href, window.location.href).pathname; } catch (e) { return ""; }
}

window.fetch = function (input, init) {
  const method = String((init && init.method) || "").toUpperCase();
  const path = apiPath(input);
  const mutating = method === "POST" && /\/api\/[a-z0-9-]+$/.test(path) &&
    !/\/api\/(data|doc|backup)$/.test(path);
  // A page the reload guard left standing is showing a document the cloud has
  // already replaced. Its next edit would write that stale copy back over the
  // pulled one and the loss would then be pushed to the cloud, so while the
  // page knows it is out of date, writes are refused. Every caller reloads the
  // screen when a request fails, which is precisely the recovery wanted here.
  if (mutating && syncStale) {
    return Promise.resolve(new Response(
      JSON.stringify({ error: "data changed — reload the page first" }),
      { status: 409, headers: { "Content-Type": "application/json" } }
    ));
  }
  return realFetch(input, init).then(function (res) {
    if (mutating && res.ok) schedulePush();
    return res;
  });
};

/** One place turns a message key into the language the page is showing.
 *  `t` is a plain global from the inline script, which runs before this
 *  deferred module; if it is missing, or does not know the key, the English
 *  fallback keeps the card truthful. Marking the line as live is what stops
 *  applyI18n from stamping "not signed in" over a real status mid-flight. */
function setStatus(key, fallback) {
  let text = fallback || key;
  try {
    if (typeof t === "function") {
      const v = t(key);
      if (v && v !== key) text = v;
    }
  } catch (e) { /* keep the fallback */ }
  const el = document.getElementById("sync-status");
  if (el) { el.textContent = text; el.dataset.live = "1"; }
}

// A reload is how a pulled document reaches every screen that is already
// drawn. It is also the one thing here that can loop — apply, reload, push,
// snapshot, apply — and on a phone that reads as the whole app shaking.
// Reloads are therefore counted across page loads inside a short window; once
// they are clearly repeating, the bridge unsubscribes and says so instead of
// cycling, and logs what it saw so a field report can be diagnosed rather than
// guessed at.
//
// What this does NOT claim: that the screen left standing is current. A
// suppressed reload means the pulled document is saved but this page still
// shows the old one, so a further edit here writes over the pull. That is a
// known limitation of stopping rather than reloading; the page says sync has
// stopped, and reloading it by hand is the remedy.
const RELOAD_WINDOW_MS = 20000;
const RELOAD_LIMIT = 3;

function reloadBudget() {
  const KEY = "bm.sync.reloads." + (uid || "-");
  let marks = [];
  try {
    const parsed = JSON.parse(localStorage.getItem(KEY) || "[]");
    if (Array.isArray(parsed)) marks = parsed.filter((x) => typeof x === "number");
  } catch (e) { marks = []; }
  const now = Date.now();
  // `when <= now` matters: a backward clock jump leaves future-dated marks
  // whose age is negative, and a negative age is always inside the window —
  // the guard would stay tripped until the clock caught up.
  marks = marks.filter((when) => when <= now && now - when < RELOAD_WINDOW_MS);
  if (marks.length >= RELOAD_LIMIT) {
    try { localStorage.setItem(KEY, JSON.stringify(marks)); } catch (e) {}
    if (unsub) { unsub(); unsub = null; }
    syncStale = true;
    console.error("sync: reload loop suppressed after", marks.length, "reload(s) in", RELOAD_WINDOW_MS, "ms");
    setStatus("sync_loop_stopped",
      "sync kept restarting itself and was stopped — reload the page to catch it up");
    return false;
  }
  marks.push(now);
  try { localStorage.setItem(KEY, JSON.stringify(marks)); } catch (e) {}
  window.location.reload();
  return true;
}

function clearConflict() {
  pendingConflict = null;
  const panel = document.getElementById("sync-conflict");
  if (panel) panel.style.display = "none";
}

function schedulePush() {
  if (!uid || applyingRemote) return;
  // While a first-sign-in conflict is parked, nothing pushes: an edit made
  // before the user answers would otherwise overwrite the very cloud copy
  // the question is about. The answer gates both directions.
  if (pendingConflict) { setStatus("sync_resolve", "resolve the sync question first"); return; }
  if (pushTimer) clearTimeout(pushTimer);
  // The catch keeps a failed push from becoming an unhandled rejection: the
  // status line is the user's only signal, so it must carry it.
  pushTimer = setTimeout(function () {
    pushNow().catch(function () { setStatus("sync_offline_edit", "sync is offline — changes kept on this device"); });
  }, PUSH_DEBOUNCE_MS);
}

async function localDoc() {
  const r = await realFetch("/api/doc");
  if (!r.ok) throw new Error("could not read the local document");
  return r.json();
}

// Firestore's limit is 1 MiB of UTF-8 *bytes*; a JS string length counts
// UTF-16 units, so Arabic and emoji would slip a too-large document past a
// length check. Measure the real encoded size.
const utf8Bytes = (text) => new TextEncoder().encode(text).length;

async function pushNow() {
  if (!uid || applyingRemote || pendingConflict) return false;
  const doc0 = await localDoc();
  const text = JSON.stringify(doc0);
  if (utf8Bytes(text) > MAX_DOC_BYTES) { setStatus("sync_too_big", "data too large to sync — make a backup instead"); return false; }
  const hash = LOGIC.hashOfDoc(doc0);
  if (hash === state.lastHash()) return false; // nothing we have not said
  const at = Date.now();
  try {
    await setDoc(doc(db, "budgets", uid), { data: doc0, savedAt: at, updatedAt: serverTimestamp() });
  } catch (e) {
    setStatus("sync_offline_edit", "sync is offline — changes kept on this device");
    return false;
  }
  state.remember(hash, at);
  setStatus("sync_synced", "synced");
  return true;
}

/** Apply the cloud copy, then reload so every screen shows it. Remembering
 *  the applied hash before the reload means the fresh page sees a matching
 *  pair on its first snapshot and does not echo anything back. */
async function pullApply(remoteDocData, remoteHash, remoteAt) {
  if (!uid) return false; // the session ended between park and tap
  applyingRemote = true;
  try {
    const r = await realFetch("/api/sync-apply", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ doc: remoteDocData }),
    });
    if (!r.ok) { setStatus("sync_refused", "the cloud copy was refused"); return false; }
    state.remember(remoteHash, remoteAt);
    reloadBudget(); // same reasoning as after a restore, counted now
    return true;
  } catch (e) {
    setStatus("sync_apply_failed", "sync is offline — nothing was applied");
    return false;
  } finally {
    applyingRemote = false;
  }
}

async function onRemoteWrite(snap) {
  if (!uid || applyingRemote || !snap.exists()) return;
  const remote = snap.data();
  const remoteAt = remote.savedAt || 0;
  // Both sides hash the canonical form, never a raw string: Firestore reorders
  // map fields, and a raw-string comparison calls that a change forever.
  const remoteHash = LOGIC.hashOfDoc(remote.data);
  const local0 = await localDoc();
  const localHash = LOGIC.hashOfDoc(local0);
  const action = LOGIC.decide({
    localHash, remoteHash,
    lastHash: state.lastHash(),
  });
  if (action === "ask") {
    // "ask": the two copies diverged and nothing here can order them — a first
    // sign-in where both sides already hold different data, or both sides
    // moving since the last agreement. The choice must be a real tap.
    // confirm() is deliberately not used: the Android WebView answers blocking
    // dialogs false unless the host implements onJsConfirm — exactly the
    // silent-default this page's own reset flow warns about — and a false here
    // would overwrite the cloud unseen. Without the card at all, take the
    // non-destructive branch: pulling can be undone by the next push,
    // overwriting the cloud cannot.
    pendingConflict = { data: remote.data, hash: remoteHash, at: remoteAt };
    const panel = document.getElementById("sync-conflict");
    if (!panel) { await pullApply(remote.data, remoteHash, remoteAt); return; }
    setStatus("sync_choose", "choose which copy to keep");
    panel.style.display = "";
    return;
  }
  // Anything else means the clouds parted or matched on their own: a parked
  // question from an earlier snapshot is stale now, and offering it again
  // would apply an old copy over data that has since converged.
  clearConflict();
  if (action === "none") { setStatus("sync_synced", "synced"); return; }
  if (action === "push") { await pushNow(); return; }
  await pullApply(remote.data, remoteHash, remoteAt);
}

function startSession(user) {
  uid = user.uid;
  // The invitation is only honest while nobody is signed in.
  window.__bmSyncSignedIn = true;
  if (window.hideSyncNudge) window.hideSyncNudge();
  if (unsub) unsub();
  clearConflict(); // a park from a previous session belongs to no one
  setStatus("sync_syncing", "syncing");
  // A brand-new account adopts the local data first, so signing in on the
  // phone that holds the budget does not start from an empty cloud.
  getDoc(doc(db, "budgets", uid)).then(function (snap) {
    if (!snap.exists()) return pushNow();
    return null;
  }).catch(function () { /* the snapshot listener will surface failures */ });
  // onSnapshot does not await its observer: a rejection inside onRemoteWrite
  // would surface as an unhandled promise, so the entry point catches.
  unsub = onSnapshot(doc(db, "budgets", uid),
    function (snap) {
      Promise.resolve(onRemoteWrite(snap)).catch(function () {
        setStatus("sync_conn_off", "sync is offline");
      });
    },
    function () { setStatus("sync_conn_off", "sync is offline"); });
}

function endSession() {
  uid = null;
  window.__bmSyncSignedIn = false;
  if (window.maybeShowSyncNudge) window.maybeShowSyncNudge();
  if (unsub) { unsub(); unsub = null; }
  // A parked conflict names a cloud document; it must not survive the
  // session that was asked about it, nor its panel stay answerable.
  clearConflict();
  setStatus("sync_off", "not signed in");
}

function wireUi() {
  // The two conflict answers. Each clears the park first, so a double tap
  // cannot fire both branches. Wired before the form's early return: a page
  // that shows the conflict panel must always be able to answer it.
  const cloud = document.getElementById("sync-keep-cloud");
  if (cloud) cloud.addEventListener("click", async function () {
    if (!pendingConflict) return;
    const c = pendingConflict; pendingConflict = null;
    const panel = document.getElementById("sync-conflict");
    if (panel) panel.style.display = "none";
    try { await pullApply(c.data, c.hash, c.at); }
    catch (e) { setStatus("sync_apply_failed", "sync is offline — nothing was applied"); }
  });
  const device = document.getElementById("sync-keep-device");
  if (device) device.addEventListener("click", async function () {
    if (!pendingConflict) return;
    pendingConflict = null;
    const panel = document.getElementById("sync-conflict");
    if (panel) panel.style.display = "none";
    try { await pushNow(); }
    catch (e) { setStatus("sync_offline_edit", "sync is offline — changes kept on this device"); }
  });

  const form = document.getElementById("sync-form");
  if (!form) return; // old cached page without the card: stay headless

  const err = document.getElementById("sync-err");
  form.addEventListener("submit", function (ev) {
    ev.preventDefault();
    const email = document.getElementById("sync-email").value.trim();
    const pass = document.getElementById("sync-pass").value;
    if (err) err.textContent = "";
    const run = form.dataset.mode === "signup"
      ? createUserWithEmailAndPassword(auth, email, pass)
      : signInWithEmailAndPassword(auth, email, pass);
    run.catch(function (e) { if (err) err.textContent = LOGIC.friendlyAuthError(e && e.code); });
  });
  const out = document.getElementById("sync-signout");
  if (out) out.addEventListener("click", function () { signOut(auth); });
  const toggle = document.getElementById("sync-toggle");
  if (toggle) toggle.addEventListener("click", function () {
    form.dataset.mode = form.dataset.mode === "signup" ? "signin" : "signup";
    toggle.textContent = form.dataset.mode === "signup"
      ? "have an account? sign in" : "need an account? create one";
  });
}

/** Show or hide the full-screen sign-in gate. Only this module knows whether the
 *  page is signed in, so it owns the gate's visibility rather than the markup.
 *  Hidden for a signed-in person (the normal, post-persistence launch — no
 *  reason to show a gate they have already passed); shown for a signed-out one,
 *  unless they have already chosen to continue on this device. */
function setGate(signedIn) {
  const gate = document.getElementById("login-gate");
  if (!gate) return; // a build whose cached page has no gate
  if (signedIn) { gate.classList.remove("show"); return; }
  if (window.__bmGateOfflineOk) return;
  gate.classList.add("show");
}

/** Wire the gate's sign-in form. Kept separate from wireUi so it is not gated
 *  behind the settings card's early return, and so the two entry points (the
 *  gate and the card) each own their own DOM without sharing element ids. */
function wireGate() {
  const gateForm = document.getElementById("gate-form");
  if (!gateForm) return;
  const err = document.getElementById("gate-err");
  gateForm.addEventListener("submit", function (ev) {
    ev.preventDefault();
    const email = document.getElementById("gate-email").value.trim();
    const pass = document.getElementById("gate-pass").value;
    if (err) err.textContent = "";
    const run = gateForm.dataset.mode === "signup"
      ? createUserWithEmailAndPassword(auth, email, pass)
      : signInWithEmailAndPassword(auth, email, pass);
    // Success changes the auth state, and onAuthStateChanged hides the gate and
    // starts the session; the only thing to handle here is the failure, kept on
    // the gate itself so the person sees why they did not get in.
    run.catch(function (e) { if (err) err.textContent = LOGIC.friendlyAuthError(e && e.code); });
  });
}

// The card exists on this build and the module loaded: only now is it
  // honest to invite anyone. index.html reads this before showing the
  // one-time nudge, so a page without sync never offers to turn it on.
window.__bmSyncReady = true;
if (window.maybeShowSyncNudge) window.maybeShowSyncNudge();

onAuthStateChanged(auth, function (user) {
  const form = document.getElementById("sync-form");
  const out = document.getElementById("sync-signout");
  if (form) form.style.display = user ? "none" : "";
  if (out) out.style.display = user ? "" : "none";
  setGate(!!user);
  if (user) startSession(user); else endSession();
});

wireUi();
wireGate();
setStatus("sync_checking", "checking");
