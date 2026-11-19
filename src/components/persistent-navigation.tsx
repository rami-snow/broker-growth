"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/today", label: "Today" },
  { href: "/leads", label: "Leads", capability: "lead.view" },
  { href: "/client-book", label: "Client Book" },
  { href: "/referral-partners", label: "Referral partners", capability: "mortgage.referral.view" },
  { href: "/campaigns", label: "Campaigns", capability: "campaign.view" },
  { href: "/reports", label: "Reports", capability: "report.view" },
  { href: "/settings", label: "Settings", capability: "settings.view" },
];

export function PersistentNavigation({ capabilities }: { capabilities: string[] }) {
  const pathname = usePathname();
  return <nav className="persistent-navigation" aria-label="Main navigation">{items.filter(item => !item.capability || capabilities.includes(item.capability)).map(item => <Link key={item.href} href={item.href} aria-current={pathname === item.href || pathname.startsWith(`${item.href}/`) ? "page" : undefined}>{item.label}</Link>)}</nav>;
}
