import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";
import { expectedHostedProjectRef, validatedHostedDatabaseUrl } from "./hosted-project-identity.mjs";

const projectRef = process.env.SUPABASE_HOSTED_PROJECT_REF;
const databaseUrl = process.env.SUPABASE_HOSTED_DATABASE_URL;
const caCertPath = process.env.SUPABASE_HOSTED_CA_CERT_PATH;

if (projectRef !== expectedHostedProjectRef) {
  throw new Error(`Hosted operation verification requires SUPABASE_HOSTED_PROJECT_REF=${expectedHostedProjectRef}.`);
}
if (!databaseUrl) throw new Error("SUPABASE_HOSTED_DATABASE_URL is required.");
if (!caCertPath) throw new Error("SUPABASE_HOSTED_CA_CERT_PATH is required for verified hosted TLS.");

const parsedUrl = validatedHostedDatabaseUrl(databaseUrl);
let ca;
try {
  ca = readFileSync(caCertPath, "utf8");
} catch {
  throw new Error("SUPABASE_HOSTED_CA_CERT_PATH could not be read.");
}

const { Client } = pg;
const client = new Client({ connectionString: parsedUrl.toString(), ssl: { ca, rejectUnauthorized: true } });
const orgA = "10000000-0000-0000-0000-000000000001";
const alexMembership = "30000000-0000-0000-0000-000000000001";
const danaMembership = "30000000-0000-0000-0000-000000000004";
const priyaSupportMembership = "30000000-0000-0000-0000-000000000006";
const verificationEmail = "milestone-4b1-operation-suite@example.test";
const commandIds = Array.from({ length: 20 }, (_, index) => `4b100000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`);
const plannedAssertions = 47;
let assertionCount = 0;
let savepointCount = 0;
let leadId;
let contactId;
let taskId;
let appointmentId;
let activityIds = [];

const check = async (name, operation) => {
  await operation();
  assertionCount += 1;
  console.log(`ok ${assertionCount} - ${name}`);
};

const setActor = async (userId, role = "authenticated") => {
  await client.query("reset role");
  await client.query(`set local role ${role}`);
  const claims = role === "authenticated" ? JSON.stringify({ sub: userId, role }) : JSON.stringify({ role });
  await client.query("select set_config('request.jwt.claims', $1, true)", [claims]);
};

const expectDatabaseError = async (pattern, operation) => {
  const savepoint = `expected_error_${++savepointCount}`;
  await client.query(`savepoint ${savepoint}`);
  try {
    await operation();
    assert.fail(`Expected database error ${pattern}`);
  } catch (error) {
    assert.match(error instanceof Error ? error.message : String(error), pattern);
  } finally {
    await client.query(`rollback to savepoint ${savepoint}`);
    await client.query(`release savepoint ${savepoint}`);
  }
};

const createLead = (commandId) => client.query(
  "select public.create_mortgage_lead($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) result",
  [orgA, commandId, "Fictional", "Operation Check", verificationEmail, "0490 400 101", "Hosted verification", "Purchase", "Immediately", "Phone", null],
);

await client.connect();
try {
  console.log(`1..${plannedAssertions}`);
  const users = await client.query("select id,email from auth.users where email = any($1::text[])", [[
    "alex.morgan@example.test", "priya.shah@example.test", "dana.ellis@example.test", "inactive.user@example.test",
  ]]);
  const userId = Object.fromEntries(users.rows.map(row => [row.email, row.id]));
  assert.equal(Object.keys(userId).length, 4, "Hosted fictional verification users are incomplete.");

  await client.query("begin");

  await setActor(null, "anon");
  await check("anonymous operation invocation is rejected", () => expectDatabaseError(/AUTHENTICATION_REQUIRED|permission denied/i, () => createLead(commandIds[0])));

  await setActor(userId["inactive.user@example.test"]);
  await check("inactive membership is rejected", () => expectDatabaseError(/ACTIVE_ORGANISATION_MEMBERSHIP_REQUIRED/, () => createLead(commandIds[1])));

  await setActor(userId["dana.ellis@example.test"]);
  await check("missing lead.create capability is rejected", () => expectDatabaseError(/CAPABILITY_REQUIRED:lead.create/, () => createLead(commandIds[2])));

  await setActor(userId["alex.morgan@example.test"]);
  await check("cross-organisation lead access is rejected", () => expectDatabaseError(/LEAD_NOT_FOUND/, () => client.query(
    "select public.transition_lead($1,$2,$3,$4,$5,$6)",
    [orgA, commandIds[3], "50000000-0000-0000-0000-000000000002", 1, "Contacted", null],
  )));

  const created = await createLead(commandIds[4]);
  ({ leadId, contactId } = created.rows[0].result);
  await check("lead creation returns identifiers and version one", async () => {
    assert.match(leadId, /^[0-9a-f-]{36}$/i);
    assert.match(contactId, /^[0-9a-f-]{36}$/i);
    assert.equal(created.rows[0].result.version, 1);
  });
  await check("lead creation persists one verification contact inside the transaction", async () => {
    const result = await client.query("select count(*)::int count from public.contacts where organisation_id=$1 and id=$2 and email=$3", [orgA, contactId, verificationEmail]);
    assert.equal(result.rows[0].count, 1);
  });
  await check("lead creation persists one tenant-scoped lead inside the transaction", async () => {
    const result = await client.query("select count(*)::int count from public.leads where organisation_id=$1 and id=$2 and contact_id=$3", [orgA, leadId, contactId]);
    assert.equal(result.rows[0].count, 1);
  });
  await check("lead creation persists mortgage detail", async () => {
    const result = await client.query("select count(*)::int count from public.mortgage_lead_details where organisation_id=$1 and lead_id=$2", [orgA, leadId]);
    assert.equal(result.rows[0].count, 1);
  });
  await check("lead creation records all three consent channels", async () => {
    const result = await client.query("select count(*)::int count from public.consent_evidence where organisation_id=$1 and contact_id=$2", [orgA, contactId]);
    assert.equal(result.rows[0].count, 3);
  });
  await check("created consent is explicitly Not recorded", async () => {
    const result = await client.query("select array_agg(distinct status) statuses from public.consent_evidence where organisation_id=$1 and contact_id=$2", [orgA, contactId]);
    assert.deepEqual(result.rows[0].statuses, ["Not recorded"]);
  });
  await check("lead creation appends activity", async () => {
    const result = await client.query("select count(*)::int count from public.activity_events where organisation_id=$1 and entity_id=$2 and event_type='lead.created'", [orgA, leadId]);
    assert.equal(result.rows[0].count, 1);
  });

  const duplicate = await createLead(commandIds[4]);
  await check("command UUID retry returns the original result", async () => assert.deepEqual(duplicate.rows[0].result, created.rows[0].result));
  await check("command UUID retry does not duplicate the lead", async () => {
    const result = await client.query("select count(*)::int count from public.leads where id=$1", [leadId]);
    assert.equal(result.rows[0].count, 1);
  });
  await check("command UUID reuse for a different operation is rejected", () => expectDatabaseError(/COMMAND_ID_REUSE_CONFLICT/, () => client.query(
    "select public.claim_lead($1,$2,$3,$4)", [orgA, commandIds[4], leadId, 1],
  )));

  await client.query("reset role");
  await client.query("insert into public.membership_capabilities(organisation_id,membership_id,capability) values($1,$2,'lead.create')", [orgA, danaMembership]);
  await setActor(userId["dana.ellis@example.test"]);
  await check("command UUID reuse by a different actor is rejected", () => expectDatabaseError(/COMMAND_ID_REUSE_CONFLICT/, () => createLead(commandIds[4])));

  await setActor(userId["alex.morgan@example.test"]);
  const claimed = await client.query("select public.claim_lead($1,$2,$3,$4) result", [orgA, commandIds[5], leadId, 1]);
  await check("claim_lead assigns the actor and increments version", async () => {
    assert.equal(claimed.rows[0].result.ownerMembershipId, alexMembership);
    assert.equal(claimed.rows[0].result.version, 2);
  });
  const assigned = await client.query("select public.assign_lead($1,$2,$3,$4,$5) result", [orgA, commandIds[6], leadId, 2, danaMembership]);
  await check("assign_lead assigns an active same-tenant membership", async () => {
    assert.equal(assigned.rows[0].result.ownerMembershipId, danaMembership);
    assert.equal(assigned.rows[0].result.version, 3);
  });
  await check("cross-organisation assignment is rejected", () => expectDatabaseError(/ACTIVE_ASSIGNEE_REQUIRED/, () => client.query(
    "select public.assign_lead($1,$2,$3,$4,$5)", [orgA, commandIds[7], leadId, 3, "30000000-0000-0000-0000-000000000002"],
  )));
  await check("stale expected versions are rejected", () => expectDatabaseError(/STALE_LEAD_VERSION/, () => client.query(
    "select public.transition_lead($1,$2,$3,$4,$5,$6)", [orgA, commandIds[8], leadId, 2, "Contacted", null],
  )));

  await client.query("reset role");
  await client.query("insert into public.membership_capabilities(organisation_id,membership_id,capability) values($1,$2,'lead.update') on conflict do nothing", [orgA, priyaSupportMembership]);
  await setActor(userId["priya.shah@example.test"]);
  await check("non-owner workflow mutation is rejected", () => expectDatabaseError(/LEAD_OWNERSHIP_REQUIRED/, () => client.query(
    "select public.transition_lead($1,$2,$3,$4,$5,$6)", [orgA, commandIds[9], leadId, 3, "Contacted", null],
  )));

  await setActor(userId["dana.ellis@example.test"]);
  const contactAttempt = await client.query(
    "select public.record_contact_attempt($1,$2,$3,$4,$5,$6,$7,$8) result",
    [orgA, commandIds[10], leadId, 3, "Phone", "Left message", "Fictional hosted verification", "2026-11-19T01:00:00Z"],
  );
  await check("record_contact_attempt controls the New to Contact attempted transition", async () => {
    assert.equal(contactAttempt.rows[0].result.status, "Contact attempted");
    assert.equal(contactAttempt.rows[0].result.version, 4);
  });
  await check("contact attempt activity retains structured fields", async () => {
    const result = await client.query("select details from public.activity_events where organisation_id=$1 and entity_id=$2 and event_type='contact.attempted'", [orgA, leadId]);
    assert.equal(result.rows.length, 1);
    assert.equal(result.rows[0].details.channel, "Phone");
    assert.equal(result.rows[0].details.outcome, "Left message");
  });
  await check("next-action change is audited separately", async () => {
    const result = await client.query("select count(*)::int count from public.activity_events where organisation_id=$1 and entity_id=$2 and event_type='lead.next_action_changed'", [orgA, leadId]);
    assert.equal(result.rows[0].count, 1);
  });

  const transitioned = await client.query("select public.transition_lead($1,$2,$3,$4,$5,$6) result", [orgA, commandIds[11], leadId, 4, "Contacted", "Controlled transition check"]);
  await check("transition_lead allows a controlled lifecycle transition", async () => {
    assert.equal(transitioned.rows[0].result.status, "Contacted");
    assert.equal(transitioned.rows[0].result.version, 5);
  });
  const note = await client.query("select public.add_lead_note($1,$2,$3,$4,$5) result", [orgA, commandIds[12], leadId, 5, "Fictional verification note"]);
  await check("add_lead_note appends a note without changing lead version", async () => assert.equal(note.rows[0].result.version, 5));
  await check("note content is stored only in append-only activity", async () => {
    const result = await client.query("select details->>'note' note from public.activity_events where id=$1", [note.rows[0].result.activityEventId]);
    assert.equal(result.rows[0].note, "Fictional verification note");
  });

  await setActor(userId["alex.morgan@example.test"]);
  const task = await client.query(
    "select public.create_lead_task($1,$2,$3,$4,$5,$6,$7,$8) result",
    [orgA, commandIds[13], leadId, 5, danaMembership, "Fictional operation follow-up", "2026-11-20T01:00:00Z", "Normal"],
  );
  taskId = task.rows[0].result.taskId;
  await check("create_lead_task creates the task atomically", async () => {
    const result = await client.query("select count(*)::int count from public.tasks where organisation_id=$1 and id=$2 and lead_id=$3", [orgA, taskId, leadId]);
    assert.equal(result.rows[0].count, 1);
  });
  await check("create_lead_task appends matching activity atomically", async () => {
    const result = await client.query("select count(*)::int count from public.activity_events where organisation_id=$1 and entity_id=$2 and event_type='task.created' and details->>'taskId'=$3", [orgA, leadId, taskId]);
    assert.equal(result.rows[0].count, 1);
  });
  const taskRetry = await client.query(
    "select public.create_lead_task($1,$2,$3,$4,$5,$6,$7,$8) result",
    [orgA, commandIds[13], leadId, 5, danaMembership, "Fictional operation follow-up", "2026-11-20T01:00:00Z", "Normal"],
  );
  await check("task command retry is idempotent", async () => assert.deepEqual(taskRetry.rows[0].result, task.rows[0].result));

  const appointment = await client.query(
    "select public.book_discovery_appointment($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) result",
    [orgA, commandIds[14], leadId, 5, danaMembership, "2026-11-21T01:00:00Z", 45, "Phone", null, "Fictional discovery verification"],
  );
  appointmentId = appointment.rows[0].result.appointmentId;
  await check("book_discovery_appointment creates an appointment", async () => {
    const result = await client.query("select count(*)::int count from public.appointments where organisation_id=$1 and id=$2 and lead_id=$3", [orgA, appointmentId, leadId]);
    assert.equal(result.rows[0].count, 1);
  });
  await check("discovery booking atomically transitions the lead", async () => {
    const result = await client.query("select lifecycle_status,version from public.leads where organisation_id=$1 and id=$2", [orgA, leadId]);
    assert.deepEqual(result.rows[0], { lifecycle_status: "Discovery booked", version: 6 });
  });
  await check("discovery booking appends transition and appointment activity", async () => {
    const result = await client.query("select event_type from public.activity_events where organisation_id=$1 and entity_id=$2 and event_type in ('lead.status_changed','appointment.created')", [orgA, leadId]);
    assert.ok(result.rows.some(row => row.event_type === "appointment.created"));
    assert.ok(result.rows.some(row => row.event_type === "lead.status_changed"));
  });

  const closed = await client.query("select public.transition_lead($1,$2,$3,$4,$5,$6) result", [orgA, commandIds[15], leadId, 6, "Closed", null]);
  await check("controlled lifecycle permits closing a discovery-booked lead", async () => assert.equal(closed.rows[0].result.version, 7));
  const reopened = await client.query("select public.transition_lead($1,$2,$3,$4,$5,$6) result", [orgA, commandIds[16], leadId, 7, "Nurture", "Deliberate reopen verification"]);
  await check("Closed can reopen only to Nurture", async () => {
    assert.equal(reopened.rows[0].result.status, "Nurture");
    assert.equal(reopened.rows[0].result.version, 8);
  });
  await check("Converted remains unavailable through generic transition", () => expectDatabaseError(/INVALID_LEAD_TRANSITION/, () => client.query(
    "select public.transition_lead($1,$2,$3,$4,$5,$6)", [orgA, commandIds[17], leadId, 8, "Converted", null],
  )));

  await check("authenticated clients cannot update workflow tables directly", () => expectDatabaseError(/permission denied|row-level security/i, () => client.query(
    "update public.leads set lifecycle_status='Converted' where organisation_id=$1 and id=$2", [orgA, leadId],
  )));
  await check("authenticated clients cannot insert tasks directly", () => expectDatabaseError(/permission denied|row-level security/i, () => client.query(
    "insert into public.tasks(organisation_id,lead_id,assigned_membership_id,created_by_membership_id,title,due_at,priority,status) values($1,$2,$3,$3,'Bypass','2026-11-22T01:00:00Z','Normal','Open')",
    [orgA, leadId, alexMembership],
  )));
  await check("activity history rejects direct update", () => expectDatabaseError(/permission denied|append-only/i, () => client.query(
    "update public.activity_events set summary='Rewritten' where organisation_id=$1 and entity_id=$2", [orgA, leadId],
  )));
  await check("activity history rejects direct delete", () => expectDatabaseError(/permission denied|append-only/i, () => client.query(
    "delete from public.activity_events where organisation_id=$1 and entity_id=$2", [orgA, leadId],
  )));
  await check("operation_commands remains deny-all to authenticated clients", () => expectDatabaseError(/permission denied|row-level security/i, () => client.query(
    "select * from public.operation_commands where organisation_id=$1", [orgA],
  )));

  const activityResult = await client.query("select id from public.activity_events where organisation_id=$1 and entity_id=$2", [orgA, leadId]);
  activityIds = activityResult.rows.map(row => row.id);
  await check("activity stream is append-only and retains all operation events", async () => assert.ok(activityIds.length >= 12));

  await client.query("rollback");

  await check("rollback removes verification contacts", async () => {
    const result = await client.query("select count(*)::int count from public.contacts where id=$1 or email=$2", [contactId, verificationEmail]);
    assert.equal(result.rows[0].count, 0);
  });
  await check("rollback removes verification leads", async () => {
    const result = await client.query("select count(*)::int count from public.leads where id=$1", [leadId]);
    assert.equal(result.rows[0].count, 0);
  });
  await check("rollback removes verification command ledger rows", async () => {
    const result = await client.query("select count(*)::int count from public.operation_commands where organisation_id=$1 and command_id=any($2::uuid[])", [orgA, commandIds]);
    assert.equal(result.rows[0].count, 0);
  });
  await check("rollback removes verification tasks", async () => {
    const result = await client.query("select count(*)::int count from public.tasks where id=$1", [taskId]);
    assert.equal(result.rows[0].count, 0);
  });
  await check("rollback removes verification appointments", async () => {
    const result = await client.query("select count(*)::int count from public.appointments where id=$1", [appointmentId]);
    assert.equal(result.rows[0].count, 0);
  });
  await check("rollback removes verification activity events", async () => {
    const result = await client.query("select count(*)::int count from public.activity_events where id=any($1::uuid[])", [activityIds]);
    assert.equal(result.rows[0].count, 0);
  });

  assert.equal(assertionCount, plannedAssertions, "Hosted operation assertion plan changed without updating its declared count.");
  console.log(`# ${assertionCount} hosted operation assertions passed; transaction rolled back with zero residue.`);
} catch (error) {
  try { await client.query("rollback"); } catch {}
  console.error(`# hosted operation verification failed after ${assertionCount} assertions: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  await client.end();
}
