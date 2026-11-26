"use client";

import { useMemo, useState, type ReactNode } from "react";
import { useUrlParam } from "@/components/use-url-param";
import { useRouter } from "next/navigation";
import { PageTitle } from "@/components/page-title";
import { Badge, Button, showingCount, EmptyState, SearchInput, Select, Table, Tabs, type BadgeTone } from "@/components/ui";
import type { ActivityEvent } from "@/platform/audit/models";
import type { Task } from "@/platform/tasks/models";
import { loanPurposes, type MortgageLead, type MortgageLeadStatus } from "@/verticals/mortgage/leads/models";
import { compareByResponseDue, formatDuration, leadResponseState, type LeadResponseState } from "@/verticals/mortgage/leads/response";
import { formatDayMonth, formatTime, sydneyDay } from "@/features/today/today-model";

export const leadStages: MortgageLeadStatus[] = ["New", "Contact attempted", "Contacted", "Discovery booked", "Nurture", "Converted", "Closed"];
type Tab = "all" | "needs-response" | "unassigned" | "discovery" | "closed";
type Sort = "response" | "newest" | "activity";

export const stageTone = (status: MortgageLeadStatus): BadgeTone => ({ New: "info", "Contact attempted": "warning", Contacted: "teal", "Discovery booked": "success", Nurture: "neutral", Converted: "success", Closed: "neutral" } as const)[status];
const isActive = (lead: MortgageLead) => lead.status !== "Closed" && lead.status !== "Converted";

export function responseBadge(state: LeadResponseState, status: MortgageLeadStatus): { label: string; tone: BadgeTone } | null {
  if (state.kind === "awaiting") return state.minutesUntilDue < 0 ? { label: `Overdue ${formatDuration(-state.minutesUntilDue + 60)}`, tone: "danger" } : { label: `Due in ${formatDuration(state.minutesUntilDue)}`, tone: "warning" };
  if (state.kind === "responded") return { label: `Replied ${formatDuration(state.minutes)}`, tone: state.withinTarget ? "success" : "neutral" };
  return status === "Closed" ? { label: "No reply", tone: "neutral" } : null;
}
export const whenLabel = (value: string, now: Date) => `${sydneyDay(value) === sydneyDay(now) ? "Today" : formatDayMonth(value)}, ${formatTime(value)}`;

/** Leads (Figma frame 02). Shared by fixture and Supabase runtimes. */
export function LeadsListView({ leads, memberships, activities, tasks, now, canCreate, renderCreate }: {
  leads: MortgageLead[]; memberships: Array<{ id: string; displayName: string; mortgageProfile?: { position: string } }>; activities: Array<Pick<ActivityEvent<string>, "leadId" | "type" | "occurredAt" | "newStatus">>; tasks: Task[]; now: Date;
  canCreate: boolean; renderCreate: (close: () => void) => ReactNode;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("all"), [search, setSearch] = useState(""), [stage, setStage] = useState(""), [owner, setOwner] = useState(""), [source, setSource] = useState(""), [purpose, setPurpose] = useState(""), [sort, setSort] = useState<Sort>("response"), [manualCreate, setCreating] = useState<boolean | null>(null);
  const requestedCreate = useUrlParam("new") === "1";
  const creating = manualCreate ?? (canCreate && requestedCreate);
  const rows = useMemo(() => leads.map(lead => {
    const own = activities.filter(event => event.leadId === lead.id);
    const lastActivity = own.map(event => event.occurredAt).sort().at(-1) ?? lead.updatedAt;
    const task = tasks.filter(item => item.leadId === lead.id && item.status === "Open").sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
    return { lead, state: leadResponseState(lead, activities, now), lastActivity, nextActionAt: task?.dueAt ?? lead.nextActionAt, nextActionTitle: task?.title, createdAt: lead.createdAt };
  }), [leads, activities, tasks, now]);
  const inTab = (row: typeof rows[number], value: Tab) => value === "all" ? true : value === "needs-response" ? row.state.kind === "awaiting" : value === "unassigned" ? isActive(row.lead) && !row.lead.ownerMembershipId : value === "discovery" ? row.lead.status === "Discovery booked" : row.lead.status === "Closed";
  const filtered = rows.filter(row => inTab(row, tab)
    && `${row.lead.firstName} ${row.lead.lastName} ${row.lead.email} ${row.lead.phone}`.toLowerCase().includes(search.toLowerCase())
    && (!stage || row.lead.status === stage)
    && (!owner || (owner === "unassigned" ? isActive(row.lead) && !row.lead.ownerMembershipId : row.lead.ownerMembershipId === owner))
    && (!source || (row.lead.source || "Other") === source)
    && (!purpose || row.lead.loanPurpose === purpose))
    .sort((a, b) => sort === "newest" ? b.createdAt.localeCompare(a.createdAt) : sort === "activity" ? b.lastActivity.localeCompare(a.lastActivity) : compareByResponseDue(a, b));
  const count = (value: Tab) => rows.filter(row => inTab(row, value)).length;
  const member = (id?: string) => memberships.find(item => item.id === id)?.displayName;
  const open = (id: string) => router.push(`/leads/${id}`);
  const sortLabel = { response: "first response due", newest: "newest first", activity: "last activity" }[sort];
  return <>
    <PageTitle title="Leads" action={canCreate ? <Button onClick={() => setCreating(true)}>New lead</Button> : undefined}/>
    <Tabs label="Lead views" value={tab} onChange={setTab} options={[{ value: "all", label: "All", count: count("all") }, { value: "needs-response", label: "Needs response", count: count("needs-response") }, { value: "unassigned", label: "Unassigned", count: count("unassigned") }, { value: "discovery", label: "Discovery booked", count: count("discovery") }, { value: "closed", label: "Closed", count: count("closed") }]}/>
    <section className="filter-bar" aria-label="Lead filters">
      <SearchInput label="Search leads" placeholder="Search leads" value={search} onChange={event => setSearch(event.target.value)}/>
      <Select hideLabel label="Stage filter" value={stage} onChange={event => setStage(event.target.value)} options={[{ value: "", label: "All stages" }, ...leadStages.map(value => ({ value, label: value }))]}/>
      <Select hideLabel label="Owner filter" value={owner} onChange={event => setOwner(event.target.value)} options={[{ value: "", label: "All owners" }, { value: "unassigned", label: "Needs owner" }, ...memberships.filter(item => !item.mortgageProfile || item.mortgageProfile.position === "Broker").map(item => ({ value: item.id, label: item.displayName }))]}/>
      <Select hideLabel label="Source filter" value={source} onChange={event => setSource(event.target.value)} options={[{ value: "", label: "All sources" }, ...Array.from(new Set(leads.map(lead => lead.source || "Other"))).sort().map(value => ({ value, label: value }))]}/>
      <Select hideLabel label="Purpose filter" value={purpose} onChange={event => setPurpose(event.target.value)} options={[{ value: "", label: "Purpose: Any" }, ...loanPurposes.map(value => ({ value, label: value }))]}/>
      <span className="filter-bar__spacer"/>
      <Select hideLabel label="Sort leads" value={sort} onChange={event => setSort(event.target.value as Sort)} options={[{ value: "response", label: "Sort: Response due" }, { value: "newest", label: "Sort: Newest" }, { value: "activity", label: "Sort: Last activity" }]}/>
    </section>
    {filtered.length ? <Table><thead><tr><th>Lead</th><th>Stage</th><th>First response</th><th>Next action</th><th>Owner</th><th>Source</th><th>Last activity</th></tr></thead>
      <tbody>{filtered.map(({ lead, state, lastActivity, nextActionAt, nextActionTitle }) => { const badge = responseBadge(state, lead.status), ownerName = member(lead.ownerMembershipId); return <tr key={lead.id} className="ui-table-row--interactive" tabIndex={0} aria-label={`Open lead ${lead.firstName} ${lead.lastName}`} onClick={() => open(lead.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); open(lead.id); } }}>
        <td><span className="person-cell"><span className="avatar">{lead.firstName[0]}</span><span><strong>{lead.firstName} {lead.lastName}</strong><small>{lead.loanPurpose}</small></span></span></td>
        <td><Badge tone={stageTone(lead.status)}>{lead.status}</Badge></td>
        <td>{badge ? <Badge tone={badge.tone}>{badge.label}</Badge> : <span className="muted">—</span>}</td>
        <td>{nextActionAt && isActive(lead) ? <>{nextActionTitle && <small>{nextActionTitle}</small>}{whenLabel(nextActionAt, now)}</> : "None"}</td>
        <td>{ownerName ? <span className="person-cell"><span className="avatar">{ownerName[0]}</span>{ownerName}</span> : isActive(lead) ? <Badge tone="warning">Needs owner</Badge> : <span className="muted">Unassigned</span>}</td>
        <td>{lead.source || "Other"}</td>
        <td><small>{formatDayMonth(lastActivity)}</small></td>
      </tr>; })}</tbody>
      <tfoot><tr><td colSpan={4}>{showingCount(filtered.length, leads.length, "lead")}</td><td colSpan={3} style={{ textAlign: "right" }}>Sorted by {sortLabel}</td></tr></tfoot>
    </Table> : <section className="card"><EmptyState title="No leads match these filters" body="Change the tab, search or filters to see more leads."/></section>}
    {creating && renderCreate(() => setCreating(false))}
  </>;
}
