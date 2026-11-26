"use client";

import { useActionState, useEffect, useState } from "react";
import { LeadsListView } from "./leads-list-view";
import { useRouter } from "next/navigation";
import { runLeadAction } from "@/app/lead-actions";
import { Modal } from "@/components/modal";
import { Button, Select, TextField } from "@/components/ui";
import type { LeadOperationsSnapshot } from "@/verticals/mortgage/repositories/lead-operations-port";

export function PersistentLeadsScreen({ snapshot, capabilities, now = new Date() }: { snapshot: LeadOperationsSnapshot; capabilities: string[]; now?: Date }) {
  return <LeadsListView leads={snapshot.leads} memberships={snapshot.memberships} activities={snapshot.activities} tasks={snapshot.tasks} now={now} canCreate={capabilities.includes("lead.create")} renderCreate={close => <PersistentNewLead members={snapshot.memberships} onClose={close}/>}/>;
}

function PersistentNewLead({ members, onClose }: { members: LeadOperationsSnapshot["memberships"]; onClose: () => void }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(runLeadAction, { ok:false, message:"" });
  const [commandId] = useState(() => crypto.randomUUID());
  useEffect(() => { if (state.ok && state.leadId) { onClose(); router.push(`/leads/${state.leadId}`); } }, [state, onClose, router]);
  return <Modal title="New lead" onClose={onClose}><form action={action} className="form-grid"><input type="hidden" name="operation" value="create"/><input type="hidden" name="commandId" value={commandId}/><TextField name="firstName" label="First name" required/><TextField name="lastName" label="Last name" required/><TextField name="email" label="Email" type="email" required/><TextField name="phone" label="Phone" type="tel" required/><TextField name="source" label="Lead source" defaultValue="Website enquiry" required/><Select name="loanPurpose" label="Loan purpose" options={["Purchase","Refinance","Investment purchase","Construction loan","Asset finance","Commercial finance","Other"].map(value => ({ value, label:value }))}/><Select name="timeframe" label="Timeframe" options={["Immediately","Within 1 month","1–3 months","3–6 months","Researching"].map(value => ({ value, label:value }))}/><Select name="contact" label="Preferred contact method" options={["Phone","Email","SMS"].map(value => ({ value, label:value }))}/><Select name="owner" label="Owner" options={[{ value:"", label:"Unassigned" },...members.map(member => ({ value:member.id, label:member.displayName }))]}/><p className="legal-note">Consent is recorded as Not recorded for every channel. An email address or phone number never implies consent.</p>{state.message && !state.ok && <p className="form-error" role="alert">{state.message}</p>}<div className="form-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create lead"}</Button></div></form></Modal>;
}

