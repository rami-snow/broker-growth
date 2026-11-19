"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, type ReactNode } from "react";
import { BarChart3, BookUser, CalendarClock, Handshake, LayoutDashboard, Menu, Megaphone, Settings2, Users, X } from "lucide-react";
import { hasCapability } from "@/verticals/mortgage/permissions";
import type { OrganisationId, UserId } from "@/platform/core/models";
import { usePrototype } from "./prototype-provider";

const navigation = [
  { href: "/today", label: "Today", icon: LayoutDashboard },
  { href: "/leads", label: "Leads", icon: Users },
  { href: "/client-book", label: "Client Book", icon: BookUser },
  { href: "/referral-partners", label: "Referral partners", icon: Handshake, capability: "mortgage.referral.view" as const },
  { href: "/campaigns", label: "Campaigns", icon: Megaphone },
  { href: "/reports", label: "Reports", icon: BarChart3, capability: "report.view" as const },
  { href: "/settings", label: "Settings", icon: Settings2, capability: "settings.view" as const },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname(), [mobile, setMobile] = useState(false);
  const { repo, context, switchOrganisation, switchUser } = usePrototype();
  const state = repo.snapshot(), membership = repo.getMembership(context), user = state.users.find(item => item.id === context.userId)!;
  const availableBrokerages = state.memberships.filter(item => item.userId === context.userId).map(item => state.organisations.find(organisation => organisation.id === item.organisationId)!).filter(Boolean);
  return <div className="app-shell">
    <aside className={`sidebar ${mobile ? "open" : ""}`}>
      <div className="brand"><span className="brand-mark">BG</span><span><strong>Broker Growth</strong><small>Desk</small></span><button className="icon-button close-nav" aria-label="Close navigation" onClick={() => setMobile(false)}><X/></button></div>
      <p className="nav-kicker">Workspace</p>
      <nav aria-label="Main navigation">{navigation.filter(item => !item.capability || hasCapability(membership, item.capability)).map(item => <Link key={item.href} href={item.href} className={pathname === item.href || (item.href === "/leads" && pathname.startsWith("/leads/")) ? "active" : ""} onClick={() => setMobile(false)}><item.icon/><span>{item.label}</span></Link>)}</nav>
      <div className="sidebar-bottom">
        <div className="environment"><span/>Development prototype · resets on reload</div>
        <label htmlFor="dev-user">Development user</label>
        <select id="dev-user" value={context.userId} onChange={event => switchUser(event.target.value as UserId)}>{state.users.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <label htmlFor="dev-brokerage">Brokerage</label>
        <select id="dev-brokerage" value={context.organisationId} onChange={event => switchOrganisation(event.target.value as OrganisationId)}>{availableBrokerages.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <div className="user-card"><span className="avatar">{user.name.split(" ").map(part => part[0]).join("")}</span><span><strong>{user.name}</strong><small>{membership.mortgageProfile.position}</small></span></div>
      </div>
    </aside>
    <main><header className="topbar"><button className="icon-button menu-button" aria-label="Open navigation" onClick={() => setMobile(true)}><Menu/></button><span><CalendarClock/> Brokerage operations</span></header><div className="workspace">{children}</div></main>
  </div>;
}
