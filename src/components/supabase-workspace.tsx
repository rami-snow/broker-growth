import { LogOut, ShieldCheck } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import type { ReactNode } from "react";
import { signOut } from "@/app/auth-actions";
import { resolveActiveOrganisationContext } from "@/platform/organisations/server-context";
import { getVerticalDefinition } from "@/data/vertical-registry";
import { Button } from "./ui";
import { Sidebar } from "./sidebar";
import { PersistentBrokerageSwitcher } from "./persistent-brokerage-switcher";
import { PersistentCommandBar } from "./command-bar";
import { PageTitle } from "./page-title";
import { EnvironmentRibbon, showDevelopmentRibbon } from "./environment-ribbon";

export async function SupabaseWorkspace({ user, returnPath, children, leadsBadge }: { user: User; returnPath: string; children?: ReactNode; leadsBadge?: number }) {
  const { memberships, activeMembership } = await resolveActiveOrganisationContext(user);
  if (!activeMembership) return <main className="auth-shell"><section className="auth-card" aria-labelledby="no-membership-title"><span className="auth-mark">BG</span><p className="eyebrow">Invite-only workspace</p><h1 id="no-membership-title">No active brokerage membership</h1><p>Your identity is verified, but no active organisation membership grants access. Ask a controlled administrator to restore or provision your membership.</p><form action={signOut}><Button type="submit" variant="secondary" leadingIcon={<LogOut/>}>Sign out</Button></form></section></main>;
  getVerticalDefinition(activeMembership.organisation.verticalKey);
  const options = memberships.map(item => ({ id: item.organisationId, name: item.organisation.name }));
  const ribbon = showDevelopmentRibbon();
  return <div className={`app-shell${ribbon ? " app-shell--ribbon" : ""}`}>
    {ribbon && <EnvironmentRibbon mode="development"/>}
    <Sidebar
      capabilities={activeMembership.capabilities}
      brokerageName={activeMembership.organisation.name}
      brokerageSwitcher={memberships.length > 1 ? <PersistentBrokerageSwitcher value={activeMembership.organisationId} options={options} returnPath={returnPath}/> : undefined}
      leadsBadge={leadsBadge}
      userName={activeMembership.displayName}
      userPosition="Verified member"
      footer={<form action={signOut} className="sidebar__signout"><Button type="submit" variant="text" size="small" leadingIcon={<LogOut/>}>Sign out</Button></form>}
    />
    <main className="app-main"><div className="workspace">
      {children ?? <><PageTitle title="Not available yet"/><section className="card migration-state"><span className="migration-icon"><ShieldCheck aria-hidden/></span><h2>This area is not available yet</h2><p>Campaign plans are stored in a later milestone. No fixture business data is shown here.</p></section></>}
    </div></main>
    <PersistentCommandBar capabilities={activeMembership.capabilities}/>
  </div>;
}
