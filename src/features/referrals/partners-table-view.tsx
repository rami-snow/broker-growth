"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import { useRouter } from "next/navigation";
import { Avatar, Badge, EmptyState, showingCount, SummaryCard, Table, type BadgeTone } from "@/components/ui";
import { formatDayMonth } from "@/features/today/today-model";
import { partnerStats, partnerSummary, relationshipStatus, type ReferredLead, type RelationshipStatus } from "@/verticals/mortgage/referrals/relationship";

/** Compliance wording kept from the referral ADR; shown as a tooltip rather than footer text. */
export const ATTRIBUTION_NOTE = "Attribution is an operational record. It does not prove a partner caused the outcome, and no commission or revenue is tracked.";
const tone: Record<RelationshipStatus, BadgeTone> = { New: "info", Strong: "success", Active: "info", Cooling: "warning", Dormant: "neutral", Inactive: "neutral" };
export interface PartnerRowInput { id: string; name: string; organisationName?: string; type: string; status: string; createdAt: string; ownerName?: string }

/** Referral partners (Figma frame 05). Shared by both runtimes. */
export function PartnersTableView({ partners, referredLeads, matchingPartners, totalPartners, now, filters, footerNote, relationshipFilter }: { partners: PartnerRowInput[]; referredLeads: ReferredLead[]; matchingPartners?: number; totalPartners: number; now: Date; filters: ReactNode; footerNote?: ReactNode; relationshipFilter?: string }) {
  const router = useRouter(), open = (id: string) => router.push(`/referral-partners/${id}`);
  const summary = partnerSummary(partners, referredLeads, now);
  const rows = partners.map(partner => { const stats = partnerStats(partner.id, referredLeads, now); return { partner, stats, relationship: relationshipStatus(partner, stats.lastReferralAt, now) }; }).filter(row => !relationshipFilter || row.relationship === relationshipFilter);
  return <>
    <section className="metric-grid" aria-label="Partner summary"><SummaryCard label="Active partners" value={summary.activePartners}/><SummaryCard label="Referrals this quarter" value={summary.referralsThisQuarter}/><SummaryCard label="Referrals converted" value={summary.converted} hint={ATTRIBUTION_NOTE}/><SummaryCard label="Referral conversion rate" value={summary.conversionRate === null ? "—" : `${summary.conversionRate}%`}/></section>
    {filters}
    {rows.length ? <Table><thead><tr><th>Partner</th><th>Type</th><th>Referrals (90 days)</th><th><span className="th-hint" title={ATTRIBUTION_NOTE}>Converted <Info aria-hidden/><span className="sr-only">. {ATTRIBUTION_NOTE}</span></span></th><th>Last referral</th><th>Relationship</th><th>Next step</th></tr></thead>
      <tbody>{rows.map(({ partner, stats, relationship }) => <tr key={partner.id} className="ui-table-row--interactive" tabIndex={0} aria-label={`Open partner ${partner.name}`} onClick={() => open(partner.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(partner.id); } }}>
        <td><span className="person-cell"><Avatar name={partner.name} label={partner.name.split(/\s+/).slice(0, 2).map(part => part[0]!.toUpperCase()).join("")}/><span><Link href={`/referral-partners/${partner.id}`} onClick={event => event.stopPropagation()}>{partner.name}</Link>{partner.organisationName && <small>{partner.organisationName}</small>}</span></span></td>
        <td>{partner.type}</td>
        <td>{stats.referrals90Days}</td>
        <td>{stats.converted}</td>
        <td>{stats.lastReferralAt ? formatDayMonth(stats.lastReferralAt) : <span className="muted">—</span>}</td>
        <td><Badge tone={tone[relationship]}>{relationship}</Badge></td>
        <td><span className="muted">Not set</span></td>
      </tr>)}</tbody>
      <tfoot><tr><td colSpan={4}>{showingCount(relationshipFilter ? rows.length : matchingPartners ?? rows.length, totalPartners, "partner")}{footerNote}</td><td colSpan={3} style={{ textAlign: "right" }}>Relationship is based on time since the last referral</td></tr></tfoot>
    </Table> : <section className="card"><EmptyState title="No referral partners match" body="Change or clear the search and filters."/></section>}
  </>;
}
export const relationshipOptions: RelationshipStatus[] = ["New", "Strong", "Active", "Cooling", "Dormant", "Inactive"];
