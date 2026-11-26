"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { ArrowRight, CalendarDays, Clock, FileText, Mail, Phone, StickyNote, User } from "lucide-react";
import { PageTitle } from "@/components/page-title";
import { Avatar, Badge, Button, type BadgeTone } from "@/components/ui";
import type { ActivityEvent } from "@/platform/audit/models";
import type { Appointment } from "@/platform/appointments/models";
import type { Task } from "@/platform/tasks/models";
import type { ConsentChannelStatus } from "@/platform/consent/models";
import type { MortgageLead, MortgageLeadStatus } from "@/verticals/mortgage/leads/models";
import { formatDuration, leadResponseState } from "@/verticals/mortgage/leads/response";
import { formatDayMonth, formatTime, sydneyDay } from "@/features/today/today-model";
import { responseBadge, stageTone, whenLabel } from "./leads-list-view";

export type LeadDetailAction = "assign" | "status" | "contact" | "note" | "task" | "appointment" | "convert" | "referral";
export interface LeadDetailPermissions { canUpdate: boolean; canAssign: boolean; canChangeStage: boolean; canContact: boolean; canTask: boolean; canBook: boolean; canConvert: boolean; canReferral?: boolean }

const steps: MortgageLeadStatus[] = ["New", "Contact attempted", "Contacted", "Discovery booked", "Converted"];
const consentLabel: Record<string, { label: string; tone: BadgeTone }> = { Recorded: { label: "Recorded", tone: "success" }, "Not recorded": { label: "Not recorded", tone: "warning" }, "Opted out": { label: "Opted out", tone: "danger" } };
const eventIcon = (type: string) => type === "contact.attempted" ? Phone : type === "note.added" ? StickyNote : type.startsWith("lead.assigned") || type === "lead.claimed" ? User : type === "appointment.created" ? CalendarDays : type === "task.created" || type === "lead.next_action_changed" ? Clock : type === "lead.status_changed" || type === "lead.converted" ? ArrowRight : type === "lead.created" ? FileText : Mail;
/** Always date and time, e.g. "14 Nov, 8:30 am", in the brokerage time zone. */
const fullDate = (value: string) => `${formatDayMonth(value)}, ${formatTime(value)}`;

/** Lead detail (Figma frame 03). Runtimes supply permissions, modals and side-effect handlers. */
export function LeadDetailView({ lead, memberships, tasks, appointments, activities, now, permissions, onAction, onAddNote, claimControl, reopenControl, workload, legalNote }: {
  lead: MortgageLead; memberships: Array<{ id: string; displayName: string }>; tasks: Task[]; appointments: Appointment[];
  activities: Array<Pick<ActivityEvent<string>, "id" | "type" | "summary" | "occurredAt" | "actorMembershipId" | "note" | "contactChannel" | "contactOutcome" | "leadId" | "newStatus">>;
  now: Date; permissions: LeadDetailPermissions; onAction: (action: LeadDetailAction) => void; onAddNote: (note: string) => Promise<string | undefined> | string | undefined;
  claimControl?: ReactNode; reopenControl?: ReactNode; workload?: Array<{ name: string; open: number }>; legalNote: string;
}) {
  const [note, setNote] = useState(""), [noteError, setNoteError] = useState(""), [saving, setSaving] = useState(false);
  useEffect(() => { const requested = new URLSearchParams(window.location.search).get("action"); if (requested === "assign" && permissions.canAssign) onAction("assign"); if (requested === "note" && permissions.canUpdate) onAction("note"); if (requested === "contact" && permissions.canContact) onAction("contact"); // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const name = `${lead.firstName} ${lead.lastName}`, member = (id?: string) => memberships.find(item => item.id === id)?.displayName;
  const state = leadResponseState(lead, activities, now), response = responseBadge(state, lead.status), owner = member(lead.ownerMembershipId), active = lead.status !== "Closed" && lead.status !== "Converted";
  const history = [...activities].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const openTask = tasks.filter(item => item.status === "Open").sort((a, b) => a.dueAt.localeCompare(b.dueAt))[0];
  const upcoming = appointments.filter(item => item.status === "Booked" && Date.parse(item.startsAt) >= now.getTime() - 3600000).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];
  const next = !active ? undefined : openTask ? { title: openTask.title, dueAt: openTask.dueAt } : upcoming ? { title: `Discovery call with ${lead.firstName}`, dueAt: upcoming.startsAt } : lead.nextActionAt ? { title: `Follow up with ${lead.firstName}`, dueAt: lead.nextActionAt } : state.kind === "awaiting" ? { title: `Call ${lead.firstName}`, dueAt: state.dueAt } : undefined;
  const nextBadge = next && (Date.parse(next.dueAt) < now.getTime() ? { label: "Overdue", tone: "danger" as BadgeTone } : sydneyDay(next.dueAt) === sydneyDay(now) ? { label: "Due today", tone: "info" as BadgeTone } : { label: `Due ${formatDayMonth(next.dueAt)}`, tone: "neutral" as BadgeTone });
  const lastNote = history.find(event => event.note)?.note;
  const stepIndex = steps.indexOf(lead.status);
  const consent = (channel: "email" | "sms" | "phone") => consentLabel[lead.consentSummary[channel] as ConsentChannelStatus] ?? { label: lead.consentSummary[channel], tone: "neutral" as BadgeTone };
  const submitNote = async () => { if (!note.trim()) { setNoteError("Write a note first."); return; } setSaving(true); const error = await onAddNote(note.trim()); setSaving(false); if (error) setNoteError(error); else { setNote(""); setNoteError(""); } };

  return <div className="split-page">
    <div className="split-page__main">
      <PageTitle breadcrumb={{ href: "/leads", label: "Leads" }} title={name} action={<>
        {permissions.canContact && <Button variant="secondary" onClick={() => onAction("contact")}>Log contact attempt</Button>}
        {permissions.canChangeStage ? <Button onClick={() => onAction("status")}>Change stage</Button> : reopenControl}
      </>}/>
      <div className="lead-header"><Avatar name={name} size={48} label={lead.firstName[0]}/><div><h2>{name}</h2><div className="badge-row"><Badge tone={stageTone(lead.status)}>{lead.status}</Badge><Badge>{lead.loanPurpose}</Badge>{response && <Badge tone={response.tone}>{response.label}</Badge>}<Badge>{lead.source || "Other"}</Badge></div></div></div>
      <ol className="stepper" aria-label="Lead stage">{steps.map((step, index) => <li key={step} className={index < stepIndex ? "done" : index === stepIndex ? "current" : ""} aria-current={index === stepIndex ? "step" : undefined}>{step}</li>)}</ol>
      {stepIndex < 0 && <p className="stepper-note">This lead is in {lead.status}. {lead.status === "Closed" ? "Reopen it to continue." : "Change stage when the client is ready."}</p>}
      <section className="enquiry" aria-labelledby="enquiry-heading">
        <header><h2 id="enquiry-heading">Enquiry</h2><small>Received {fullDate(lead.createdAt)}</small></header>
        <ul>
          <li>{lead.loanPurpose} enquiry from {lead.source || "an unknown source"}. Timeframe: {lead.timeframe.toLowerCase()}. Prefers {lead.preferredContactMethod.toLowerCase()}.</li>
          <li>{state.kind === "awaiting" ? "No first response recorded yet. The target is within 1 hour." : state.kind === "responded" ? `First contact attempt logged ${formatDuration(state.minutes, true)} after the enquiry${state.withinTarget ? ", within the 1 hour target" : ""}.` : "No contact attempt was logged for this lead."}</li>
          <li>Email consent is {lead.consentSummary.email.toLowerCase()}. SMS consent is {lead.consentSummary.sms.toLowerCase()}.</li>
          {lead.referralPartnerName && <li>Referred by {lead.referralPartnerName}{lead.referralPartnerStatus === "Inactive" ? " (inactive partner, kept for history)" : ""}.</li>}
        </ul>
        <div className="badge-row"><Badge tone={lead.consentSummary.email === "Recorded" ? "success" : "warning"}>{lead.consentSummary.email === "Recorded" ? "Email consent" : "No email consent"}</Badge><Badge tone={lead.consentSummary.sms === "Recorded" ? "success" : "warning"}>{lead.consentSummary.sms === "Recorded" ? "SMS consent" : "No SMS consent"}</Badge></div>
      </section>
      <section className="next-action" aria-labelledby="next-action-heading">
        <header><small>Next action</small>{nextBadge && <Badge tone={nextBadge.tone}>{nextBadge.label}</Badge>}</header>
        <h3 id="next-action-heading">{next ? `${next.title}, ${whenLabel(next.dueAt, now).replace(/^Today/, "today")}` : active ? "No next action set" : `No next action. This lead is ${lead.status}.`}</h3>
        <div className="next-action__notes"><small>Latest note</small><span>{lastNote ?? "No call notes yet. Record the outcome after you call."}</span></div>
        {permissions.canUpdate && active && <div className="next-action__actions">
          {permissions.canContact && <Button onClick={() => onAction("contact")}>Mark done</Button>}
          {permissions.canTask && <Button variant="secondary" onClick={() => onAction("task")}>Reschedule</Button>}
          <Button variant="secondary" onClick={() => onAction("note")}>Add note</Button>
          <small>Nothing is sent from here. Record the outcome after you call.</small>
        </div>}
      </section>
      <h2 className="section-title" id="activity-heading">Activity</h2>
      <div className="timeline-list" aria-labelledby="activity-heading">{history.map(event => { const Icon = eventIcon(event.type); const actor = member(event.actorMembershipId); return <div key={event.id} className="timeline-item"><span className="timeline-item__icon" aria-hidden><Icon/></span><div className="timeline-item__body"><strong>{event.summary}</strong>{event.contactChannel && event.contactOutcome && <span><b>{event.contactChannel}</b> · {event.contactOutcome}</span>}{event.note && <span>{event.note}</span>}{actor && <span>{actor}</span>}</div><time dateTime={event.occurredAt}>{fullDate(event.occurredAt)}</time></div>; })}{!history.length && <p className="muted">No activity yet.</p>}</div>
      {permissions.canUpdate && <div className="composer"><label className="sr-only" htmlFor="lead-note">Add a note about {lead.firstName}</label><textarea id="lead-note" placeholder={`Add a note about ${lead.firstName}…`} value={note} onChange={event => setNote(event.target.value)}/>{noteError && <p className="form-error" role="alert">{noteError}</p>}<Button size="small" onClick={submitNote} disabled={saving}>{saving ? "Saving…" : "Add note"}</Button></div>}
    </div>
    <aside className="split-page__aside" aria-label="Lead details">
      <section className="panel-section" aria-labelledby="details-heading"><h2 id="details-heading">Details</h2><dl className="kv">
        <dt>Stage</dt><dd>{lead.status}</dd>
        <dt>Owner</dt><dd>{owner ?? <Badge tone="warning">{active ? "Needs owner" : "Unassigned"}</Badge>}</dd>
        <dt>Source</dt><dd>{lead.source || "Other"}</dd>
        {lead.referralPartnerName && <><dt>Referral</dt><dd>{lead.referralPartnerName}{lead.referralPartnerStatus === "Inactive" ? " (inactive)" : ""}</dd></>}
        <dt>Purpose</dt><dd>{lead.loanPurpose}</dd>
        <dt>Timeframe</dt><dd>{lead.timeframe}</dd>
        <dt>Phone</dt><dd>{lead.phone}</dd>
        <dt>Email</dt><dd>{lead.email}</dd>
        <dt>Prefers</dt><dd>{lead.preferredContactMethod}</dd>
        <dt>Created</dt><dd>{fullDate(lead.createdAt)}</dd>
      </dl></section>
      <section className="panel-section" aria-labelledby="consent-heading"><h2 id="consent-heading">Consent</h2><dl className="kv">
        <dt>Email</dt><dd><Badge tone={consent("email").tone}>{consent("email").label}</Badge></dd>
        <dt>SMS</dt><dd><Badge tone={consent("sms").tone}>{consent("sms").label}</Badge></dd>
        <dt>Phone</dt><dd><Badge tone={consent("phone").tone}>{consent("phone").label}</Badge></dd>
      </dl><small>Source: {lead.consentSummary.source}, {fullDate(lead.consentSummary.recordedAt)}</small><p className="legal-note">{legalNote}</p></section>
      <section className="owner-panel" aria-labelledby="owner-heading"><h2 id="owner-heading">Owner</h2><span>{owner ? `${owner} owns this lead.` : "No one owns this lead yet."}{workload?.length ? ` Open leads right now: ${workload.map(item => `${item.name} ${item.open}`).join(", ")}.` : ""}</span>{permissions.canAssign && active && <Button size="small" onClick={() => onAction("assign")}>Assign owner</Button>}{claimControl}</section>
      <section className="panel-section" aria-labelledby="lead-actions-heading"><h2 id="lead-actions-heading">Lead actions</h2><div className="panel-actions">
        {permissions.canBook && <Button variant="secondary" onClick={() => onAction("appointment")}>Book discovery appointment</Button>}
        {permissions.canConvert && <Button onClick={() => onAction("convert")}>Convert to client</Button>}
        {lead.convertedHouseholdId && <Link className="ui-button ui-button--primary" href={`/client-book/${lead.convertedHouseholdId}`}>Open client household</Link>}
        {permissions.canTask && active && <Button variant="secondary" onClick={() => onAction("task")}>Create follow-up task</Button>}
        {permissions.canReferral && <Button variant="secondary" onClick={() => onAction("referral")}>Set referral attribution</Button>}
        {permissions.canChangeStage && reopenControl}
      </div></section>
    </aside>
  </div>;
}
