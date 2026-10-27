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

// This wraps fetch after apishim, so mutations on both hosts are visible
// here; everything the bridge itself sends goes through realFetch.
const realFetch = window.fetch.bind(window);

const state = {
  key: (name) => "bm.sync." + (uid || "-") + "." + name,
  lastHash() { try { return localStorage.getItem(this.key("hash")); } catch (e) { return null; } },
  lastAt() { try { return Number(localStorage.getItem(this.key("at")) || 0); } catch (e) { return 0; } },
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
  return realFetch(input, init).then(function (res) {
    if (mutating && res.ok) schedulePush();
    return res;
  });
};

function setStatus(text) {
  const el = document.getElementById("sync-status");
  if (el) el.textContent = text;
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
  if (pendingConflict) { setStatus("resolve the sync question first"); return; }
  if (pushTimer) clearTimeout(pushTimer);
  // The catch keeps a failed push from becoming an unhandled rejection: the
  // status line is the user's only signal, so it must carry it.
  pushTimer = setTimeout(function () {
    pushNow().catch(function () { setStatus("sync is offline — changes kept on this device"); });
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
  if (utf8Bytes(text) > MAX_DOC_BYTES) { setStatus("data too large to sync — make a backup instead"); return false; }
  const hash = LOGIC.hashOf(text);
  if (hash === state.lastHash()) return false; // nothing we have not said
  const at = Date.now();
  try {
    await setDoc(doc(db, "budgets", uid), { data: doc0, savedAt: at, updatedAt: serverTimestamp() });
  } catch (e) {
    setStatus("sync is offline — changes kept on this device");
    return false;
  }
  state.remember(hash, at);
  setStatus("synced");
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
    if (!r.ok) { setStatus("the cloud copy was refused"); return false; }
    state.remember(remoteHash, remoteAt);
    window.location.reload(); // same reasoning as after a restore
    return true;
  } catch (e) {
    setStatus("sync is offline — nothing was applied");
    return false;
  } finally {
    applyingRemote = false;
  }
}

async function onRemoteWrite(snap) {
  if (!uid || applyingRemote || !snap.exists()) return;
  const remote = snap.data();
  const remoteAt = remote.savedAt || 0;
  const remoteJson = JSON.stringify(remote.data);
  const remoteHash = LOGIC.hashOf(remoteJson);
  const local0 = await localDoc();
  const localJson = JSON.stringify(local0);
  const localHash = LOGIC.hashOf(localJson);
  const action = LOGIC.decide({
    localHash, remoteHash,
    lastHash: state.lastHash(),
    localAt: state.lastAt(), remoteAt,
  });
  if (action === "ask") {
    // "ask": first sign-in, both sides hold different data. The choice must be
    // a real tap. confirm() is deliberately not used: the Android WebView
    // answers blocking dialogs false unless the host implements onJsConfirm —
    // exactly the silent-default this page's own reset flow warns about — and
    // a false here would overwrite the cloud unseen. Without the card at all,
    // take the non-destructive branch: pulling can be undone by the next push,
    // overwriting the cloud cannot.
    pendingConflict = { data: remote.data, hash: remoteHash, at: remoteAt };
    const panel = document.getElementById("sync-conflict");
    if (!panel) { await pullApply(remote.data, remoteHash, remoteAt); return; }
    setStatus("choose which copy to keep");
    panel.style.display = "";
    return;
  }
  // Anything else means the clouds parted or matched on their own: a parked
  // question from an earlier snapshot is stale now, and offering it again
  // would apply an old copy over data that has since converged.
  clearConflict();
  if (action === "none") { setStatus("synced"); return; }
  if (action === "push") { await pushNow(); return; }
  await pullApply(remote.data, remoteHash, remoteAt);
}

function startSession(user) {
  uid = user.uid;
  if (unsub) unsub();
  clearConflict(); // a park from a previous session belongs to no one
  setStatus("syncing");
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
        setStatus("sync is offline");
      });
    },
    function () { setStatus("sync is offline"); });
}

function endSession() {
  uid = null;
  if (unsub) { unsub(); unsub = null; }
  // A parked conflict names a cloud document; it must not survive the
  // session that was asked about it, nor its panel stay answerable.
  clearConflict();
  setStatus("not signed in");
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
    catch (e) { setStatus("sync is offline — nothing was applied"); }
  });
  const device = document.getElementById("sync-keep-device");
  if (device) device.addEventListener("click", async function () {
    if (!pendingConflict) return;
    pendingConflict = null;
    const panel = document.getElementById("sync-conflict");
    if (panel) panel.style.display = "none";
    try { await pushNow(); }
    catch (e) { setStatus("sync is offline — changes kept on this device"); }
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

onAuthStateChanged(auth, function (user) {
  const form = document.getElementById("sync-form");
  const out = document.getElementById("sync-signout");
  if (form) form.style.display = user ? "none" : "";
  if (out) out.style.display = user ? "" : "none";
  if (user) startSession(user); else endSession();
});

wireUi();
setStatus("checking");
