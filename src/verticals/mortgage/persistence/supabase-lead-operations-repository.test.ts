import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/platform/database/database.types";
import type { TenantContext } from "@/platform/core/models";
import type { LeadId } from "@/platform/leads/models";
import { SupabaseLeadOperationsRepository } from "@/verticals/mortgage/persistence/supabase-lead-operations-repository";

interface QueryRecord { table: string; columns: string; filters: Array<{ type: "eq" | "in"; column: string; value: unknown }>; }

class QueryBuilder implements PromiseLike<{ data: Record<string, unknown>[]; error: null }> {
  constructor(private readonly rows: Record<string, unknown>[], private readonly record: QueryRecord) {}
  select(columns: string) { this.record.columns = columns; return this; }
  eq(column: string, value: unknown) { this.record.filters.push({ type: "eq", column, value }); return this; }
  in(column: string, value: unknown[]) { this.record.filters.push({ type: "in", column, value }); return this; }
  order() { return this; }
  then<TResult1 = { data: Record<string, unknown>[]; error: null }, TResult2 = never>(
    onfulfilled?: ((value: { data: Record<string, unknown>[]; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const filtered = this.rows.filter(row => this.record.filters.every(filter => filter.type === "eq"
      ? row[filter.column] === filter.value
      : (filter.value as unknown[]).includes(row[filter.column])));
    return Promise.resolve({ data: filtered, error: null }).then(onfulfilled, onrejected);
  }
}

describe("Supabase lead read paths", () => {
  it("loads a single lead's relations by exact identifiers with explicit columns", async () => {
    const organisationId = "10000000-0000-0000-0000-000000000001";
    const leadId = "50000000-0000-0000-0000-000000000001";
    const contactId = "40000000-0000-0000-0000-000000000001";
    const membershipId = "30000000-0000-0000-0000-000000000001";
    const tables: Record<string, Record<string, unknown>[]> = {
      leads: [{ id: leadId, organisation_id: organisationId, contact_id: contactId, owner_membership_id: membershipId, source: "Fictional", lifecycle_status: "New", next_action_at: null, created_at: "2026-11-16T00:00:00Z", updated_at: "2026-11-16T00:00:00Z", version: 1 }],
      contacts: [{ id: contactId, organisation_id: organisationId, given_name: "Fictional", family_name: "Lead", email: "fictional@example.test", phone: "0490000000" }],
      mortgage_lead_details: [{ organisation_id: organisationId, lead_id: leadId, loan_purpose: "Purchase", timeframe: "Immediately", preferred_contact_method: "Phone" }],
      consent_evidence: [
        { id: "81000000-0000-0000-0000-000000000001", organisation_id: organisationId, contact_id: contactId, channel: "Email", status: "Recorded", source: "Older evidence", effective_at: "2026-11-15T00:00:00Z", recorded_at: "2026-11-15T00:00:00Z" },
        { id: "81000000-0000-0000-0000-000000000002", organisation_id: organisationId, contact_id: contactId, channel: "Email", status: "Opted out", source: "Current evidence", effective_at: "2026-11-16T00:00:00Z", recorded_at: "2026-11-16T00:00:00Z" },
        { id: "81000000-0000-0000-0000-000000000003", organisation_id: organisationId, contact_id: contactId, channel: "Email", status: "Recorded", source: "Future evidence", effective_at: "2026-11-18T00:00:00Z", recorded_at: "2026-11-16T00:00:00Z" },
      ],
      organisation_memberships: [{ id: membershipId, organisation_id: organisationId, user_id: "20000000-0000-0000-0000-000000000001", display_name: "Alex Morgan", status: "Active" }],
      mortgage_membership_profiles: [{ organisation_id: organisationId, membership_id: membershipId, position: "Brokerage administrator" }],
      membership_capabilities: [{ organisation_id: organisationId, membership_id: membershipId, capability: "lead.view" }],
      tasks: [], appointments: [], activity_events: [],
    };
    const queries: QueryRecord[] = [];
    const client = {
      from(table: string) {
        const record: QueryRecord = { table, columns: "", filters: [] };
        queries.push(record);
        return new QueryBuilder(tables[table] ?? [], record);
      },
    } as unknown as SupabaseClient<Database>;
    const repository = new SupabaseLeadOperationsRepository(client, () => new Date("2026-11-17T00:00:00Z"));

    const snapshot = await repository.readLead({ organisationId, userId: "20000000-0000-0000-0000-000000000001" } as TenantContext, leadId as LeadId);

    expect(snapshot.leads).toHaveLength(1);
    expect(snapshot.leads[0].consentSummary).toMatchObject({ email: "Opted out", sms: "Not recorded", phone: "Not recorded", source: "Current evidence" });
    expect(queries.every(query => query.columns.length > 0 && query.columns !== "*")).toBe(true);
    expect(queries.find(query => query.table === "leads")?.filters).toEqual(expect.arrayContaining([
      { type: "eq", column: "organisation_id", value: organisationId },
      { type: "eq", column: "id", value: leadId },
    ]));
    expect(queries.find(query => query.table === "contacts")?.filters).toContainEqual({ type: "in", column: "id", value: [contactId] });
    for (const table of ["mortgage_lead_details", "tasks", "appointments", "activity_events"]) {
      const identifier = table === "activity_events" ? "entity_id" : "lead_id";
      expect(queries.find(query => query.table === table)?.filters).toContainEqual({ type: "in", column: identifier, value: [leadId] });
    }
    expect(queries.find(query => query.table === "mortgage_membership_profiles")?.filters).toContainEqual({ type: "in", column: "membership_id", value: [membershipId] });
  });
});
