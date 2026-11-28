import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { createServerSupabaseClient } from "@/platform/auth/server-client";

export const ACTIVE_ORGANISATION_COOKIE = "bgd-active-organisation";

export interface PersistentMembership {
  id: string;
  organisationId: string;
  displayName: string;
  status: "Active";
  capabilities: string[];
  organisation: { id: string; name: string; shortName: string; verticalKey: "mortgage"; status: "Active" | "Inactive"; region: string | null; timeZone?: string };
}

export function chooseActiveMembership(memberships: PersistentMembership[], preferredOrganisationId?: string) {
  return memberships.find(item => item.organisationId === preferredOrganisationId) ?? memberships[0] ?? null;
}

export async function listActiveMemberships(user: User): Promise<PersistentMembership[]> {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.from("organisation_memberships").select("id, organisation_id, display_name, status, organisations!inner(id, name, short_name, vertical_key, status, region), membership_capabilities(capability)").eq("user_id", user.id).eq("status", "Active");
  if (error) throw new Error(`Unable to resolve organisation memberships: ${error.message}`);
  return (data ?? []).flatMap(row => {
    if (row.organisations.status !== "Active" || row.organisations.vertical_key !== "mortgage") return [];
    return [{ id: row.id, organisationId: row.organisation_id, displayName: row.display_name, status: "Active" as const, capabilities: row.membership_capabilities.map(item => item.capability), organisation: { id: row.organisations.id, name: row.organisations.name, shortName: row.organisations.short_name, verticalKey: "mortgage" as const, status: row.organisations.status as "Active" | "Inactive", region: row.organisations.region } }];
  });
}

export async function resolveActiveOrganisationContext(user: User) {
  const memberships = await listActiveMemberships(user);
  const preferred = (await cookies()).get(ACTIVE_ORGANISATION_COOKIE)?.value;
  const activeMembership = chooseActiveMembership(memberships, preferred);
  if (activeMembership) activeMembership.organisation.timeZone = await readOrganisationTimeZone(activeMembership.organisationId);
  return { memberships, activeMembership };
}

/** The brokerage time zone (migration 20261128090100), read through a membership-scoped RPC. */
async function readOrganisationTimeZone(organisationId: string) {
  const client = await createServerSupabaseClient();
  const { data, error } = await client.rpc("organisation_time_zone", { p_organisation_id: organisationId });
  if (error) throw new Error(`Unable to read the brokerage time zone. Apply migration 20261128090100_brokerage_time_zone.sql: ${error.message}`);
  if (typeof data !== "string" || !data) throw new Error("The brokerage time zone is missing.");
  return data;
}
