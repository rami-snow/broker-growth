"use client";

import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { runLeadAction } from "@/app/lead-actions";
import { Modal } from "@/components/modal";
import { Button, Select, TextArea, TextField } from "@/components/ui";
import { LeadDetailView } from "./lead-detail-view";
import { contactChannels, contactOutcomes } from "@/platform/audit/models";
import { allowedTransitions, canTransitionLead } from "@/verticals/mortgage/leads/workflow";
import type { LeadOperationsSnapshot } from "@/verticals/mortgage/repositories/lead-operations-port";
import { PersistentLeadConversion } from "@/features/clients/persistent-lead-conversion";
import type { DuplicateMatch } from "@/verticals/mortgage/repositories/client-book-port";

type ReferralOption={id:string;name:string;organisationName?:string};
type Action = "assign"|"transition"|"contact"|"note"|"task"|"appointment"|"referral"|"convert"|null;
export function PersistentLeadDetail({ snapshot, actorMembershipId, capabilities, commandIds, duplicateMatches = [],referralOptions=[], now = new Date() }: { snapshot: LeadOperationsSnapshot; actorMembershipId: string; capabilities: string[]; commandIds: { claim:string; reopen:string }; duplicateMatches?: DuplicateMatch[];referralOptions?:ReferralOption[]; now?: Date }) {
  const lead = snapshot.leads[0];
  const router = useRouter();
  const [activeAction, setActiveAction] = useState<Action>(null);
  if (!lead) return <section className="surface inaccessible"><h1>Lead unavailable</h1><p>This lead is not available in the active brokerage.</p><Link className="ui-button ui-button--secondary" href="/leads">Return to leads</Link></section>;
  const canUpdate = capabilities.includes("lead.update") && (capabilities.includes("lead.assign") || lead.ownerMembershipId === actorMembershipId);
  const canClaim = capabilities.includes("lead.claim") && !lead.ownerMembershipId && lead.status !== "Closed" && lead.status !== "Converted";
  const transitionOptions = allowedTransitions(lead.status).filter(item => item !== "Discovery booked");
  const active = lead.status !== "Closed" && lead.status !== "Converted";
  const addNote = async (note: string) => { const data = new FormData(); data.set("operation", "note"); data.set("commandId", crypto.randomUUID()); data.set("leadId", lead.id); data.set("expectedVersion", String(lead.version)); data.set("note", note); const result = await runLeadAction({ ok:false, message:"" }, data); if (!result.ok) return result.message || "Unable to add note"; router.refresh(); return undefined; };
  return <><LeadDetailView lead={lead} memberships={snapshot.memberships} tasks={snapshot.tasks} appointments={snapshot.appointments} activities={snapshot.activities} now={now} legalNote="Evidence summary only; it is not a legal determination that outreach is permitted."
    permissions={{ canUpdate, canAssign: capabilities.includes("lead.assign") && active, canChangeStage: canUpdate && lead.status !== "Closed" && transitionOptions.length > 0, canContact: canUpdate && active, canTask: canUpdate && capabilities.includes("task.create") && lead.status !== "Converted", canBook: canUpdate && capabilities.includes("appointment.create") && canTransitionLead(lead.status,"Discovery booked"), canConvert: lead.status === "Discovery booked" && canUpdate && capabilities.includes("mortgage.household.create"), canReferral: canUpdate && capabilities.includes("mortgage.referral.view") && lead.status !== "Converted" }}
    onAction={next => setActiveAction(next === "status" ? "transition" : next)} onAddNote={addNote}
    claimControl={canClaim ? <ImmediateAction operation="claim" commandId={commandIds.claim} leadId={lead.id} version={lead.version} label="Claim lead"/> : undefined}
    reopenControl={lead.status === "Closed" && canUpdate ? <ImmediateAction operation="reopen" commandId={commandIds.reopen} leadId={lead.id} version={lead.version} label="Reopen lead"/> : undefined}/>
  {activeAction === "convert" ? <PersistentLeadConversion lead={lead} members={snapshot.memberships} duplicates={duplicateMatches} referralOptions={referralOptions} onClose={() => setActiveAction(null)}/> : activeAction && <PersistentActionModal actionName={activeAction} lead={lead} members={snapshot.memberships} transitions={transitionOptions} referralOptions={referralOptions} onClose={() => setActiveAction(null)}/>}</>;
}

function ImmediateAction({ operation, commandId, leadId, version, label }: { operation: "claim"|"reopen"; commandId:string; leadId: string; version: number; label: string }) {
  const [state, action, pending] = useActionState(runLeadAction, { ok:false, message:"" }); const router = useRouter();
  useEffect(() => { if (state.ok) router.refresh(); }, [state.ok, router]);
  return <form action={action}><input type="hidden" name="operation" value={operation}/><input type="hidden" name="commandId" value={commandId}/><input type="hidden" name="leadId" value={leadId}/><input type="hidden" name="expectedVersion" value={version}/><Button type="submit" fullWidth disabled={pending}>{pending ? "Saving…" : label}</Button>{state.message && !state.ok && <small className="form-error" role="alert">{state.message}</small>}</form>;
}

function PersistentActionModal({ actionName, lead, members, transitions,referralOptions, onClose }: { actionName: Exclude<Action,"convert"|null>; lead: LeadOperationsSnapshot["leads"][number]; members: LeadOperationsSnapshot["memberships"]; transitions: string[];referralOptions:ReferralOption[]; onClose: () => void }) {
  const [state, action, pending] = useActionState(runLeadAction, { ok:false, message:"" }); const router = useRouter(); const [commandId] = useState(() => crypto.randomUUID());
  useEffect(() => { if (state.ok) { onClose(); router.refresh(); } }, [state.ok, onClose, router]);
  const titles = { assign:"Assign owner",transition:"Change stage",contact:"Log contact attempt",note:"Add note",task:"Create follow-up task",appointment:"Book discovery appointment",referral:"Set referral attribution" };
  return <Modal title={titles[actionName]} onClose={onClose}><form action={action} className="form-grid single"><input type="hidden" name="operation" value={actionName}/><input type="hidden" name="commandId" value={commandId}/><input type="hidden" name="leadId" value={lead.id}/><input type="hidden" name="expectedVersion" value={lead.version}/>
    {actionName === "assign" && <Select name="owner" label="Owner" options={members.map(member => ({value:member.id,label:member.displayName}))}/>} 
    {actionName === "transition" && <><Select name="status" label="New stage" options={transitions.map(value => ({value,label:value}))}/><TextArea name="note" label="Transition note (optional)"/></>}
    {actionName === "contact" && <><p className="form-guidance">Record an external action. Broker Growth Desk will not place a call or send an email or SMS.</p><Select name="channel" label="Channel" options={contactChannels.map(value => ({value,label:value}))}/><Select name="outcome" label="Outcome" options={contactOutcomes.map(value => ({value,label:value}))}/><TextArea name="note" label="Note (optional)"/><TextField name="nextActionAt" label="Next-action date and time (optional)" type="datetime-local"/></>}
    {actionName === "note" && <TextArea name="note" label="Note" required/>}
    {actionName === "task" && <><input type="hidden" name="owner" value={lead.ownerMembershipId ?? members[0]?.id}/><TextField name="title" label="Task title" required/><TextField name="dueAt" label="Due date and time" type="datetime-local" required/><Select name="priority" label="Priority" options={["High","Normal","Low"].map(value => ({value,label:value}))}/></>}
    {actionName === "appointment" && <><Select name="owner" label="Assigned member" options={members.map(member => ({value:member.id,label:member.displayName}))}/><TextField name="startsAt" label="Starts at" type="datetime-local" required/><Select name="duration" label="Duration" options={[{value:"30",label:"30 minutes"},{value:"45",label:"45 minutes"},{value:"60",label:"60 minutes"}]}/><Select name="method" label="Meeting method" options={["Phone","Video","In person"].map(value => ({value,label:value}))}/><TextField name="location" label="Location or link (optional)"/><TextArea name="note" label="Appointment notes"/></>}
    {actionName==="referral"&&<><Select name="referralPartnerId" label="Referral attribution" defaultValue={lead.referralPartnerStatus==="Active"?lead.referralPartnerId??"":""} options={[{value:"",label:"Direct / none"},...referralOptions.map(item=>({value:item.id,label:item.organisationName?`${item.name} · ${item.organisationName}`:item.name}))]}/>{lead.referralPartnerStatus==="Inactive"&&<p className="legal-note">The existing attribution to {lead.referralPartnerName} is inactive and remains in history. Choose an active partner or Direct / none.</p>}<p className="form-guidance">Attribution is an operational record and does not prove causation.</p></>}
    {state.message && !state.ok && <p className="form-error" role="alert">{state.message}</p>}<div className="form-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" disabled={pending}>{pending ? "Saving…" : actionName === "appointment" ? "Book appointment" : "Save"}</Button></div></form></Modal>;
}
