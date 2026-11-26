"use client";
import { useState } from "react";
import { PageTitle } from "@/components/page-title";
import { Badge, Button, Table } from "@/components/ui";
import { usePrototype } from "@/components/prototype-provider";
import { useUrlParam } from "@/components/use-url-param";
import { formatDayMonth, formatTime } from "@/features/today/today-model";

const tabs = [
  { key: "brokerage", label: "Brokerage" },
  { key: "team", label: "Team and positions" },
  { key: "data", label: "Data sources" },
  { key: "consent", label: "Consent" },
  { key: "audit", label: "Audit log" },
] as const;
type TabKey = (typeof tabs)[number]["key"];

/** Settings (Figma frame 08). Phase 1 data sources: CSV import only; other sources are shown as Coming later. */
export function SettingsScreen() {
  const { repo, context, revision } = usePrototype(); void revision;
  const requested = useUrlParam("tab"), [manualTab, setTab] = useState<TabKey | null>(null);
  const tab: TabKey = manualTab ?? (tabs.some(item => item.key === requested) ? requested as TabKey : "brokerage");
  const state = repo.snapshot(), brokerage = state.organisations.find(item => item.id === context.organisationId)!, membership = repo.getMembership(context), members = repo.listMemberships(context);
  const title = tabs.find(item => item.key === tab)!.label;
  const audit = [...state.activities, ...state.campaignActivities].filter(item => item.organisationId === context.organisationId).sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 50);
  const leadName = (id?: string) => { const lead = state.leads.find(item => item.id === id); return lead ? `${lead.firstName} ${lead.lastName}` : undefined; };
  return <div className="split-page split-page--left">
    <aside className="split-page__aside settings-nav" aria-label="Settings sections"><h2>Settings</h2><div role="tablist" aria-orientation="vertical">{tabs.map(item => <button key={item.key} type="button" role="tab" aria-selected={tab === item.key} onClick={() => setTab(item.key)}>{item.label}</button>)}</div></aside>
    <div className="split-page__main">
      <PageTitle title={title} action={tab === "data" ? <Button disabled title="CSV import arrives in milestone 4F.3">Import CSV</Button> : undefined}/>
      {tab === "brokerage" && <section className="settings-section"><div className="card card__body"><dl className="kv"><dt>Brokerage</dt><dd>{brokerage.name}</dd><dt>Region</dt><dd>{brokerage.region}</dd><dt>Your position</dt><dd>{membership.mortgageProfile.position}</dd></dl></div><p>Each brokerage is a separate tenant. Switch brokerage from the sidebar. An overview across brokerages is planned for later.</p></section>}
      {tab === "team" && <section className="settings-section"><p>Permissions are capability-based. A position is a starting bundle of capabilities, not a permission by itself.</p><Table><thead><tr><th>Member</th><th>Position</th><th>Status</th><th>Capabilities</th></tr></thead><tbody>{members.map(item => <tr key={item.id}><td>{item.displayName}</td><td>{item.mortgageProfile.position}</td><td><Badge tone={item.status === "Active" ? "success" : "neutral"}>{item.status}</Badge></td><td>{item.id === membership.id ? <span className="capability-list">{item.capabilities.map(capability => <Badge key={capability}>{capability}</Badge>)}</span> : `${item.capabilities.length} capabilities`}</td></tr>)}</tbody></Table></section>}
      {tab === "data" && <section className="settings-section"><p>Phase 1 brings data in by manual entry and CSV import only. Direct CRM connections come in stage 2, once a pilot brokerage chooses the first integration.</p>
        <Table><thead><tr><th>Source</th><th>What it brings in</th><th>Status</th></tr></thead><tbody>
          <tr><td>CSV file</td><td className="muted">Leads, clients, households and referral partners from any CRM export</td><td><Badge tone="info">Manual import</Badge></td></tr>
          <tr><td>Manual entry</td><td className="muted">New leads, clients and partners added in the app</td><td><Badge tone="success">Available</Badge></td></tr>
          <tr><td>Broker CRM</td><td className="muted">Direct connection, for example Salestrekker or Mercury Nexus</td><td><Badge>Coming later</Badge></td></tr>
          <tr><td>Website enquiry form</td><td className="muted">New leads as they arrive</td><td><Badge>Coming later</Badge></td></tr>
        </tbody></Table>
        <div className="card card__body"><h2>How importing works</h2><ul className="bullets"><li>Records are matched on email or phone, so running an import again never creates duplicates.</li><li>Every imported change appears in the audit log with the actor “import”, not a person.</li><li>Loan records stay minimal: lender, loan purpose and fixed-rate expiry date. Rates, balances and loan amounts are never imported.</li><li>The CSV import screen arrives with milestone 4F.3.</li></ul></div></section>}
      {tab === "consent" && <section className="settings-section"><p>Consent is recorded per channel. An email address or phone number never implies consent.</p><Table><thead><tr><th>Status</th><th>Meaning</th></tr></thead><tbody><tr><td><Badge tone="success">Recorded</Badge></td><td>Evidence of consent was supplied, with its source and time.</td></tr><tr><td><Badge tone="warning">Not recorded</Badge></td><td>No evidence on file. Treated as no consent.</td></tr><tr><td><Badge tone="danger">Opted out</Badge></td><td>The person withdrew consent. Reinstating needs new external evidence.</td></tr></tbody></Table><div className="prototype-warning"><span>Nothing is sent from Broker Growth Desk in phase 1. A legal review of the Spam Act 2003, Privacy Act 1988 and NCCP obligations is required before any real outreach. These summaries are not legal advice.</span></div></section>}
      {tab === "audit" && <section className="settings-section"><p>Every change is recorded here. Entries cannot be edited or deleted.</p><Table><thead><tr><th>When</th><th>Actor</th><th>Record</th><th>Change</th></tr></thead><tbody>{audit.map(event => <tr key={event.id}><td className="mono"><small>{formatDayMonth(event.occurredAt)}, {formatTime(event.occurredAt)}</small></td><td>{members.find(item => item.id === event.actorMembershipId)?.displayName ?? "Unknown member"}<small>Person</small></td><td>{"leadId" in event && leadName(event.leadId) ? leadName(event.leadId) : "campaignId" in event ? "Campaign" : "—"}</td><td>{event.summary ?? event.type}</td></tr>)}</tbody></Table></section>}
    </div>
  </div>;
}
