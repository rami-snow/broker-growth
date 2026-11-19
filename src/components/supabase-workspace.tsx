import { Building2, LogOut, ShieldCheck } from "lucide-react";
import type { User } from "@supabase/supabase-js";
import type { ReactNode } from "react";
import { selectOrganisation, signOut } from "@/app/auth-actions";
import { resolveActiveOrganisationContext } from "@/platform/organisations/server-context";
import { getVerticalDefinition } from "@/data/vertical-registry";
import { Button } from "./ui";
import { PersistentNavigation } from "./persistent-navigation";

export async function SupabaseWorkspace({ user, returnPath, children }: { user: User; returnPath: string; children?: ReactNode }) {
  const { memberships, activeMembership } = await resolveActiveOrganisationContext(user);
  if (!activeMembership) return <main className="auth-shell"><section className="auth-card" aria-labelledby="no-membership-title"><span className="auth-mark">BG</span><p className="eyebrow">Invite-only workspace</p><h1 id="no-membership-title">No active brokerage membership</h1><p>Your identity is verified, but no active organisation membership grants access. Ask a controlled administrator to restore or provision your membership.</p><form action={signOut}><Button type="submit" variant="secondary" leadingIcon={<LogOut/>}>Sign out</Button></form></section></main>;
  getVerticalDefinition(activeMembership.organisation.verticalKey);
  return <div className="persistent-shell">
    <header className="persistent-header"><div className="brand persistent-brand"><span className="brand-mark">BG</span><span><strong>Broker Growth</strong><small>Desk</small></span></div><PersistentNavigation capabilities={activeMembership.capabilities}/><form action={signOut}><Button type="submit" variant="text" size="small" leadingIcon={<LogOut/>}>Sign out</Button></form></header>
    <main className="persistent-workspace"><section className="persistent-context"><div><p className="eyebrow">Active brokerage</p><h1>{activeMembership.organisation.name}</h1><p>{activeMembership.displayName} · Verified member</p></div>{memberships.length > 1 && <form action={selectOrganisation} className="organisation-selector"><input type="hidden" name="returnTo" value={returnPath}/><label htmlFor="persistent-organisation">Brokerage</label><select id="persistent-organisation" name="organisationId" defaultValue={activeMembership.organisationId}>{memberships.map(item => <option key={item.id} value={item.organisationId}>{item.organisation.name}</option>)}</select><Button type="submit" size="small">Switch</Button></form>}</section>
      {children ?? <section className="surface migration-state"><span className="migration-icon"><ShieldCheck aria-hidden/></span><p className="eyebrow">Supabase foundation active</p><h2>This area is not persistent yet</h2><p>Today, Leads and Client Book are persistent. Campaigns and reporting remain intentionally unavailable until later migration milestones.</p><div className="prototype-warning"><Building2 aria-hidden/><span><strong>No fixture business data is shown.</strong><br/>This development workspace is not a production-ready application.</span></div></section>}
    </main>
  </div>;
}
