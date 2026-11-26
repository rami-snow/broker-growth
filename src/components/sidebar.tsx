"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BarChart3, Briefcase, ChevronsUpDown, Handshake, House, Megaphone, Search, SlidersHorizontal, Users } from "lucide-react";
import { Avatar, initials } from "./ui";
import { OPEN_COMMAND_BAR_EVENT } from "./command-bar-events";

interface NavItem { href: string; label: string; icon: typeof House; capability?: string; match?: string[] }
const groups: Array<{ label?: string; items: NavItem[] }> = [
  { items: [{ href: "/today", label: "Today", icon: House }] },
  { label: "Pipeline", items: [
    { href: "/leads", label: "Leads", icon: Users, capability: "lead.view" },
    { href: "/client-book", label: "Clients", icon: Briefcase },
    { href: "/referral-partners", label: "Partners", icon: Handshake, capability: "mortgage.referral.view" },
  ] },
  { label: "Grow", items: [
    { href: "/campaigns", label: "Campaigns", icon: Megaphone, capability: "campaign.view" },
    { href: "/reports", label: "Reports", icon: BarChart3, capability: "report.view" },
  ] },
];
const settingsItem: NavItem = { href: "/settings", label: "Settings", icon: SlidersHorizontal, capability: "settings.view" };

export interface BrokerageOption { id: string; name: string }

/** Shared navigation shell used by both fixture and Supabase runtimes. */
export function Sidebar({ capabilities, brokerageName, brokerageSwitcher, leadsBadge, userName, userPosition, footer }: {
  capabilities: readonly string[];
  brokerageName: string;
  brokerageSwitcher?: ReactNode;
  leadsBadge?: number;
  userName: string;
  userPosition: string;
  footer?: ReactNode;
}) {
  const pathname = usePathname();
  const visible = (item: NavItem) => !item.capability || capabilities.includes(item.capability);
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const renderItem = (item: NavItem) => <Link key={item.href} href={item.href} className="sidebar-nav__item" aria-current={isActive(item.href) ? "page" : undefined}>
    <item.icon aria-hidden/><span>{item.label}</span>
    {item.href === "/leads" && leadsBadge ? <span className="badge badge-info sidebar-nav__badge" aria-hidden title={`${leadsBadge} leads need a first response`}>{leadsBadge}</span> : null}
  </Link>;
  return <aside className="sidebar" aria-label="Workspace">
    <div className="sidebar__product"><span className="sidebar__mark" aria-hidden><BarChart3/></span><strong>Broker Growth Desk</strong></div>
    <div className="sidebar__brokerage">
      <span className="sidebar__label" id="sidebar-brokerage-label">Brokerage</span>
      {brokerageSwitcher ?? <div className="brokerage-box"><span className="brokerage-box__logo" aria-hidden>{initials(brokerageName).slice(0, 1)}</span><span className="brokerage-box__name">{brokerageName}</span></div>}
    </div>
    <div className="sidebar__command">
      <button type="button" className="command-trigger" onClick={() => window.dispatchEvent(new Event(OPEN_COMMAND_BAR_EVENT))} aria-keyshortcuts="Meta+K Control+K">
        <Search aria-hidden/><span>Search</span><span className="command-trigger__keys" aria-hidden><kbd className="kbd">⌘</kbd><kbd className="kbd">K</kbd></span>
      </button>
    </div>
    <nav className="sidebar-nav" aria-label="Main navigation">
      {groups.map((group, index) => { const items = group.items.filter(visible); if (!items.length) return null; return <div key={group.label ?? index} className="sidebar-nav__group">{group.label && <p className="sidebar-nav__heading">{group.label}</p>}{items.map(renderItem)}</div>; })}
    </nav>
    <div className="sidebar__account">
      {visible(settingsItem) && <nav aria-label="Account navigation">{renderItem(settingsItem)}</nav>}
      <div className="sidebar__user"><Avatar name={userName} size={32}/><span><strong>{userName}</strong><small>{userPosition}</small></span></div>
      {footer}
    </div>
  </aside>;
}

/** Native select styled as the Figma brokerage switcher. */
export function BrokerageSelect({ id, name, value, options, onChange }: { id: string; name?: string; value: string; options: BrokerageOption[]; onChange?: (value: string, element: HTMLSelectElement) => void }) {
  const current = options.find(option => option.id === value);
  return <div className="brokerage-box brokerage-box--select">
    <span className="brokerage-box__logo" aria-hidden>{initials(current?.name ?? "?").slice(0, 1)}</span>
    <span className="brokerage-box__name" aria-hidden>{current?.name}</span>
    <ChevronsUpDown aria-hidden/>
    <select id={id} name={name} aria-labelledby="sidebar-brokerage-label" value={value} onChange={event => onChange?.(event.target.value, event.target)}>{options.map(option => <option key={option.id} value={option.id}>{option.name}</option>)}</select>
  </div>;
}
