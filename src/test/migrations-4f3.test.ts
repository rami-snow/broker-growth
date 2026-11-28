import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { auditActorTypes } from "@/platform/audit/models";
import { HOUSEHOLD_NOTE_MAX_LENGTH } from "@/verticals/mortgage/households/models";
import { rateTypes } from "@/verticals/mortgage/loans/models";
import { NEXT_STEP_MAX_LENGTH } from "@/verticals/mortgage/referrals/models";

const dir = resolve(process.cwd(), "supabase/migrations");
const files = readdirSync(dir).sort();
const read = (name: string) => readFileSync(resolve(dir, name), "utf8");
const ordered = ["20261128090000_audit_actor_type.sql", "20261128090100_brokerage_time_zone.sql", "20261128090200_referral_partner_next_step.sql", "20261128090300_household_notes.sql", "20261128090400_loan_rate_type.sql"];
const quoted = (sql: string) => [...sql.matchAll(/'([^']*)'/g)].map(match => match[1]);
const normalise = (sql: string) => sql.replace(/\s+/g, " ").trim();

/** Latest definition of a function across the migrations before 4F.3. */
function previousDefinition(name: string) {
  let latest: string | undefined;
  for (const file of files.filter(item => item < ordered[0]!)) {
    const sql = read(file);
    for (const match of sql.matchAll(new RegExp(`create or replace function ${name.replace(".", "\\.")}\\(`, "g"))) {
      const start = match.index!, body = sql.indexOf("$$", sql.indexOf("$$", start) + 2);
      latest = sql.slice(start, sql.indexOf("$$;", body - 1) + 3);
    }
  }
  if (!latest) throw new Error(`No previous definition for ${name}`);
  return latest;
}
function definitionIn(sql: string, name: string) {
  const start = sql.indexOf(`create or replace function ${name}(`);
  if (start < 0) throw new Error(`Missing ${name}`);
  const body = sql.indexOf("$$", sql.indexOf("$$", start) + 2);
  return sql.slice(start, sql.indexOf("$$;", body - 1) + 3);
}

describe("4F.3 migrations", () => {
  it("are the five approved migrations, in the approved order, after every existing migration", () => {
    expect(files.slice(-5)).toEqual(ordered);
  });

  it("(a) adds an actor type, backfills existing entries and keeps audit tables append-only", () => {
    const sql = read(ordered[0]!);
    for (const table of ["activity_events", "campaign_activity_events"]) {
      const disable = sql.indexOf(`alter table public.${table} disable trigger reject_${table}_mutation`);
      const update = sql.indexOf(`update public.${table}`), enable = sql.indexOf(`alter table public.${table} enable trigger reject_${table}_mutation`);
      expect(disable).toBeGreaterThan(-1);
      expect(update).toBeGreaterThan(disable);
      expect(enable).toBeGreaterThan(update);
      expect(sql).toContain(`create trigger default_${table}_actor_type before insert on public.${table}`);
    }
    expect(sql).toContain("set actor_type = case when actor_membership_id is null then 'system' else 'person' end");
    const allowed = sql.match(/activity_events_actor_type_allowed check \(actor_type in \(([^)]*)\)\)/)![1]!;
    expect(quoted(allowed)).toEqual([...auditActorTypes]);
    expect(sql).toContain("check (actor_type <> 'person' or actor_membership_id is not null)");
    expect(sql).toMatch(/alter column actor_type set not null/);
  });

  it("(b) adds a validated brokerage time zone and removes every hard-coded business-date zone", () => {
    const sql = read(ordered[1]!);
    expect(sql).toContain("add column time_zone text not null default 'Australia/Sydney'");
    expect(sql).toContain("from pg_catalog.pg_timezone_names z where z.name = new.time_zone");
    for (const [name, param] of [["private.reconcile_mortgage_review_opportunities", "target_organisation_id"], ["public.list_mortgage_household_review_opportunities", "p_organisation_id"], ["public.read_mortgage_retention_today", "p_organisation_id"], ["public.transition_mortgage_review_opportunity", "organisation_id"]] as const) {
      const updated = definitionIn(sql, name), previous = previousDefinition(name);
      expect(updated).not.toContain("'Australia/Sydney'");
      expect(normalise(updated)).toBe(normalise(previous.replace("(transaction_timestamp() at time zone 'Australia/Sydney')::date", `private.organisation_business_date(${param})`)));
    }
  });

  for (const [file, fn, capability, entity] of [
    [ordered[2]!, "public.set_mortgage_referral_partner_next_step", "mortgage.referral.manage", "mortgage.referral_partner"],
    [ordered[3]!, "public.add_mortgage_household_note", "mortgage.household.update", "mortgage.household"],
    [ordered[4]!, "public.set_mortgage_loan_rate_type", "mortgage.loan-record.manage", "mortgage.household"],
  ] as const) {
    it(`${file.slice(15, -4)}: ${fn} is an idempotent, capability-checked operation with an audit entry`, () => {
      const sql = read(file), body = definitionIn(sql, fn);
      expect(body).toContain("security definer set search_path = ''");
      expect(body).toContain(`'${capability}'`);
      expect(body).toContain("private.begin_operation_command_checked(");
      expect(body).toContain("private.finish_operation_command(");
      expect(body).toMatch(/insert into public\.activity_events\([^)]*actor_type[^)]*\)/);
      expect(body).toContain(`'${entity}'`);
      expect(body).toContain("'person'");
      const signature = fn + sql.slice(sql.indexOf(`revoke all on function ${fn}`) + `revoke all on function ${fn}`.length).match(/^\([^)]*\)/)![0];
      expect(sql).toContain(`revoke all on function ${signature} from public, anon;`);
      expect(sql).toContain(`grant execute on function ${signature} to authenticated;`);
    });
  }

  it("(c) limits a partner next step to the same length as the app", () => {
    expect(read(ordered[2]!)).toContain(`between 1 and ${NEXT_STEP_MAX_LENGTH}`);
  });

  it("(d) creates an append-only, tenant-consistent notes table with RLS and no direct writes", () => {
    const sql = read(ordered[3]!);
    expect(sql).toContain("alter table public.mortgage_household_notes enable row level security;");
    expect(sql).toContain("revoke insert, update, delete on public.mortgage_household_notes from authenticated;");
    expect(sql).toContain("foreign key (organisation_id, household_id) references public.mortgage_households(organisation_id, id)");
    expect(sql).toContain("execute function private.reject_mutation()");
    expect(sql).toContain(`between 1 and ${HOUSEHOLD_NOTE_MAX_LENGTH}`);
    expect(sql).toContain("private.require_household_maintenance_access(organisation_id, household_id, actor_membership, true)");
  });

  it("(e) allows exactly the app's rate types and never a rate value, balance or amount", () => {
    const sql = read(ordered[4]!);
    expect(quoted(sql.match(/rate_type in \(([^)]*)\)\)/)![1]!)).toEqual([...rateTypes]);
    expect(sql).toContain("VARIABLE_RATE_WITH_FIXED_EXPIRY");
    expect(sql.toLowerCase()).not.toMatch(/add column (interest_rate|rate_value|balance|loan_amount|amount)/);
  });
});
