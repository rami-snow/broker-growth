"use client";

import { zonedLocalToIso } from "@/platform/time/zoned";
import Link from "next/link";
import { useState } from "react";
import { Check } from "lucide-react";
import { Button, Select, TextArea, TextField } from "@/components/ui";
import { Modal } from "@/components/modal";
import { usePrototype } from "@/components/prototype-provider";
import { canClaimLead, canUpdateLead, hasCapability } from "@/verticals/mortgage/permissions";
import { contactChannels, contactOutcomes, type ContactChannel, type ContactOutcome } from "@/platform/audit/models";
import type { MembershipId } from "@/platform/core/models";
import type { LeadId } from "@/platform/leads/models";
import type { MortgageLeadStatus } from "@/verticals/mortgage/leads/models";
import { allowedTransitions, canTransitionLead } from "@/verticals/mortgage/leads/workflow";
import { LeadDetailView } from "./lead-detail-view";
import { LeadConversionModal } from "@/features/clients/lead-conversion-modal";

type Action = "assign" | "status" | "contact" | "note" | "task" | "appointment" | "convert" | null;
export function LeadDetail({ leadId }: { leadId: string }) {
  const { repo, context, now, revision, mutate } = usePrototype(); void revision;
  const [action,setAction] = useState<Action>(null), [message,setMessage] = useState(""), [error,setError] = useState("");
  let lead; try { lead = repo.getLead(context, leadId as LeadId); } catch { return <section className="surface inaccessible"><h1>Lead unavailable</h1><p>This lead does not belong to the active brokerage, or the active user has no matching membership.</p><Link className="ui-button ui-button--secondary" href="/leads">Return to leads</Link></section>; }
  const membership = repo.getMembership(context), members = repo.listMemberships(context), tasks = repo.listTasks(context, lead.id), appointments = repo.listAppointments(context, lead.id), activity = repo.listActivity(context, lead.id);
  const updateAllowed = canUpdateLead(membership,lead), claimAllowed = canClaimLead(membership,lead), assignAllowed = hasCapability(membership,"lead.assign"), bookingAllowed = updateAllowed && hasCapability(membership,"appointment.create") && canTransitionLead(lead.status,"Discovery booked");
  const run = (operation: () => unknown, success: string) => { try { mutate(operation); setAction(null); setError(""); setMessage(success); window.setTimeout(() => setMessage(""),2400); } catch (cause) { setError(cause instanceof Error ? cause.message : "Action failed"); } };
  const transitions = allowedTransitions(lead.status).filter(item => item !== "Discovery booked");
  const active = lead.status !== "Closed" && lead.status !== "Converted";
  const workload = members.filter(member => member.mortgageProfile.position === "Broker").map(member => ({ name: member.displayName, open: repo.listLeads(context).filter(item => item.ownerMembershipId === member.id && item.status !== "Closed" && item.status !== "Converted").length }));
  const reopen = lead.status === "Closed" && updateAllowed ? <Button onClick={() => run(() => repo.transitionLead(context,lead.id,"Nurture","Lead deliberately reopened"),"Lead reopened into nurture")}>Reopen lead</Button> : undefined;
  return <>
    <LeadDetailView lead={lead} memberships={members} tasks={tasks} appointments={appointments} activities={activity} now={now()} legalNote="Display only. These fixture records are not a complete legal determination of whether outreach is permitted."
      permissions={{ canUpdate: updateAllowed, canAssign: assignAllowed, canChangeStage: updateAllowed && lead.status !== "Closed" && transitions.length > 0, canContact: updateAllowed && active, canTask: updateAllowed && hasCapability(membership,"task.create"), canBook: bookingAllowed, canConvert: lead.status === "Discovery booked" && updateAllowed && hasCapability(membership,"mortgage.household.create") }}
      onAction={next => { if (next !== "referral") setAction(next); }} onAddNote={note => { try { mutate(() => repo.addNote(context, lead.id, note)); setMessage("Note added"); window.setTimeout(() => setMessage(""), 2400); return undefined; } catch (cause) { return cause instanceof Error ? cause.message : "Unable to add note"; } }}
      claimControl={claimAllowed ? <Button size="small" variant="secondary" onClick={() => run(() => repo.claimLead(context,lead.id),"Lead claimed")}>Claim lead</Button> : undefined}
      reopenControl={reopen} workload={workload}/>
    {message && <div className="toast"><Check/>{message}</div>}{action==="convert"&&<LeadConversionModal leadId={lead.id} onClose={()=>setAction(null)} onConverted={()=>{setAction(null);setMessage("Lead converted to a client household");}}/>}{action && action!=="convert" && <ActionModal action={action} leadId={lead.id} members={members} error={error} onClose={() => { setAction(null); setError(""); }} onSubmit={(data) => {
      if (action === "assign") run(() => repo.assignLead(context,lead.id,data.owner as MembershipId),"Owner assigned");
      if (action === "status") run(() => repo.transitionLead(context,lead.id,data.status as MortgageLeadStatus,data.note),"Status updated");
      if (action === "contact") run(() => repo.recordContactAttempt(context,lead.id,{ channel:data.channel as ContactChannel, outcome:data.outcome as ContactOutcome, note:data.note, nextActionAt:data.nextActionAt ? zonedLocalToIso(data.nextActionAt) : undefined }),"Contact attempt recorded");
      if (action === "note") run(() => repo.addNote(context,lead.id,data.note),"Note added");
      if (action === "task") run(() => repo.createTask(context,{ leadId:lead.id, assignedMembershipId:(lead.ownerMembershipId ?? membership.id), title:data.title, dueAt:zonedLocalToIso(data.dueAt), priority:data.priority as "High"|"Normal"|"Low" }),"Follow-up task created");
      if (action === "appointment") run(() => repo.createAppointment(context,{ leadId:lead.id, assignedMembershipId:data.owner as MembershipId, startsAt:zonedLocalToIso(data.startsAt), durationMinutes:Number(data.duration), meetingMethod:data.method as "Phone"|"Video"|"In person", locationOrLink:data.location, notes:data.note }),"Discovery appointment booked");
    }} transitions={transitions}/>}</>;
}

function ActionModal({ action, leadId, members, transitions, error, onClose, onSubmit }: { action: Exclude<Action,null|"convert">; leadId: LeadId; members: ReturnType<ReturnType<typeof usePrototype>["repo"]["listMemberships"]>; transitions: MortgageLeadStatus[]; error: string; onClose: () => void; onSubmit: (data: Record<string,string>) => void }) {
  const titles = { assign:"Assign owner", status:"Change stage", contact:"Log contact attempt", note:"Add note", task:"Create follow-up task", appointment:"Book discovery appointment" };
  const submit = (formData: FormData) => onSubmit(Object.fromEntries(formData.entries()) as Record<string,string>);
  const brokers = members.filter(member => member.mortgageProfile.position === "Broker"); void leadId;
  return <Modal title={titles[action]} onClose={onClose}><form action={submit} className="form-grid single">
    {action === "assign" && <Select name="owner" label="Broker" options={brokers.map(member => ({value:member.id,label:member.displayName}))}/>} 
    {action === "status" && <><Select name="status" label="New stage" options={transitions.map(value => ({value,label:value}))}/><TextArea name="note" label="Transition note (optional)"/></>}
    {action === "contact" && <><p className="form-guidance">Record an external contact action. Broker Growth Desk will not place a call or send an email or SMS.</p><Select name="channel" label="Channel" options={contactChannels.map(value => ({value,label:value}))}/><Select name="outcome" label="Outcome" options={contactOutcomes.map(value => ({value,label:value}))}/><TextArea name="note" label="Note (optional)"/><TextField name="nextActionAt" label="Next-action date and time (optional)" type="datetime-local"/></>}
    {action === "note" && <TextArea name="note" label="Note" required/>}
    {action === "task" && <><TextField name="title" label="Task title" required/><TextField name="dueAt" label="Due date and time" type="datetime-local" required/><Select name="priority" label="Priority" options={["High","Normal","Low"].map(value => ({value,label:value}))}/></>}
    {action === "appointment" && <><Select name="owner" label="Assigned broker" options={brokers.map(member => ({value:member.id,label:member.displayName}))}/><TextField name="startsAt" label="Starts at" type="datetime-local" required/><Select name="duration" label="Duration" options={[{value:"30",label:"30 minutes"},{value:"45",label:"45 minutes"},{value:"60",label:"60 minutes"}]}/><Select name="method" label="Meeting method" options={["Phone","Video","In person"].map(value => ({value,label:value}))}/><TextField name="location" label="Location or link (optional)"/><TextArea name="note" label="Appointment notes"/></>}
    {error && <p className="form-error" role="alert">{error}</p>}<div className="form-actions"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit">{action === "appointment" ? "Book appointment" : "Save"}</Button></div>
  </form></Modal>;
}
