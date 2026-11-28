"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Avatar, EmptyState, showingCount, SummaryCard, Table } from "@/components/ui";
import { formatDate } from "@/features/today/today-model";
import { useTimeZone } from "@/components/time-zone";
import type { ClientRetentionSummary } from "@/verticals/mortgage/households/client-list";

export interface ClientTableRow extends ClientRetentionSummary { id: string; name: string; ownerName?: string; status: string }
export interface ClientSummaryCounts { activeHouseholds: number; peopleInActiveHouseholds: number; fixedEndingIn90Days: number; overdueReviews: number }

/** Clients (Figma frame 04): summary cards, filters slot and the retention-only client table. */
export function ClientsTableView({ summary, filters, rows, matching, total, emptyTitle, emptyBody, footerExtra }: { summary?: ClientSummaryCounts; filters: ReactNode; rows: ClientTableRow[]; matching: number; total: number; emptyTitle: string; emptyBody: string; footerExtra?: ReactNode }) {
  const timeZone = useTimeZone(), router = useRouter(), open = (id: string) => router.push(`/client-book/${id}`);
  return <>
    {summary && <section className="metric-grid" aria-label="Client summary"><SummaryCard label="Active households" value={summary.activeHouseholds}/><SummaryCard label="People in active households" value={summary.peopleInActiveHouseholds}/><SummaryCard label="Households with a fixed rate ending in 90 days" value={summary.fixedEndingIn90Days}/><SummaryCard label="Households with an overdue review" value={summary.overdueReviews}/></section>}
    {filters}
    {rows.length ? <Table><thead><tr><th>Client</th><th>Rate type</th><th>Lender</th><th>Fixed rate ends</th><th>Opportunity</th><th>Owner</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.id} className="ui-table-row--interactive" tabIndex={0} aria-label={`Open household ${row.name}`} onClick={() => open(row.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(row.id); } }}>
        <td><span className="person-cell"><Avatar name={row.name} label={row.name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]!.toUpperCase()).join("")}/><span>{row.name}{row.status !== "Active" && <small>{row.status}</small>}</span></span></td>
        <td>{row.rateType ?? <span className="muted">Not recorded</span>}</td>
        <td>{row.lenderName ?? "—"}</td>
        <td>{row.fixedRateExpiryDate ? formatDate(row.fixedRateExpiryDate, timeZone) : <span className="muted">—</span>}</td>
        <td>{row.opportunity ? <span className={row.opportunity.status === "Overdue" ? "text-danger" : undefined}>{row.opportunity.label}</span> : "—"}</td>
        <td>{row.ownerName ? <span className="person-cell"><Avatar name={row.ownerName}/>{row.ownerName}</span> : <span className="text-warning">Needs owner</span>}</td>
      </tr>)}</tbody>
      <tfoot><tr><td colSpan={3}>{showingCount(matching, total, "household")}{footerExtra}</td><td colSpan={3} style={{ textAlign: "right" }}>Loan records hold lender, rate type and fixed-rate expiry date only</td></tr></tfoot>
    </Table> : <section className="card"><EmptyState title={emptyTitle} body={emptyBody}/></section>}
  </>;
}
