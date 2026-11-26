"use server";

import type { CommandRecord } from "@/components/command-bar-model";
import { persistentOperationsContext } from "@/app/lead-actions";
import { SupabaseClientBookRepository } from "@/verticals/mortgage/persistence/supabase-client-book-repository";
import { SupabaseReferralPartnerRepository } from "@/verticals/mortgage/persistence/supabase-referral-partner-repository";
import { createServerSupabaseClient } from "@/platform/auth/server-client";
import { getRuntimeMode } from "@/platform/runtime/config";

/** Command bar record search for Supabase mode. Read-only, tenant-scoped and capability-filtered; RLS still applies. */
export async function searchWorkspaceRecords(rawQuery: string): Promise<CommandRecord[]> {
  if (getRuntimeMode() !== "supabase") return [];
  const query = rawQuery.trim().slice(0, 80);
  if (query.length < 2) return [];
  const { activeMembership, context, repository } = await persistentOperationsContext();
  const capabilities = activeMembership.capabilities, needle = query.toLowerCase(), results: CommandRecord[] = [];
  const client = await createServerSupabaseClient();
  await Promise.all([
    capabilities.includes("lead.view") ? repository.readSnapshot(context).then(snapshot => { for (const lead of snapshot.leads) { const name = `${lead.firstName} ${lead.lastName}`; if (`${name} ${lead.email} ${lead.phone}`.toLowerCase().includes(needle)) results.push({ kind: "lead", id: lead.id, title: name, description: `${lead.loanPurpose} enquiry. ${lead.status}.${lead.ownerMembershipId ? "" : " No owner yet."}`, href: `/leads/${lead.id}` }); } }).catch(() => undefined) : undefined,
    capabilities.includes("mortgage.household.view") ? new SupabaseClientBookRepository(client).list(context, { search: query, page: 1 }).then(snapshot => { for (const row of snapshot.rows) results.push({ kind: "client", id: row.id, title: row.displayName, description: `Client household. Owner ${row.ownerName}.`, href: `/client-book/${row.id}` }); }).catch(() => undefined) : undefined,
    capabilities.includes("mortgage.referral.view") ? new SupabaseReferralPartnerRepository(client).list(context, { search: query, page: 1 }).then(snapshot => { for (const row of snapshot.rows) results.push({ kind: "partner", id: row.id, title: row.name, description: `${row.type}${row.organisationName ? `, ${row.organisationName}` : ""}. ${row.status}.`, href: `/referral-partners/${row.id}` }); }).catch(() => undefined) : undefined,
  ]);
  return results.slice(0, 20);
}
