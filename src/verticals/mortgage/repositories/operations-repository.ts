import { DEFAULT_ORGANISATION_TIME_ZONE } from "@/platform/time/zoned";
import { contactChannels, contactOutcomes, type ActivityEvent, type ContactAttemptInput } from "@/platform/audit/models";
import type { Appointment, NewAppointmentInput } from "@/platform/appointments/models";
import type { MembershipId, TenantContext } from "@/platform/core/models";
import type { LeadId } from "@/platform/leads/models";
import type { NewTaskInput, Task } from "@/platform/tasks/models";
import { canAssignLead, canAssignTo, canClaimLead, canUpdateLead, hasCapability } from "@/verticals/mortgage/permissions";
import type { MortgageOrganisationMembership } from "@/verticals/mortgage/brokerage/models";
import type { MortgageLead, MortgageLeadStatus, NewMortgageLeadInput } from "@/verticals/mortgage/leads/models";
import { assertLeadTransition } from "@/verticals/mortgage/leads/workflow";
import type { FixtureState } from "@/verticals/mortgage/fixtures";

const id = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export class InMemoryOperationsRepository {
  constructor(private state: FixtureState, private now: () => Date = () => new Date()) {}
  snapshot() { return this.state; }
  private membership(context: TenantContext) {
    const membership = this.state.memberships.find(m => m.userId === context.userId && m.organisationId === context.organisationId);
    if (!membership) throw new Error("No active membership for this brokerage");
    return membership;
  }
  getMembership(context: TenantContext) { return this.membership(context); }
  listMemberships(context: TenantContext) { this.membership(context); return this.state.memberships.filter(m => m.organisationId === context.organisationId); }
  listLeads(context: TenantContext) { const actor = this.membership(context); if (!hasCapability(actor, "lead.view")) throw new Error("Lead access denied"); return this.state.leads.filter(l => l.organisationId === context.organisationId); }
  getLead(context: TenantContext, leadId: LeadId) { const lead = this.listLeads(context).find(l => l.id === leadId); if (!lead) throw new Error("Lead unavailable in this brokerage context"); return lead; }
  listTasks(context: TenantContext, leadId?: LeadId) { this.membership(context); return this.state.tasks.filter(t => t.organisationId === context.organisationId && (!leadId || t.leadId === leadId)); }
  listAppointments(context: TenantContext, leadId?: LeadId) { this.membership(context); return this.state.appointments.filter(a => a.organisationId === context.organisationId && (!leadId || a.leadId === leadId)); }
  listActivity(context: TenantContext, leadId: LeadId) { this.getLead(context, leadId); return this.state.activities.filter(e => e.organisationId === context.organisationId && e.leadId === leadId).sort((a,b) => b.occurredAt.localeCompare(a.occurredAt)); }
  appendActivity(context: TenantContext, event: Omit<ActivityEvent, "id" | "organisationId" | "actorMembershipId" | "occurredAt">) {
    const actor = this.membership(context);
    const activity = { ...event, id: id("evt"), organisationId: context.organisationId, actorMembershipId: actor.id, actorType: "person", occurredAt: this.now().toISOString() } as ActivityEvent;
    this.state.activities.push(activity); return activity;
  }
  createLead(context: TenantContext, input: NewMortgageLeadInput) {
    const actor = this.membership(context); if (!hasCapability(actor, "lead.create")) throw new Error("Lead creation denied");
    if (!input.firstName.trim() || !input.lastName.trim() || !/^\S+@\S+\.\S+$/.test(input.email) || input.phone.replace(/\D/g, "").length < 8) throw new Error("Enter a valid name, email and phone number");
    if (input.ownerMembershipId && !canAssignTo(actor, input.ownerMembershipId, this.state.memberships)) throw new Error("Assignment denied");
    const now = this.now().toISOString();
    const lead: MortgageLead = { ...input, id: id("lead") as LeadId, organisationId: context.organisationId, status: "New", consentSummary: { email: "Not recorded", sms: "Not recorded", phone: "Not recorded", source: "Manual entry", recordedAt: now }, createdAt: now, updatedAt: now, version: 1 };
    this.state.leads.unshift(lead); this.appendActivity(context, { leadId: lead.id, type: "lead.created", summary: "Lead created manually" }); return lead;
  }
  assignLead(context: TenantContext, leadId: LeadId, targetId: MembershipId) {
    const actor = this.membership(context), lead = this.getLead(context, leadId);
    if (!canAssignLead(actor, lead) || !canAssignTo(actor, targetId, this.state.memberships)) throw new Error("Lead assignment denied");
    lead.ownerMembershipId = targetId; this.touch(lead); this.appendActivity(context, { leadId, type: "lead.assigned", summary: `Lead assigned to ${this.state.memberships.find(m => m.id === targetId)?.displayName}` }); return lead;
  }
  claimLead(context: TenantContext, leadId: LeadId) {
    const actor = this.membership(context), lead = this.getLead(context, leadId); if (!canClaimLead(actor, lead)) throw new Error("Lead claim denied");
    lead.ownerMembershipId = actor.id; this.touch(lead); this.appendActivity(context, { leadId, type: "lead.claimed", summary: `${actor.displayName} claimed the lead` }); return lead;
  }
  transitionLead(context: TenantContext, leadId: LeadId, next: MortgageLeadStatus, note?: string) {
    const actor = this.membership(context), lead = this.getLead(context, leadId); if (!canUpdateLead(actor, lead)) throw new Error("Lead update denied");
    const old = lead.status; assertLeadTransition(old, next); lead.status = next; this.touch(lead);
    this.appendActivity(context, { leadId, type: "lead.status_changed", summary: `Status changed from ${old} to ${next}`, oldStatus: old, newStatus: next, note }); return lead;
  }
  recordContactAttempt(context: TenantContext, leadId: LeadId, input: ContactAttemptInput) {
    const lead = this.getLead(context, leadId);
    if (!contactChannels.includes(input.channel) || !contactOutcomes.includes(input.outcome)) throw new Error("A valid contact channel and outcome are required");
    if (input.nextActionAt && !Number.isFinite(Date.parse(input.nextActionAt))) throw new Error("Enter a valid next-action date and time");
    if (lead.status === "New" || lead.status === "Nurture") this.transitionLead(context, leadId, "Contact attempted");
    else { const actor = this.membership(context); if (!canUpdateLead(actor, lead)) throw new Error("Lead update denied"); }
    this.appendActivity(context, { leadId, type: "contact.attempted", summary: "Contact attempt recorded", contactChannel: input.channel, contactOutcome: input.outcome, note: input.note?.trim() || undefined, nextActionAt: input.nextActionAt });
    if (input.nextActionAt) {
      lead.nextActionAt = input.nextActionAt;
      this.touch(lead);
      this.appendActivity(context, { leadId, type: "lead.next_action_changed", summary: `Next action set for ${new Date(input.nextActionAt).toLocaleString("en-AU", { timeZone: DEFAULT_ORGANISATION_TIME_ZONE })}`, nextActionAt: input.nextActionAt });
    }
    return lead;
  }
  addNote(context: TenantContext, leadId: LeadId, note: string) { const actor = this.membership(context), lead = this.getLead(context, leadId); if (!canUpdateLead(actor, lead) || !note.trim()) throw new Error("A note is required"); return this.appendActivity(context, { leadId, type: "note.added", summary: "Note added", note: note.trim() }); }
  createTask(context: TenantContext, input: NewTaskInput) {
    const actor = this.membership(context); this.getLead(context, input.leadId); if (!hasCapability(actor, "task.create")) throw new Error("Task creation denied");
    if (!input.title.trim() || !input.dueAt) throw new Error("Task title and due date are required");
    const task: Task = { ...input, id: id("task") as Task["id"], organisationId: context.organisationId, status: "Open", version: 1, createdBy: actor.id, createdAt: this.now().toISOString() };
    this.state.tasks.push(task); this.appendActivity(context, { leadId: input.leadId, type: "task.created", summary: `Follow-up task created: ${input.title}` }); return task;
  }
  createAppointment(context: TenantContext, input: NewAppointmentInput) {
    const actor = this.membership(context), lead = this.getLead(context, input.leadId); if (!hasCapability(actor, "appointment.create") || !canUpdateLead(actor, lead)) throw new Error("Appointment creation denied");
    if (!input.startsAt || input.durationMinutes < 15) throw new Error("A valid appointment time and duration are required");
    assertLeadTransition(lead.status, "Discovery booked");
    const appointment: Appointment = { ...input, id: id("apt") as Appointment["id"], organisationId: context.organisationId, status: "Booked" };
    this.state.appointments.push(appointment); this.transitionLead(context, lead.id, "Discovery booked", "Discovery appointment booked");
    this.appendActivity(context, { leadId: lead.id, type: "appointment.created", summary: `Discovery appointment booked for ${new Date(input.startsAt).toLocaleString("en-AU", { timeZone: DEFAULT_ORGANISATION_TIME_ZONE })}` }); return appointment;
  }
  private touch(lead: MortgageLead) { lead.updatedAt = this.now().toISOString(); lead.version += 1; }
}

export const isActiveLead = (lead: MortgageLead) => lead.status !== "Closed" && lead.status !== "Converted";
export const isActiveUnassignedLead = (lead: MortgageLead) => isActiveLead(lead) && !lead.ownerMembershipId;

export function calculateFirstResponseMinutes(leads: MortgageLead[], activities: ActivityEvent<string>[]) {
  return leads.flatMap(lead => {
    const explicit = activities.filter(event => event.leadId === lead.id && event.type === "contact.attempted");
    const candidates = explicit.length > 0 ? explicit : activities.filter(event => event.leadId === lead.id && event.type === "lead.status_changed" && (event.newStatus === "Contacted" || event.newStatus === "Contact attempted"));
    const createdAt = Date.parse(lead.createdAt);
    if (!Number.isFinite(createdAt)) return [];
    const first = candidates.map(event => Date.parse(event.occurredAt)).filter(occurredAt => Number.isFinite(occurredAt) && occurredAt > createdAt).sort((a,b) => a-b)[0];
    return first === undefined ? [] : [(first - createdAt) / 60000];
  }).sort((a,b) => a-b);
}

export interface TodayMetrics { newLeads: number; medianFirstResponseMinutes: number | null; discoveryBooked: number; activeUnassigned: number; overdueFollowUps: number; }
export function calculateTodayMetrics(repo: InMemoryOperationsRepository, context: TenantContext, now = new Date()): TodayMetrics {
  const leads = repo.listLeads(context), events = repo.snapshot().activities.filter(e => e.organisationId === context.organisationId);
  const responseMinutes = calculateFirstResponseMinutes(leads, events);
  const middle = Math.floor(responseMinutes.length / 2); const median = responseMinutes.length ? (responseMinutes.length % 2 ? responseMinutes[middle] : (responseMinutes[middle-1] + responseMinutes[middle]) / 2) : null;
  return { newLeads: leads.filter(l => l.status === "New").length, medianFirstResponseMinutes: median === null ? null : Math.round(median), discoveryBooked: leads.filter(l => l.status === "Discovery booked").length, activeUnassigned: leads.filter(isActiveUnassignedLead).length, overdueFollowUps: repo.listTasks(context).filter(t => t.leadId && t.status === "Open" && new Date(t.dueAt) < now).length };
}

export const membershipName = (memberships: MortgageOrganisationMembership[], id?: MembershipId) => id ? memberships.find(m => m.id === id)?.displayName ?? "Unknown" : "Unassigned";
