/*
 * rules_emu_check.mjs â€” proves firestore.rules against the running emulator.
 *
 * Deliberately dependency-free (node + fetch): it speaks the Firestore v1
 * REST API and the Auth emulator's account:signUp, so nothing about a test
 * harness can mask a rules failure. Run from the repo root:
 *
 *   firebase emulators:exec "node scripts/rules_emu_check.mjs" --only auth,firestore
 *
 * It checks exactly what the sync bridge assumes: each signed-in user owns
 * budgets/{uid} and nothing else â€” not another user's copy, not an anonymous
 * read, not even deleting their own.
 */

const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const FS = "http://127.0.0.1:8080/v1/projects/budget-manager-31025/databases/(default)/documents";

async function signUp() {
  const r = await fetch(`${AUTH}/accounts:signUp?key=test-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `sync-test-${Date.now()}-${Math.random()}@example.invalid`, password: "secret123" }),
  });
  if (!r.ok) throw new Error("emulator auth signUp failed: " + r.status);
  const j = await r.json();
  return { token: j.idToken, uid: j.localId };
}

function call(method, path, token, body) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  return fetch(FS + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
}

const docBody = { fields: { data: { mapValue: { fields: { version: { integerValue: "2" } } } }, savedAt: { integerValue: "1" } } };

const results = [];
async function check(name, expected, r) {
  const text = r.ok ? "" : (await r.text()).slice(0, 300);
  const ok = r.status === expected;
  results.push({ name, ok });
  console.log((ok ? "PASS" : "FAIL") + "  " + name + "  [HTTP " + r.status + (ok ? "]" : "] " + text));
}

const alice = await signUp();
const bob = await signUp();

// Owner writes and reads their own document.
let r = await call("PATCH", "/budgets/" + alice.uid, alice.token, docBody);
await check("owner writes budgets/{own}", 200, r);

r = await call("GET", "/budgets/" + alice.uid, alice.token);
await check("owner reads budgets/{own}", 200, r);

// Another signed-in user is closed out completely.
r = await call("GET", "/budgets/" + alice.uid, bob.token);
await check("other user cannot read", 403, r);

r = await call("PATCH", "/budgets/" + alice.uid, bob.token, docBody);
await check("other user cannot write", 403, r);

// Anonymous is closed both ways.
r = await call("GET", "/budgets/" + alice.uid, null);
await check("anonymous cannot read", 403, r);

r = await call("PATCH", "/budgets/" + alice.uid, null, docBody);
await check("anonymous cannot write", 403, r);

// Deletion and stray collections stay closed even for the owner.
r = await call("DELETE", "/budgets/" + alice.uid, alice.token);
await check("owner cannot delete own document", 403, r);

r = await call("PATCH", "/elsewhere/x", alice.token, docBody);
await check("anything outside budgets/ is closed", 403, r);

const failed = results.filter((x) => !x.ok);
console.log(failed.length ? `\n${failed.length} RULE CHECK(S) FAILED` : "\nall rule checks passed");
process.exit(failed.length ? 1 : 0);
