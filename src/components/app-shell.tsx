"use client";

import type { ReactNode } from "react";
import type { OrganisationId, UserId } from "@/platform/core/models";
import { needsFirstResponse } from "@/verticals/mortgage/leads/response";
import { usePrototype } from "./prototype-provider";
import { BrokerageSelect, Sidebar } from "./sidebar";
import { FixtureCommandBar } from "./command-bar";
import { EnvironmentRibbon } from "./environment-ribbon";

export function AppShell({ children }: { children: ReactNode }) {
  const { repo, context, now, revision, switchOrganisation, switchUser } = usePrototype(); void revision;
  const state = repo.snapshot(), membership = repo.getMembership(context), user = state.users.find(item => item.id === context.userId)!;
  const brokerages = state.memberships.filter(item => item.userId === context.userId).map(item => state.organisations.find(organisation => organisation.id === item.organisationId)!).filter(Boolean);
  const brokerage = state.organisations.find(item => item.id === context.organisationId)!;
  const activities = state.activities.filter(item => item.organisationId === context.organisationId);
  const leadsBadge = membership.capabilities.includes("lead.view") ? repo.listLeads(context).filter(lead => needsFirstResponse(lead, activities, now())).length : 0;
  return <div className="app-shell app-shell--ribbon">
    <EnvironmentRibbon mode="fixture"><label htmlFor="dev-user">User</label><select id="dev-user" value={context.userId} onChange={event => switchUser(event.target.value as UserId)}>{state.users.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></EnvironmentRibbon>
    <Sidebar
      capabilities={membership.capabilities}
      brokerageName={brokerage.name}
      brokerageSwitcher={<BrokerageSelect id="dev-brokerage" value={context.organisationId} options={brokerages.map(item => ({ id: item.id, name: item.name }))} onChange={value => switchOrganisation(value as OrganisationId)}/>}
      leadsBadge={leadsBadge}
      userName={user.name}
      userPosition={membership.mortgageProfile.position}
    />
    <main className="app-main"><div className="workspace">{children}</div></main>
    <FixtureCommandBar/>
  </div>;
}
