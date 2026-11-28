import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/platform/database/database.types";
import type { TenantContext } from "@/platform/core/models";
import { AUDIT_LIMIT, auditActorType, auditRecordLabel, type SettingsSnapshot } from "@/verticals/mortgage/settings/models";

type Client = SupabaseClient<Database>;
interface SettingsRows {
  organisation: { name: string; region: string | null } | null;
  memberships: Array<{ id: string; display_name: string; status: string }>;
  profiles: Array<{ membership_id: string; position: string }>;
  capabilities: Array<{ membership_id: string; capability: string }>;
  activities: Array<{ id: string; occurred_at: string; actor_membership_id: string | null; actor_type?: string | null; entity_type: string; summary: string }>;
}

/** Pure projection from database rows to the shared Settings snapshot. */
export function mapSettingsRows(rows: SettingsRows, currentMembershipId: string): SettingsSnapshot {
  const name = (id: string | null) => id ? rows.memberships.find(item => item.id === id)?.display_name : undefined;
  return {
    brokerage: { name: rows.organisation?.name ?? "Unknown brokerage", region: rows.organisation?.region ?? null },
    currentMembershipId,
    members: rows.memberships.map(item => ({ id: item.id, name: item.display_name, status: item.status, position: rows.profiles.find(profile => profile.membership_id === item.id)?.position, capabilities: rows.capabilities.filter(row => row.membership_id === item.id).map(row => row.capability).sort() })).sort((a, b) => a.name.localeCompare(b.name)),
    audit: rows.activities.map(item => ({ id: item.id, occurredAt: item.occurred_at, actorType: auditActorType(item.actor_membership_id, item.actor_type), actorName: name(item.actor_membership_id), record: auditRecordLabel(item.entity_type), summary: item.summary })),
  };
}

/**
 * Read-only Settings adapter. Explicit columns, tenant-scoped, newest audit entries first and capped.
 * RLS limits every read to the caller's active organisation; the page also requires settings.view.
 */
export class SupabaseSettingsRepository {
  constructor(private readonly client: Client) {}
  async read(context: TenantContext, currentMembershipId: string): Promise<SettingsSnapshot> {
    const organisationId = context.organisationId;
    const [organisation, memberships, profiles, capabilities, activities] = await Promise.all([
      this.client.from("organisations").select("name,region").eq("id", organisationId).maybeSingle(),
      this.client.from("organisation_memberships").select("id,display_name,status").eq("organisation_id", organisationId),
      this.client.from("mortgage_membership_profiles").select("membership_id,position").eq("organisation_id", organisationId),
      this.client.from("membership_capabilities").select("membership_id,capability").eq("organisation_id", organisationId),
      this.client.from("activity_events").select("id,occurred_at,actor_membership_id,actor_type,entity_type,summary").eq("organisation_id", organisationId).order("occurred_at", { ascending: false }).limit(AUDIT_LIMIT),
    ]);
    const error = [organisation.error, memberships.error, profiles.error, capabilities.error, activities.error].find(Boolean);
    if (error) throw new Error(`Unable to load settings: ${error.message}`);
    return mapSettingsRows({ organisation: organisation.data, memberships: memberships.data ?? [], profiles: profiles.data ?? [], capabilities: capabilities.data ?? [], activities: activities.data ?? [] }, currentMembershipId);
  }
}
