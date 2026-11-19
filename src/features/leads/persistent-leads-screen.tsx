"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { runLeadAction } from "@/app/lead-actions";
import { Modal } from "@/components/modal";
import { PageTitle } from "@/components/page-title";
import { Button, Select, Status, Table, TextField } from "@/components/ui";
import type { LeadOperationsSnapshot } from "@/verticals/mortgage/repositories/lead-operations-port";
import { membershipName } from "@/verticals/mortgage/repositories/operations-repository";

export function PersistentLeadsScreen({ snapshot, capabilities }: { snapshot: LeadOperationsSnapshot; capabilities: string[] }) {
  const [creating, setCreating] = useState(false);
  return <><PageTitle title="Leads" body="Own the first response, follow-up and discovery-booking journey." action={capabilities.includes("lead.create") ? <Button leadingIcon={<Plus/>} onClick={() => setCreating(true)}>New lead</Button> : undefined}/>
    <div className="prototype-warning"><strong>Development workspace</strong><span>These records persist in the dedicated development database. Contact actions are records of work completed externally; no communication is sent.</span></div>
    <section className="surface">{snapshot.leads.length ? <Table><thead><tr><th>Lead</th><th>Purpose</th><th>Source</th><th>Owner</th><th>Status</th><th>Next action</th><th>Updated</th></tr></thead><tbody>{snapshot.leads.map(lead => <tr key={lead.id}><td><Link href={`/leads/${lead.id}`}><strong>{lead.firstName} {lead.lastName}</strong></Link><small>{lead.email}</small></td><td>{lead.loanPurpose}</td><td>{lead.source}</td><td>{membershipName(snapshot.memberships, lead.ownerMembershipId)}</td><td><Status tone={lead.status === "New" ? "warning" : lead.status === "Converted" ? "success" : "neutral"}>{lead.status}</Status></td><td>{lead.nextActionAt ? format(lead.nextActionAt) : "—"}</td><td>{format(lead.updatedAt)}</td></tr>)}</tbody></Table> : <p className="muted">No leads are recorded for this brokerage.</p>}</section>
    {creating && <PersistentNewLead members={snapshot.memberships} onClose={() => setCreating(false)}/>}</>;
}

function PersistentNewLead({ members, onClose }: { members: LeadOperationsSnapshot["memberships"]; onClose: () => void }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(runLeadAction, { ok:false, message:"" });
  const [commandId] = useState(() => crypto.randomUUID());
  useEffect(() => { if (state.ok && state.leadId) { onClose(); router.push(`/leads/${state.leadId}`); } }, [state, onClose, router]);
  return <Modal title="New lead" onClose={onClose}><form action={action} className="form-grid"><input type="hidden" name="operation" value="create"/><input type="hidden" name="commandId" value={commandId}/><TextField name="firstName" label="First name" required/><TextField name="lastName" label="Last name" required/><TextField name="email" label="Email" type="email" required/><TextField name="phone" label="Phone" type="tel" required/><TextField name="source" label="Lead source" defaultValue="Website enquiry" required/><Select name="loanPurpose" label="Loan purpose" options={["Purchase","Refinance","Investment purchase","Construction loan","Asset finance","Commercial finance","Other"].map(value => ({ value, label:value }))}/><Select name="timeframe" label="Timeframe" options={["Immediately","Within 1 month","1–3 months","3–6 months","Researching"].map(value => ({ value, label:value }))}/><Select name="contact" label="Preferred contact method" options={["Phone","Email","SMS"].map(value => ({ value, label:value }))}/><Select name="owner" label="Owner" options={[{ value:"", label:"Unassigned" },...members.map(member => ({ value:member.id, label:member.displayName }))]}/><p className="legal-note">Consent is recorded as Not recorded for every channel. An email address or phone number never implies consent.</p>{state.message && !state.ok && <p className="form-error" role="alert">{state.message}</p>}<div className="form-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create lead"}</Button></div></form></Modal>;
}

const format = (value: string) => new Intl.DateTimeFormat("en-AU", { dateStyle:"medium", timeStyle:"short" }).format(new Date(value));
