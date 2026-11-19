import assert from "node:assert/strict";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const apiKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const password = process.env.SUPABASE_TEST_PASSWORD;
if (!url || !apiKey || !password) throw new Error("Hosted RLS verification environment is incomplete.");

const users = {
  alex: "alex.morgan@example.test",
  priya: "priya.shah@example.test",
  dana: "dana.ellis@example.test",
  inactive: "inactive.user@example.test",
};
const orgA = "10000000-0000-0000-0000-000000000001";
const orgB = "10000000-0000-0000-0000-000000000002";
let assertionNumber = 0;
const failures = [];

async function check(name, operation) {
  assertionNumber += 1;
  try {
    await operation();
    console.log(`ok ${assertionNumber} - ${name}`);
  } catch (error) {
    failures.push({ number: assertionNumber, name, message: error instanceof Error ? error.message : String(error) });
    console.log(`not ok ${assertionNumber} - ${name}`);
  }
}

async function signIn(email) {
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: apiKey, "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(response.status, 200, `sign-in failed for ${email}`);
  return (await response.json()).access_token;
}

async function table(token, name, query = "select=*", init = {}) {
  const headers = { apikey: apiKey, ...(token ? { authorization: `Bearer ${token}` } : {}), ...(init.body ? { "content-type": "application/json" } : {}), ...init.headers };
  const response = await fetch(`${url}/rest/v1/${name}?${query}`, { ...init, headers });
  const text = await response.text();
  let body;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { response, body };
}

const tokens = Object.fromEntries(await Promise.all(Object.entries(users).map(async ([key, email]) => [key, await signIn(email)])));
const readCount = async (token, name, query = "select=id") => {
  const { response, body } = await table(token, name, query);
  assert.equal(response.status, 200);
  assert.ok(Array.isArray(body));
  return body.length;
};
const deniedWrite = async (token, name, query, method, body) => {
  const result = await table(token, name, query, { method, body: JSON.stringify(body) });
  assert.ok(result.response.status === 401 || result.response.status === 403, `expected permission denial, received ${result.response.status}`);
};
const anonymousDenied = async (name) => {
  const result = await table(null, name, "select=id");
  if (result.response.status === 401 || result.response.status === 403) return;
  assert.equal(result.response.status, 200);
  assert.deepEqual(result.body, []);
};

console.log("1..40");
await check("anonymous users cannot read contacts", () => anonymousDenied("contacts"));
await check("anonymous users cannot read leads", () => anonymousDenied("leads"));
await check("anonymous users cannot read households", () => anonymousDenied("mortgage_households"));
await check("anonymous users cannot read campaigns", () => anonymousDenied("campaigns"));

await check("multi-organisation user sees both organisations", async () => assert.equal(await readCount(tokens.alex, "organisations"), 2));
await check("multi-organisation user sees three contacts", async () => assert.equal(await readCount(tokens.alex, "contacts"), 3));
await check("multi-organisation user sees both leads", async () => assert.equal(await readCount(tokens.alex, "leads"), 2));
await check("multi-organisation user sees both households", async () => assert.equal(await readCount(tokens.alex, "mortgage_households"), 2));
await check("campaign capability permits campaign reads", async () => assert.equal(await readCount(tokens.alex, "campaigns"), 3));
await check("multi-organisation memberships are visible", async () => assert.equal(await readCount(tokens.alex, "organisation_memberships", "select=id&id=in.(30000000-0000-0000-0000-000000000001,30000000-0000-0000-0000-000000000002)"), 2));
await check("campaign approval capability is limited to one organisation", async () => assert.equal(await readCount(tokens.alex, "membership_capabilities", "select=organisation_id&membership_id=in.(30000000-0000-0000-0000-000000000001,30000000-0000-0000-0000-000000000002)&capability=eq.campaign.approve"), 1));

await check("browser clients cannot approve campaigns directly", () => deniedWrite(tokens.alex, "campaigns", "id=eq.90000000-0000-0000-0000-000000000001", "PATCH", { status: "Approved" }));
await check("browser clients cannot freeze campaign versions directly", () => deniedWrite(tokens.alex, "campaign_versions", "id=eq.91000000-0000-0000-0000-000000000001", "PATCH", { state: "Frozen" }));
await check("browser clients cannot transition leads directly", () => deniedWrite(tokens.alex, "leads", "id=eq.50000000-0000-0000-0000-000000000001", "PATCH", { lifecycle_status: "Converted" }));
await check("browser clients cannot change lead ownership directly", () => deniedWrite(tokens.alex, "leads", "id=eq.50000000-0000-0000-0000-000000000001", "PATCH", { owner_membership_id: "30000000-0000-0000-0000-000000000001" }));
await check("browser clients cannot transition opportunities directly", () => deniedWrite(tokens.alex, "opportunities", "id=eq.80000000-0000-0000-0000-000000000001", "PATCH", { lifecycle_status: "Completed" }));
await check("browser clients cannot create conversions directly", () => deniedWrite(tokens.alex, "mortgage_lead_household_conversions", "", "POST", { organisation_id: orgA, lead_id: "50000000-0000-0000-0000-000000000001", household_id: "60000000-0000-0000-0000-000000000001", converted_by_membership_id: "30000000-0000-0000-0000-000000000001" }));
await check("browser clients cannot archive households directly", () => deniedWrite(tokens.alex, "mortgage_households", "id=eq.60000000-0000-0000-0000-000000000001", "PATCH", { status: "Archived" }));
await check("browser clients cannot create tasks directly", () => deniedWrite(tokens.alex, "tasks", "", "POST", { organisation_id: orgA, title: "Bypass", priority: "Normal", status: "Open", due_at: new Date().toISOString() }));
await check("browser clients cannot rewrite activity history", () => deniedWrite(tokens.alex, "activity_events", "id=eq.95000000-0000-0000-0000-000000000001", "PATCH", { summary: "Changed" }));
await check("browser clients cannot delete consent history", () => deniedWrite(tokens.alex, "consent_evidence", "id=eq.81000000-0000-0000-0000-000000000001", "DELETE", null));
await check("browser clients cannot delete suppression history", () => deniedWrite(tokens.alex, "suppression_history", "id=eq.82000000-0000-0000-0000-000000000001", "DELETE", null));
await check("browser clients cannot create approval records", () => deniedWrite(tokens.alex, "campaign_approvals", "", "POST", { organisation_id: orgA }));
await check("members cannot self-escalate capabilities", () => deniedWrite(tokens.alex, "membership_capabilities", "", "POST", { organisation_id: orgB, membership_id: "30000000-0000-0000-0000-000000000002", capability: "campaign.approve" }));

await check("inactive membership grants no organisation access", async () => assert.equal(await readCount(tokens.inactive, "organisations"), 0));
await check("inactive membership grants no contact access", async () => assert.equal(await readCount(tokens.inactive, "contacts"), 0));
await check("inactive membership grants no membership access", async () => assert.equal(await readCount(tokens.inactive, "organisation_memberships"), 0));

await check("user without contact.view cannot read contacts", async () => assert.equal(await readCount(tokens.dana, "contacts", `select=id&organisation_id=eq.${orgA}`), 0));
await check("lead.view permits organisation leads", async () => assert.equal(await readCount(tokens.dana, "leads", `select=id&organisation_id=eq.${orgA}`), 1));
await check("user without household capability cannot read households", async () => assert.equal(await readCount(tokens.dana, "mortgage_households", `select=id&organisation_id=eq.${orgA}`), 0));
await check("user without campaign.view cannot read campaigns", async () => assert.equal(await readCount(tokens.dana, "campaigns", `select=id&organisation_id=eq.${orgA}`), 0));
await check("cross-organisation leads remain hidden", async () => assert.equal(await readCount(tokens.dana, "leads", `select=id&organisation_id=eq.${orgB}`), 0));

await check("organisation-scoped contact capability permits contacts", async () => assert.equal(await readCount(tokens.priya, "contacts", `select=id&organisation_id=eq.${orgA}`), 2));
await check("missing lead.view hides organisation A leads", async () => assert.equal(await readCount(tokens.priya, "leads", `select=id&organisation_id=eq.${orgA}`), 0));
await check("household capability is isolated per organisation", async () => assert.equal(await readCount(tokens.priya, "mortgage_households", `select=id&organisation_id=eq.${orgA}`), 0));
await check("campaign capability is isolated per organisation", async () => assert.equal(await readCount(tokens.priya, "campaigns", `select=id&organisation_id=eq.${orgA}`), 0));
await check("lead capability applies in organisation B", async () => assert.equal(await readCount(tokens.priya, "leads", `select=id&organisation_id=eq.${orgB}`), 1));
await check("lead.view capability is absent in organisation A", async () => assert.equal(await readCount(tokens.priya, "membership_capabilities", `select=capability&organisation_id=eq.${orgA}&membership_id=eq.30000000-0000-0000-0000-000000000006&capability=eq.lead.view`), 0));
await check("lead.view capability is present in organisation B", async () => assert.equal(await readCount(tokens.priya, "membership_capabilities", `select=capability&organisation_id=eq.${orgB}&membership_id=eq.30000000-0000-0000-0000-000000000003&capability=eq.lead.view`), 1));
await check("Priya cannot read organisation A approvals", async () => assert.equal(await readCount(tokens.priya, "campaign_approvals", `select=id&organisation_id=eq.${orgA}`), 0));

if (assertionNumber !== 40) failures.push({ number: assertionNumber, name: "plan", message: `planned 40 assertions but ran ${assertionNumber}` });
if (failures.length) {
  for (const failure of failures) console.error(`# ${failure.number} ${failure.name}: ${failure.message}`);
  process.exit(1);
}
