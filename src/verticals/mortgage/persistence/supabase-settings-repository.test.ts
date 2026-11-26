import { describe, expect, it } from "vitest";
import { mapSettingsRows, SupabaseSettingsRepository } from "./supabase-settings-repository";

const rows = {
  organisation: { name: "Harbourlight Mortgage Co.", region: "NSW" },
  memberships: [{ id: "m2", display_name: "Dana Ellis", status: "Active" }, { id: "m1", display_name: "Alex Morgan", status: "Active" }],
  profiles: [{ membership_id: "m1", position: "Brokerage administrator" }, { membership_id: "m2", position: "Broker" }],
  capabilities: [{ membership_id: "m1", capability: "settings.view" }, { membership_id: "m1", capability: "lead.view" }, { membership_id: "m2", capability: "lead.view" }],
  activities: [
    { id: "e2", occurred_at: "2026-11-14T01:00:00Z", actor_membership_id: "m2", entity_type: "lead", summary: "Contact attempt recorded" },
    { id: "e1", occurred_at: "2026-11-13T01:00:00Z", actor_membership_id: null, entity_type: "mortgage.household", summary: "Review opportunity generated" },
  ],
};

describe("Supabase settings projection", () => {
  it("maps members with positions and capabilities, and audit entries with actor types", () => {
    const snapshot = mapSettingsRows(rows, "m1");
    expect(snapshot.brokerage).toEqual({ name: "Harbourlight Mortgage Co.", region: "NSW" });
    expect(snapshot.members.map(item => [item.name, item.position, item.capabilities])).toEqual([["Alex Morgan", "Brokerage administrator", ["lead.view", "settings.view"]], ["Dana Ellis", "Broker", ["lead.view"]]]);
    expect(snapshot.audit).toEqual([
      { id: "e2", occurredAt: "2026-11-14T01:00:00Z", actorType: "Person", actorName: "Dana Ellis", record: "Lead", summary: "Contact attempt recorded" },
      { id: "e1", occurredAt: "2026-11-13T01:00:00Z", actorType: "System", actorName: undefined, record: "Household", summary: "Review opportunity generated" },
    ]);
  });
  it("scopes every read to the active organisation, newest audit first, capped at 50", async () => {
    const calls: Array<[string, string, unknown]> = [];
    const builder = (table: string) => { const query: Record<string, unknown> = {}; const chain = new Proxy(query, { get: (_target, key: string) => key === "then" ? (resolve: (value: unknown) => void) => resolve({ data: table === "organisations" ? rows.organisation : [], error: null }) : (...args: unknown[]) => { calls.push([table, key, args]); return chain; } }); return chain; };
    const client = { from: (table: string) => builder(table) } as never;
    await new SupabaseSettingsRepository(client).read({ organisationId: "org_1", userId: "u1" } as never, "m1");
    for (const table of ["organisations", "organisation_memberships", "mortgage_membership_profiles", "membership_capabilities", "activity_events"]) expect(calls.some(([name, method, args]) => name === table && method === "eq" && (args as unknown[])[1] === "org_1")).toBe(true);
    expect(calls).toContainEqual(["activity_events", "order", ["occurred_at", { ascending: false }]]);
    expect(calls).toContainEqual(["activity_events", "limit", [50]]);
  });
});
