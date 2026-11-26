import Link from "next/link";
import { SettingsScreen, SettingsView } from "@/features/settings/settings-screen";
import { SupabaseWorkspace } from "@/components/supabase-workspace";
import { PageTitle } from "@/components/page-title";
import { requireVerifiedCurrentUser } from "@/platform/auth/current-user";
import { createServerSupabaseClient } from "@/platform/auth/server-client";
import { resolveActiveOrganisationContext } from "@/platform/organisations/server-context";
import { getRuntimeMode } from "@/platform/runtime/config";
import type { TenantContext, UserId } from "@/platform/core/models";
import { SupabaseSettingsRepository } from "@/verticals/mortgage/persistence/supabase-settings-repository";

export default async function Page() {
  if (getRuntimeMode() === "fixture") return <SettingsScreen/>;
  const user = await requireVerifiedCurrentUser("/settings");
  const { activeMembership } = await resolveActiveOrganisationContext(user);
  if (!activeMembership) return <SupabaseWorkspace user={user} returnPath="/settings"/>;
  if (!activeMembership.capabilities.includes("settings.view")) return <SupabaseWorkspace user={user} returnPath="/settings"><PageTitle title="Settings"/><section className="card card__body"><h2>Settings unavailable</h2><p className="muted">Your position does not include access to brokerage settings.</p><Link href="/today">Return to Today</Link></section></SupabaseWorkspace>;
  const context = { organisationId: activeMembership.organisationId, userId: user.id as UserId } as TenantContext;
  const snapshot = await new SupabaseSettingsRepository(await createServerSupabaseClient()).read(context, activeMembership.id);
  return <SupabaseWorkspace user={user} returnPath="/settings"><SettingsView snapshot={snapshot}/></SupabaseWorkspace>;
}
