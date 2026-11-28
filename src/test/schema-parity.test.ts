import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { consentProvenances } from "@/platform/consent/models";
import { taskPriorities, taskStatuses } from "@/platform/tasks/models";
import { annualReviewPurposeKey, annualReviewSourceKey, fixedExpiryPurposeKey, fixedExpirySourceKey } from "@/verticals/mortgage/campaigns/extensions";
import { householdRelationships, householdStatuses } from "@/verticals/mortgage/households/models";
import { loanPurposes, mortgageTimeframes } from "@/verticals/mortgage/leads/models";
import { dataConfidences, loanRecordSources, loanRecordStatuses } from "@/verticals/mortgage/loans/models";
import { mortgageReferralPartnerTypes } from "@/verticals/mortgage/referrals/models";
import { reviewOpportunityStatuses, reviewOpportunityTypes } from "@/verticals/mortgage/review-opportunities/models";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20261116090001_hosted_schema_parity_and_workflow_hardening.sql"),
  "utf8",
);

const migrationDirectory = resolve(process.cwd(), "supabase/migrations");
const allMigrations = readdirSync(migrationDirectory).filter(file => file.endsWith(".sql")).sort().map(file => readFileSync(resolve(migrationDirectory, file), "utf8"));

// The latest definition wins: later migrations may replace a constraint with a wider value list.
function constraintValues(name: string) {
  const expression = new RegExp(`constraint ${name}\\s+check \\([\\s\\S]*?in \\(([^)]*)\\)`, "i");
  const body = allMigrations.map(sql => sql.match(expression)?.[1]).filter(Boolean).at(-1);
  if (!body) throw new Error(`Missing SQL constraint ${name}`);
  return [...body.matchAll(/'((?:''|[^'])*)'/g)].map((match) => match[1].replaceAll("''", "'"));
}

describe("hosted schema domain parity", () => {
  it("keeps referral management mortgage-owned with guarded versioned operations",()=>{const referralMigration=readFileSync(resolve(process.cwd(),"supabase/migrations/20261118122825_persistent_mortgage_referral_partner_management.sql"),"utf8");expect(referralMigration).toContain("alter table public.mortgage_referral_partners");expect(referralMigration).toContain("version integer not null default 1 check (version > 0)");expect(referralMigration).toContain("mortgage.referral.manage");expect(referralMigration).toContain("set_mortgage_lead_referral_partner");expect(referralMigration).toContain("revoke insert,update,delete on public.mortgage_referral_partners from authenticated");expect(referralMigration).toContain("security invoker");});
  it.each([
    ["tasks_priority_allowed", taskPriorities],
    ["tasks_status_allowed", taskStatuses],
    ["opportunities_lifecycle_status_allowed", reviewOpportunityStatuses],
    ["opportunities_type_allowed", reviewOpportunityTypes],
    ["mortgage_households_status_allowed", householdStatuses],
    ["mortgage_referral_partner_type_allowed", mortgageReferralPartnerTypes],
    ["mortgage_lead_details_loan_purpose_allowed", loanPurposes],
    ["mortgage_lead_details_timeframe_allowed", mortgageTimeframes],
    ["mortgage_household_members_relationship_allowed", householdRelationships],
    ["mortgage_loan_record_source_allowed", loanRecordSources],
    ["consent_evidence_provenance_allowed", consentProvenances],
  ] as const)("keeps %s aligned with TypeScript", (constraint, domainValues) => {
    expect(constraintValues(constraint)).toEqual([...domainValues]);
  });

  it("keeps existing baseline loan status and confidence values aligned", () => {
    const baseline = readFileSync(
      resolve(process.cwd(), "supabase/migrations/20261116090000_production_foundation.sql"),
      "utf8",
    );
    for (const value of [...loanRecordStatuses, ...dataConfidences]) expect(baseline).toContain(`'${value}'`);
  });

  it("uses only the registered mortgage campaign keys", () => {
    expect(constraintValues("campaign_versions_purpose_key_allowed")).toEqual([
      annualReviewPurposeKey,
      fixedExpiryPurposeKey,
    ]);
    expect(constraintValues("campaign_versions_audience_source_key_allowed")).toEqual([
      annualReviewSourceKey,
      fixedExpirySourceKey,
    ]);
  });

  it("removes ordinary authenticated workflow writes", () => {
    expect(migration).toContain("revoke insert, update, delete, truncate, references, trigger");
    expect(migration).toContain("and cmd <> 'SELECT'");
  });
});

describe("persistent lead operation boundary", () => {
  const operations = readFileSync(resolve(process.cwd(), "supabase/migrations/20261116090002_persistent_lead_to_discovery_operations.sql"), "utf8");
  it("keeps direct table writes closed and exposes only authenticated operations", () => {
    expect(operations).toContain("revoke all on public.operation_commands from anon, authenticated");
    expect(operations).toContain("from public, anon;");
    expect(operations).toContain("to authenticated;");
  });
  it("derives actors, locks leads and enforces versions", () => {
    expect(operations).toContain("actor_user uuid := auth.uid()");
    expect(operations).toContain("for update;");
    expect(operations).toContain("STALE_LEAD_VERSION");
    expect(operations).toContain("actor_membership := private.require_operation_actor");
  });
  it("uses tenant-scoped idempotency and preserves Converted as terminal", () => {
    expect(operations).toContain("primary key (organisation_id, command_id)");
    expect(operations).toContain("when 'Closed' then next_status = 'Nurture'");
    expect(operations).toContain("else false");
  });
});

describe("persistent Client Book conversion boundary", () => {
  const conversion = readFileSync(resolve(process.cwd(), "supabase/migrations/20261117014340_harden_client_book_conversion_and_reads.sql"), "utf8");
  it("exposes one authenticated conversion operation with an empty search path", () => {
    expect(conversion).toContain("function public.convert_mortgage_lead_to_household(");
    expect(conversion).toContain("security definer\nset search_path = ''");
    expect(conversion).toContain("from public, anon;");
    expect(conversion).toContain("to authenticated;");
  });
  it("uses a complete forward-only function replacement", () => {
    expect(conversion).not.toContain("pg_get_functiondef");
    expect(conversion).not.toContain("create policy");
    expect(conversion).toContain("create or replace function public.convert_mortgage_lead_to_household(");
  });
  it("derives the actor and locks both lead and selected household", () => {
    expect(conversion).toContain("private.require_operation_actor(organisation_id, 'lead.update')");
    expect(conversion).toContain("private.require_lead_access(");
    expect(conversion).toMatch(/existing_household_id[\s\S]*?for update;/);
  });
  it("requires every conversion read/write capability and separates assignment capabilities", () => {
    for (const capability of ["lead.update","mortgage.household.create","contact.view","mortgage.household.view"]) expect(conversion).toContain(`'${capability}'`);
    expect(conversion).toContain("private.has_capability(organisation_id, 'mortgage.household.assign')");
    expect(conversion).not.toContain("private.has_capability(organisation_id, 'lead.assign')\n     and owner_membership_id");
  });
  it("stores the source lead and restricts existing households to fresh duplicate matches", () => {
    expect(conversion).toContain("'Active', lead_id, converted_at");
    expect(conversion).toContain("jsonb_array_elements(duplicate_reasons)");
    expect(conversion).toContain("EXISTING_HOUSEHOLD_NOT_DUPLICATE_MATCH");
    expect(conversion).toContain("household_owner_id := target_household.owner_membership_id");
  });
  it("keeps conversion idempotent and version guarded", () => {
    expect(conversion).toContain("private.begin_operation_command(");
    expect(conversion).toContain("expected_version");
    expect(conversion).toContain("private.finish_operation_command");
  });
  it("reuses the lead contact and does not copy its consent", () => {
    expect(conversion).toContain("target_lead.contact_id, 'Primary applicant', true");
    expect(conversion).not.toContain("'Lead consent copied'");
  });
  it("records explicit duplicate reasons without auto-merging", () => {
    expect(conversion).toContain("'exact_email'");
    expect(conversion).toContain("'exact_phone'");
    expect(conversion).toContain("'normalized_full_name'");
    expect(conversion).toContain("'conversion.duplicate_reviewed'");
  });
  it("uses RLS-respecting database reads without fixed candidate limits", () => {
    expect(conversion).toContain("function public.list_mortgage_households(");
    expect(conversion).toContain("security invoker");
    expect(conversion).toContain("function public.find_mortgage_lead_household_duplicates(");
    expect(conversion).not.toMatch(/limit\s+(200|400)/i);
    expect(conversion).toContain("h.id asc");
  });
  it("appends the complete structured conversion history", () => {
    for (const eventType of ["household.created","household.member_added","loan.created","opportunity.generated","conversion.duplicate_reviewed","lead.converted","household.conversion_completed"]) expect(conversion).toContain(`'${eventType}'`);
  });
  it("records Not recorded evidence only for a newly-created joint contact", () => {
    expect(conversion).toMatch(/insert into public\.contacts\(id, organisation_id, given_name[\s\S]*?select organisation_id, joint_id, channel, 'Not recorded'/);
  });
  it("keeps generated opportunities limited to existing retention rules", () => {
    expect(conversion).toContain("'Annual review'::text");
    expect(conversion).toContain("'Fixed-rate expiry'::text");
    expect(conversion).not.toContain("campaign");
  });
  it("qualifies the household member uniqueness target in the corrective migration", () => {
    const correction=readFileSync(resolve(process.cwd(),"supabase/migrations/20261116221943_qualify_household_member_conflict_constraint.sql"),"utf8");
    expect(correction).toContain("on conflict on constraint mortgage_household_members_organisation_id_household_id_con_key do nothing");
    expect(correction).toContain("CONVERSION_CONFLICT_TARGET_NOT_FOUND");
  });
  it("qualifies the review-opportunity business key in the corrective migration", () => {
    const correction=readFileSync(resolve(process.cwd(),"supabase/migrations/20261117010309_qualify_review_opportunity_conflict_constraint.sql"),"utf8");
    expect(correction).toContain("on conflict on constraint mortgage_review_opportunities_organisation_id_loan_record_i_key do nothing");
    expect(correction).toContain("REVIEW_CONFLICT_TARGET_NOT_FOUND");
  });
});

describe("persistent retention operation boundary",()=>{
  const retention=readFileSync(resolve(process.cwd(),"supabase/migrations/20261117053604_persistent_retention_review_operations.sql"),"utf8");
  it("uses one Sydney-date reconciler for conversion inserts and guarded loan operations",()=>{
    expect(retention).toContain("function private.reconcile_mortgage_review_opportunities(");
    expect(retention).toContain("(transaction_timestamp() at time zone 'Australia/Sydney')::date");
    expect(retention).toContain("create trigger reconcile_inserted_mortgage_loan");
    expect(retention).toContain("Superseded by loan trigger-date update");
  });
  it("versions guarded mutations and detects idempotency reuse conflicts",()=>{
    expect(retention).toContain("add column if not exists version integer not null default 1 check (version > 0)");
    expect(retention).toContain("function private.begin_operation_command_checked(");
    expect(retention).toContain("COMMAND_ID_REUSE_CONFLICT");
    for(const conflict of ["STALE_LOAN_VERSION","STALE_OPPORTUNITY_VERSION","REVIEW_BOOKED_DATE_CHANGE_BLOCKED"])expect(retention).toContain(conflict);
  });
  it("keeps direct writes closed and exposes only narrow authenticated operations",()=>{
    for(const table of ["mortgage_minimal_loan_records","mortgage_review_opportunities","opportunities","tasks"])expect(retention).toContain(`revoke insert, update, delete on public.${table} from authenticated`);
    for(const operation of ["add_mortgage_minimal_loan_record","update_mortgage_loan_review_dates","claim_mortgage_review_opportunity","assign_mortgage_review_opportunity","transition_mortgage_review_opportunity","create_mortgage_household_task"])expect(retention).toContain(`function public.${operation}(`);
  });
  it("records every required structured retention event without campaign behavior",()=>{
    for(const eventType of ["loan.created","loan.review_dates_changed","opportunity.generated","opportunity.superseded","opportunity.claimed","opportunity.assigned","opportunity.status_changed","task.created"])expect(retention).toContain(`'${eventType}'`);
    expect(retention).not.toMatch(/insert into public\.campaign/i);
  });
});

describe("Milestone 4D.1 retention consolidation",()=>{
  const consolidation=readFileSync(resolve(process.cwd(),"supabase/migrations/20261117132839_retention_lifecycle_schema_consolidation.sql"),"utf8");
  it("enforces the exact opportunity lifecycle after guarded legacy handling",()=>{
    expect(consolidation).toContain("where lifecycle_status = 'In progress'");
    expect(consolidation).toContain("UNEXPECTED_OPPORTUNITY_LIFECYCLE_ROWS");
    expect(consolidation).toContain("lifecycle_status in ('Upcoming','Due','Overdue','Review booked','Completed','Dismissed')");
    expect(consolidation.match(/'In progress'/g)).toHaveLength(2);
  });
  it("enforces the exact guarded transition matrix and rejects no-ops",()=>{
    expect(consolidation).toContain("OPPORTUNITY_NO_OP_TRANSITION");
    expect(consolidation).toContain("target.lifecycle_status in ('Upcoming','Due','Overdue')");
    expect(consolidation).toContain("target.lifecycle_status='Review booked'");
    expect(consolidation).toContain("DISMISSED_OPPORTUNITY_REOPEN_REQUIRED");
    expect(consolidation).toContain("COMPLETED_OPPORTUNITY_TERMINAL");
  });
  it("derives annual and fixed queues from their effective-status predicates",()=>{
    expect(consolidation).toContain("effective_status in ('Due','Overdue') annual_due");
    expect(consolidation).toContain("effective_status in ('Upcoming','Due','Overdue') fixed_approaching");
    expect(consolidation).toContain("count(*) from rows where annual_due");
    expect(consolidation).toContain("select * from rows where annual_due");
  });
  it("retains one task target shape and one tenant-aware household foreign key",()=>{
    expect(consolidation).toContain("add constraint tasks_subject_shape_check\n    check (num_nonnulls(lead_id, opportunity_id, household_id) = 1)");
    expect(consolidation).toContain("add constraint tasks_household_tenant_fkey\n    foreign key (organisation_id, household_id)");
    for(const duplicate of ["tasks_one_subject_check","tasks_single_subject_check","tasks_household_fkey","tasks_organisation_id_household_id_fkey","tasks_mortgage_household_fkey","tasks_mortgage_review_opportunity_fkey"])expect(consolidation).toContain(`drop constraint if exists ${duplicate}`);
  });
  it("uses only the shared trigger generator during conversion",()=>{
    const conversion=consolidation.slice(consolidation.indexOf("create or replace function public.convert_mortgage_lead_to_household"));
    expect(conversion).toContain("insert into public.mortgage_minimal_loan_records");
    expect(conversion).not.toContain("insert into public.opportunities");
    expect(conversion).not.toContain("insert into public.mortgage_review_opportunities");
    expect(conversion).not.toMatch(/for\s+trigger_kind/i);
  });
  it("derives manual provenance and keeps the complete controlled purpose list",()=>{
    expect(consolidation).toContain("loan_status, 'Manual entry', data_confidence");
    expect(consolidation).not.toContain("'source', source");
    for(const purpose of loanPurposes)expect(consolidation).toContain(`'${purpose}'`);
  });
});

describe("Milestone 4E persistent Client Book maintenance",()=>{
  const maintenance=readFileSync(resolve(process.cwd(),"supabase/migrations/20261117203112_persistent_client_book_maintenance.sql"),"utf8");
  it("adds explicit versions and replaces the canonical household lifecycle constraint",()=>{
    expect(maintenance).toContain("alter table public.contacts\n  add column version integer not null default 1 check (version > 0)");
    expect(maintenance).toContain("alter table public.tasks\n  add column version integer not null default 1 check (version > 0)");
    expect(maintenance).toContain("drop constraint if exists mortgage_households_status_allowed");
    expect(maintenance).toContain("status in ('Active','Inactive','Archived')");
  });
  it("keeps direct writes closed and every public endpoint narrowly authenticated",()=>{
    expect(maintenance).toContain("revoke insert,update,delete on public.contacts,public.mortgage_households");
    for(const operation of ["preview_mortgage_manual_contact_duplicates","create_mortgage_household_manual","update_mortgage_household_details","assign_mortgage_household_owner","update_mortgage_primary_contact","add_mortgage_household_member","transition_mortgage_household_status","transition_mortgage_household_task","create_mortgage_household_task"]){
      expect(maintenance).toContain(`create or replace function public.${operation}(`);
      expect(maintenance).toMatch(new RegExp(`revoke all on function public\\.${operation}\\([\\s\\S]*?from public,anon;[\\s\\S]*?grant execute on function public\\.${operation}\\([\\s\\S]*?to authenticated;`));
    }
  });
  it("derives actors, checks capabilities, locks rows and fingerprints commands",()=>{
    expect(maintenance).toContain("private.require_operation_actor(organisation_id,'mortgage.household.create')");
    expect(maintenance).toContain("private.require_operation_actor(organisation_id,'task.update')");
    expect(maintenance).toContain("private.begin_operation_command_checked(");
    expect(maintenance).toContain("for update;");
    expect(maintenance).toContain("STALE_HOUSEHOLD_VERSION");
    expect(maintenance).toContain("STALE_CONTACT_VERSION");
    expect(maintenance).toContain("STALE_TASK_VERSION");
  });
  it("revalidates tenant-scoped duplicates and never infers consent",()=>{
    expect(maintenance).toContain("EXACT_CONTACT_MATCH_REQUIRES_EXISTING");
    expect(maintenance).toContain("NAME_MATCH_ACKNOWLEDGEMENT_REQUIRED");
    expect(maintenance).toContain("No consent inferred during manual contact creation");
    expect(maintenance).toContain("from unnest(array['Email','SMS','Phone']) channel");
    expect(maintenance).not.toMatch(/status,'Recorded'.*Manual household creation/s);
  });
  it("enforces archival blockers, archived child guards and terminal task transitions",()=>{
    expect(maintenance).toContain("HOUSEHOLD_ARCHIVE_OPEN_OPPORTUNITIES");
    expect(maintenance).toContain("HOUSEHOLD_ARCHIVE_OPEN_TASKS");
    expect(maintenance).toContain("ARCHIVED_HOUSEHOLD_MUTATION_REJECTED");
    expect(maintenance).toContain("target.status<>'Open'");
    expect(maintenance).toContain("target_status not in ('Completed','Cancelled')");
    expect(maintenance).toContain("TASK_ASSIGNEE_OR_ADMIN_REQUIRED");
  });
  it("documents the atomic owner-alignment boundary in structured audit",()=>{
    expect(maintenance).toContain("loanOwnersUpdated");
    expect(maintenance).toContain("opportunityAssignmentsUnchanged");
    expect(maintenance).toContain("taskAssignmentsUnchanged");
  });
  it("executes duplicate-preview authorization before any row-producing query",()=>{
    const correction=readFileSync(resolve(process.cwd(),"supabase/migrations/20261117220916_harden_manual_duplicate_preview_authorization.sql"),"utf8");
    expect(correction).toContain("language plpgsql stable security definer set search_path='' ");
    expect(correction).toContain("perform private.require_operation_actor(p_organisation_id,'mortgage.household.create')");
    expect(correction.indexOf("perform private.require_operation_actor")).toBeLessThan(correction.indexOf("return query"));
  });
  it("uses the canonical manual-entry consent provenance without inferring consent",()=>{
    const correction=readFileSync(resolve(process.cwd(),"supabase/migrations/20261117221058_align_manual_contact_consent_provenance.sql"),"utf8");
    expect(correction).toContain("'No consent inferred during manual contact creation',false,'Manual entry'");
    expect(correction).toContain("array['Email','SMS','Phone']");
  });
  it("keeps the task guard explicit without an unused composite variable",()=>{
    const correction=readFileSync(resolve(process.cwd(),"supabase/migrations/20261118071344_consume_household_task_guard_result.sql"),"utf8");
    expect(correction).toContain("perform private.require_household_maintenance_access(organisation_id,household_id,actor_membership,true)");
    expect(correction).not.toContain("target_household public.mortgage_households%rowtype");
  });
});

describe("Milestone 4E.1 Client Book authorization and query boundaries",()=>{
  const hardening=readFileSync(resolve(process.cwd(),"supabase/migrations/20261118073521_harden_client_book_authorization_and_query_boundaries.sql"),"utf8");
  it("requires contact visibility before duplicate preview or existing-contact selection",()=>{
    expect(hardening).toContain("perform private.require_operation_actor(p_organisation_id,'mortgage.household.create')");
    expect(hardening).toContain("CAPABILITY_REQUIRED:contact.view");
    expect(hardening.indexOf("CAPABILITY_REQUIRED:contact.view")).toBeLessThan(hardening.indexOf("return query"));
    expect(hardening.match(/if not private\.has_capability\(organisation_id,'contact\.view'\)/g)).toHaveLength(3);
  });
  it("enforces self ownership unless the actor can assign households",()=>{
    expect(hardening).toContain("private.require_active_broker(organisation_id,owner_membership_id)");
    expect(hardening).toContain("owner_membership_id<>actor_membership");
    expect(hardening).toContain("HOUSEHOLD_OWNER_SELF_ASSIGNMENT_REQUIRED");
  });
  it("provides a narrow invoker contact search with explicit fields and a deterministic cap",()=>{
    const search=hardening.slice(hardening.indexOf("create or replace function public.search_mortgage_contact_options"),hardening.indexOf("create or replace function private.create_manual_contact"));
    expect(search).toContain("security invoker set search_path=''");
    expect(search).toContain("c.organisation_id=p_organisation_id");
    expect(search).toContain("limit 25");
    expect(search).toContain("order by lower(c.given_name),lower(c.family_name),c.id");
    expect(search).not.toContain("select *");
  });
  it("locks tenant households and blocks active review work while inactive",()=>{
    for(const operation of ["claim_mortgage_review_opportunity","assign_mortgage_review_opportunity","transition_mortgage_review_opportunity"]){
      const start=hardening.indexOf(`create or replace function public.${operation}`);
      const body=hardening.slice(start,hardening.indexOf("$$;",start)+3);
      expect(body).toContain("h.organisation_id=organisation_id");
      expect(body).toContain("for update");
      expect(body).toContain("ACTIVE_HOUSEHOLD_REQUIRED");
    }
  });
  it("revokes public and anonymous execution on every exposed function",()=>{
    for(const operation of ["preview_mortgage_manual_contact_duplicates","search_mortgage_contact_options","create_mortgage_household_manual","add_mortgage_household_member","claim_mortgage_review_opportunity","assign_mortgage_review_opportunity","transition_mortgage_review_opportunity"]){
      expect(hardening).toMatch(new RegExp(`revoke all on function public\\.${operation}\\([\\s\\S]*?from public,anon;[\\s\\S]*?grant execute on function public\\.${operation}\\([\\s\\S]*?to authenticated;`));
    }
  });
});
