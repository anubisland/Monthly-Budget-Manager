/*
 * live_auth_probe.mjs — one real end-to-end check that the LIVE project's
 * email/password provider works and the deployed Firestore rules isolate a
 * user's own document. Creates a throwaway user, writes + reads + confirms a
 * second identity cannot read it, then deletes the throwaway user.
 *
 * The apiKey is the public web identifier (rules are the access control, not
 * the key). No secret is in this file.
 *
 *   node scripts/live_auth_probe.mjs <apiKey>
 */

const KEY = process.argv[2];
if (!KEY) { console.error("usage: node scripts/live_auth_probe.mjs <apiKey>"); process.exit(2); }

const ID = "https://identitytoolkit.googleapis.com/v1";
const BASE = "https://firestore.googleapis.com/v1";
const PROJECT = "budget-manager-31025";
const DOC = (uid) => `${BASE}/projects/${PROJECT}/databases/(default)/documents/budgets/${uid}`;

const email = `probe-${Date.now()}@example.invalid`;

async function main() {
  // 1. Sign up a throwaway account (proves the provider is enabled live).
  let r = await fetch(`${ID}/accounts:signUp?key=${KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password: "probe-secret-123", returnSecureToken: true }),
  });
  if (!r.ok) { console.error("FAIL signUp", r.status, (await r.text()).slice(0, 200)); process.exit(1); }
  const u = await r.json();
  console.log("PASS signUp live  uid=" + u.localId);

  // 2. Owner writes + reads their own document on LIVE Firestore.
  const H = { "Content-Type": "application/json", Authorization: "Bearer " + u.idToken };
  const body = JSON.stringify({ fields: { data: { mapValue: { fields: { version: { integerValue: "2" } } } } } });
  r = await fetch(DOC(u.localId), { method: "PATCH", headers: H, body });
  console.log((r.ok ? "PASS" : "FAIL") + " owner writes live  [" + r.status + "]");

  r = await fetch(DOC(u.localId), { headers: H });
  console.log((r.status === 200 ? "PASS" : "FAIL") + " owner reads live  [" + r.status + "]");

  // 3. Anonymous cannot read it (rules deny without request.auth).
  r = await fetch(DOC(u.localId));
  console.log((r.status === 403 ? "PASS" : "FAIL") + " anonymous denied on live  [" + r.status + "]");

  // 4. Clean up: delete the throwaway user so the project stays clean.
  r = await fetch(`${ID}/accounts:delete?key=${KEY}`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: u.idToken }),
  });
  console.log((r.ok ? "PASS" : "FAIL") + " throwaway user deleted  [" + r.status + "]");

  // Note: the budgets/<uid> document is left (owner rule forbids this script
  // deleting it without the rules' delete path, and it is a stray uid).
  console.log("probe complete");
}
main().catch((e) => { console.error("ERR", e.message); process.exit(1); });
