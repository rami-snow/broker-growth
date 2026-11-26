import type { ActivityEvent } from "@/platform/audit/models";
import type { Appointment } from "@/platform/appointments/models";
import type { Task } from "@/platform/tasks/models";
import type { MortgageLead } from "@/verticals/mortgage/leads/models";
import { FIRST_RESPONSE_TARGET_MINUTES, firstContactAttemptAt, formatDuration, leadResponseState, medianMinutes } from "@/verticals/mortgage/leads/response";
import type { BadgeTone } from "@/components/ui";

export const TIME_ZONE = "Australia/Sydney";

/** Review opportunity row common to fixture and Supabase snapshots. */
export interface TodayReview { id: string; householdId: string; householdName: string; type: string; triggerDate: string; status: string; ownerName?: string }
export interface TodayInputs {
  now: Date;
  userName: string;
  leads: MortgageLead[];
  memberships: Array<{ id: string; displayName: string }>;
  tasks: Task[];
  appointments: Appointment[];
  activities: Array<Pick<ActivityEvent<string>, "id" | "leadId" | "type" | "occurredAt" | "newStatus" | "summary" | "actorMembershipId"> & { subjectReference?: { type: string; id: string } }>;
  reviews: TodayReview[];
  householdNames?: Record<string, string>;
}
export type TodayIcon = "phone" | "user" | "mail" | "calendar" | "clock" | "video";
export interface TodayAction { label: string; href: string; primary?: boolean }
export interface NeedsActionItem { id: string; icon: TodayIcon; title: string; badge: { label: string; tone: BadgeTone }; text: string; actions: TodayAction[] }
export interface PriorityItem { id: string; icon: TodayIcon; title: string; detail: string; ownerName?: string; status: { label: string; tone: BadgeTone }; href: string; responseDeadline?: number; dueAt: number }

const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-AU", { timeZone: TIME_ZONE, ...options });
export const sydneyDay = (value: Date | string) => fmt({ year: "numeric", month: "2-digit", day: "2-digit" }).format(typeof value === "string" ? new Date(value) : value);
export const formatTime = (value: string) => fmt({ hour: "numeric", minute: "2-digit" }).format(new Date(value)).replace(/\s?(am|pm)/i, " $1").toLowerCase();
export const formatDayMonth = (value: string) => fmt({ day: "numeric", month: "short" }).format(new Date(value.length === 10 ? `${value}T12:00:00+11:00` : value));
export const formatDate = (value: string) => fmt({ day: "numeric", month: "short", year: "numeric" }).format(new Date(value.length === 10 ? `${value}T12:00:00+11:00` : value));
const dueLabel = (value: string, now: Date) => sydneyDay(value) === sydneyDay(now) ? `today ${formatTime(value)}` : `${formatDayMonth(value)} ${formatTime(value)}`;
const fullName = (lead: Pick<MortgageLead, "firstName" | "lastName">) => `${lead.firstName} ${lead.lastName}`;
const isActive = (lead: MortgageLead) => lead.status !== "Closed" && lead.status !== "Converted";
const dateValue = (value: string) => Date.parse(value.length === 10 ? `${value}T09:00:00+11:00` : value);

export function greeting(now: Date, userName: string) {
  const hour = Number(fmt({ hour: "numeric", hourCycle: "h23" }).format(now));
  return `Good ${hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}, ${userName.split(" ")[0]}`;
}

function statusBadge(dueAt: number, now: Date): { label: string; tone: BadgeTone } {
  if (dueAt < now.getTime()) return { label: "Overdue", tone: "danger" };
  if (sydneyDay(new Date(dueAt)) === sydneyDay(now)) return { label: "Today", tone: "info" };
  if (dueAt - now.getTime() < 7 * 86400000) return { label: "Due", tone: "warning" };
  return { label: "Upcoming", tone: "neutral" };
}

export function buildToday(input: TodayInputs) {
  const { now, leads, tasks, appointments, activities, reviews } = input;
  const member = (id?: string) => id ? input.memberships.find(item => item.id === id)?.displayName : undefined;
  const responses = leads.map(lead => ({ lead, state: leadResponseState(lead, activities, now) }));
  const awaiting = responses.filter(item => item.state.kind === "awaiting").sort((a, b) => (a.state.kind === "awaiting" && b.state.kind === "awaiting" ? Date.parse(a.state.dueAt) - Date.parse(b.state.dueAt) : 0));
  const firstResponseMinutes = leads.flatMap(lead => { const first = firstContactAttemptAt(lead, activities); return first ? [(Date.parse(first) - Date.parse(lead.createdAt)) / 60000] : []; });
  const median = medianMinutes(firstResponseMinutes);
  const newLeads = leads.filter(lead => lead.status === "New");
  const today = sydneyDay(now);
  const callsToday = appointments.filter(item => item.status === "Booked" && sydneyDay(item.startsAt) === today).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const openReviews = reviews.filter(item => !["Completed", "Dismissed"].includes(item.status));
  const annualDue = openReviews.filter(item => item.type === "Annual review" && (item.status === "Due" || item.status === "Overdue"));
  const fixed = openReviews.filter(item => item.type === "Fixed-rate expiry").sort((a, b) => a.triggerDate.localeCompare(b.triggerDate));
  const leadById = new Map(leads.map(lead => [lead.id, lead]));
  const nextCall = appointments.filter(item => item.status === "Booked" && Date.parse(item.startsAt) + item.durationMinutes * 60000 >= now.getTime()).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];

  const needsAction: NeedsActionItem[] = [];
  for (const { lead, state } of awaiting) {
    if (state.kind !== "awaiting") continue;
    const waiting = Math.round((now.getTime() - Date.parse(lead.createdAt)) / 60000), overdue = state.minutesUntilDue < 0, owner = member(lead.ownerMembershipId);
    needsAction.push({ id: `respond-${lead.id}`, icon: "phone", title: `Call ${fullName(lead)}`, badge: overdue ? { label: `${formatDuration(waiting)} waiting`, tone: "danger" } : { label: `Due in ${formatDuration(state.minutesUntilDue)}`, tone: "warning" },
      text: `${lead.loanPurpose} enquiry from ${lead.source}. No first response yet${owner ? `. Owned by ${owner}.` : " and no owner assigned."}`,
      actions: owner ? [{ label: "Add note", href: `/leads/${lead.id}?action=note` }, { label: "Open lead", href: `/leads/${lead.id}`, primary: true }] : [{ label: "Assign owner", href: `/leads/${lead.id}?action=assign` }, { label: "Open lead", href: `/leads/${lead.id}`, primary: true }] });
  }
  for (const lead of leads.filter(item => isActive(item) && !item.ownerMembershipId && !awaiting.some(entry => entry.lead.id === item.id))) {
    const days = Math.max(0, Math.floor((now.getTime() - Date.parse(lead.updatedAt)) / 86400000));
    needsAction.push({ id: `assign-${lead.id}`, icon: "user", title: `Assign ${fullName(lead)}`, badge: { label: days ? `Unassigned ${days} ${days === 1 ? "day" : "days"}` : "Needs owner", tone: "warning" }, text: `${lead.loanPurpose} lead in ${lead.status}. No owner is responsible for the next step.`, actions: [{ label: "Open lead", href: `/leads/${lead.id}` }, { label: "Assign", href: `/leads/${lead.id}?action=assign`, primary: true }] });
  }
  for (const review of annualDue.sort((a, b) => a.triggerDate.localeCompare(b.triggerDate))) {
    const overdue = review.status === "Overdue";
    needsAction.push({ id: `review-${review.id}`, icon: "mail", title: `Annual review due: ${review.householdName}`, badge: { label: `Review due ${formatDayMonth(review.triggerDate)}`, tone: overdue ? "danger" : "warning" }, text: `Annual review ${overdue ? "was" : "is"} due ${formatDayMonth(review.triggerDate)}. ${review.ownerName ? `Assigned to ${review.ownerName}.` : "No owner assigned."}`, actions: [{ label: "Add note", href: `/client-book/${review.householdId}?action=note` }, { label: "Open client", href: `/client-book/${review.householdId}`, primary: true }] });
  }
  for (const review of fixed.filter(item => (item.status === "Due" || item.status === "Overdue"))) {
    needsAction.push({ id: `fixed-${review.id}`, icon: "calendar", title: `Fixed-rate expiry: ${review.householdName}`, badge: { label: `Expires ${formatDayMonth(review.triggerDate)}`, tone: review.status === "Overdue" ? "danger" : "warning" }, text: `Fixed rate ends ${formatDayMonth(review.triggerDate)}. ${review.ownerName ? `Assigned to ${review.ownerName}, no` : "No owner and no"} review call booked yet.`, actions: [{ label: "Add note", href: `/client-book/${review.householdId}?action=note` }, { label: "Open household", href: `/client-book/${review.householdId}`, primary: true }] });
  }

  const priorities: PriorityItem[] = [];
  for (const { lead, state } of awaiting) if (state.kind === "awaiting") { const due = Date.parse(state.dueAt); priorities.push({ id: `p-respond-${lead.id}`, icon: "clock", title: `${fullName(lead)}: first response ${due < now.getTime() ? "overdue" : "due"}`, detail: `${lead.source}, ${lead.loanPurpose.toLowerCase()}`, ownerName: member(lead.ownerMembershipId), status: statusBadge(due, now), href: `/leads/${lead.id}`, responseDeadline: due, dueAt: due }); }
  for (const task of tasks.filter(item => item.status === "Open" && item.leadId)) { const lead = leadById.get(task.leadId!); if (!lead || !isActive(lead)) continue; const due = Date.parse(task.dueAt); priorities.push({ id: `p-task-${task.id}`, icon: lead.status === "Nurture" ? "clock" : "phone", title: task.title, detail: `${fullName(lead)}, due ${dueLabel(task.dueAt, now)}`, ownerName: member(lead.ownerMembershipId), status: statusBadge(due, now), href: `/leads/${lead.id}`, dueAt: due }); }
  for (const item of appointments.filter(entry => entry.status === "Booked" && Date.parse(entry.startsAt) >= now.getTime() - 3600000)) { const lead = leadById.get(item.leadId); if (!lead) continue; const due = Date.parse(item.startsAt); priorities.push({ id: `p-apt-${item.id}`, icon: item.meetingMethod === "Video" ? "video" : item.meetingMethod === "Phone" ? "phone" : "calendar", title: `Discovery call with ${fullName(lead)}`, detail: `${lead.loanPurpose}, ${item.meetingMethod.toLowerCase()}, ${dueLabel(item.startsAt, now)}`, ownerName: member(item.assignedMembershipId), status: statusBadge(due, now), href: `/leads/${lead.id}`, dueAt: due }); }
  for (const lead of leads.filter(item => item.status === "Nurture" && item.nextActionAt && !tasks.some(task => task.leadId === item.id && task.status === "Open"))) { const due = Date.parse(lead.nextActionAt!); if (due - now.getTime() > 7 * 86400000) continue; priorities.push({ id: `p-nurture-${lead.id}`, icon: "clock", title: `Nurture follow-up for ${fullName(lead)}`, detail: `${lead.loanPurpose}, due ${dueLabel(lead.nextActionAt!, now)}`, ownerName: member(lead.ownerMembershipId), status: statusBadge(due, now), href: `/leads/${lead.id}`, dueAt: due }); }
  for (const review of openReviews.filter(item => item.type === "Annual review" && item.status !== "Upcoming")) { const due = dateValue(review.triggerDate); priorities.push({ id: `p-review-${review.id}`, icon: "calendar", title: `${review.householdName} annual review`, detail: `Due ${formatDayMonth(review.triggerDate)}`, ownerName: review.ownerName, status: review.status === "Overdue" ? { label: "Overdue", tone: "danger" } : review.status === "Review booked" ? { label: "Booked", tone: "info" } : { label: "Due", tone: "warning" }, href: `/client-book/${review.householdId}`, dueAt: due }); }
  priorities.sort(comparePriorities);

  const recentActivity = [...activities].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 5).map(event => {
    const lead = event.leadId ? leadById.get(event.leadId as MortgageLead["id"]) : undefined;
    const subject = lead ? fullName(lead) : event.subjectReference ? input.householdNames?.[event.subjectReference.id] : undefined;
    const actor = member(event.actorMembershipId);
    return { id: event.id, time: sydneyDay(event.occurredAt) === today ? formatTime(event.occurredAt) : formatDayMonth(event.occurredAt), text: `${subject ? `${subject}: ` : ""}${event.summary}${actor ? ` (${actor})` : ""}` };
  });

  const followUps = priorities.filter(item => !item.responseDeadline && item.dueAt <= endOfDay(now)).length;
  const nextCallLead = nextCall ? leadById.get(nextCall.leadId) : undefined;
  return {
    greeting: greeting(now, input.userName),
    summary: `${fmt({ weekday: "long", day: "numeric", month: "long" }).format(now).replace(",", "")}. ${newLeads.length} new ${newLeads.length === 1 ? "lead" : "leads"} and ${followUps} ${followUps === 1 ? "follow-up" : "follow-ups"} need action today.`,
    metrics: {
      medianFirstResponse: median === null ? null : { label: formatDuration(median, true), overTarget: median > FIRST_RESPONSE_TARGET_MINUTES },
      newLeads: { count: newLeads.length, unassigned: newLeads.filter(lead => !lead.ownerMembershipId).length },
      discoveryToday: { count: callsToday.length, next: callsToday.find(item => Date.parse(item.startsAt) >= now.getTime()) ?? callsToday[0], nextName: (() => { const call = callsToday.find(item => Date.parse(item.startsAt) >= now.getTime()) ?? callsToday[0]; const lead = call ? leadById.get(call.leadId) : undefined; return lead ? fullName(lead) : undefined; })() },
      reviewsDue: { count: annualDue.length, fixedIn90: fixed.length },
    },
    needsAction,
    priorities: priorities.slice(0, 8),
    recentActivity,
    nextCall: nextCall && nextCallLead ? { when: `${sydneyDay(nextCall.startsAt) === today ? "Today" : formatDayMonth(nextCall.startsAt)}, ${formatTime(nextCall.startsAt)}, ${nextCall.meetingMethod === "In person" ? "in person" : `${nextCall.meetingMethod.toLowerCase()} call`}`, title: `Discovery call with ${fullName(nextCallLead)}`, text: `${nextCallLead.loanPurpose} lead from ${nextCallLead.source}. Owned by ${member(nextCall.assignedMembershipId) ?? "no one yet"}.`, href: `/leads/${nextCallLead.id}` } : undefined,
    fixedExpiries: fixed.slice(0, 5).map(item => ({ id: item.id, householdId: item.householdId, name: item.householdName, detail: `Ends ${formatDate(item.triggerDate)}, ${item.ownerName ?? "Unassigned"}`, status: item.status === "Review booked" ? { label: "Call booked", tone: "info" as BadgeTone } : { label: "Not started", tone: "neutral" as BadgeTone } })),
  };
}

/** Brief §6.1: priorities sort by response deadline first, then by due date. */
export function comparePriorities(a: Pick<PriorityItem, "responseDeadline" | "dueAt">, b: Pick<PriorityItem, "responseDeadline" | "dueAt">) {
  if (a.responseDeadline !== undefined && b.responseDeadline !== undefined) return a.responseDeadline - b.responseDeadline;
  if (a.responseDeadline !== undefined) return -1;
  if (b.responseDeadline !== undefined) return 1;
  return a.dueAt - b.dueAt;
}
const endOfDay = (now: Date) => Date.parse(`${sydneyDay(now).split("/").reverse().join("-")}T23:59:59+11:00`);
export type TodayModel = ReturnType<typeof buildToday>;
