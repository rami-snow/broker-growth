import { DEFAULT_ORGANISATION_TIME_ZONE, zonedLocalToIso } from "@/platform/time/zoned";
import type { ActivityEvent } from "@/platform/audit/models";
import type { Appointment } from "@/platform/appointments/models";
import type { Task } from "@/platform/tasks/models";
import type { MortgageLead } from "@/verticals/mortgage/leads/models";
import { FIRST_RESPONSE_TARGET_MINUTES, firstContactAttemptAt, formatDuration, leadResponseState, medianMinutes } from "@/verticals/mortgage/leads/response";
import type { BadgeTone } from "@/components/ui";


/** Review opportunity row common to fixture and Supabase snapshots. */
export interface TodayReview { id: string; householdId: string; householdName: string; type: string; triggerDate: string; status: string; ownerName?: string }
export interface TodayInputs {
  now: Date;
  /** Brokerage time zone; defaults to the organisation default. */
  timeZone?: string;
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
export type NeedsActionKind = "first-response" | "unassigned" | "annual-review" | "fixed-rate";
export const needsActionKinds: Array<{ value: NeedsActionKind; label: string }> = [{ value: "first-response", label: "First response" }, { value: "unassigned", label: "Unassigned" }, { value: "annual-review", label: "Annual review" }, { value: "fixed-rate", label: "Fixed-rate expiry" }];
export interface NeedsActionItem { id: string; kind: NeedsActionKind; icon: TodayIcon; title: string; badge: { label: string; tone: BadgeTone }; text: string; actions: TodayAction[]; responseDeadline?: number; dueAt: number }
/** Today shows the most urgent items only; the card states how many more there are. */
export const NEEDS_ACTION_LIMIT = 5;
export interface PriorityItem { id: string; icon: TodayIcon; title: string; detail: string; ownerName?: string; status: { label: string; tone: BadgeTone }; href: string; responseDeadline?: number; dueAt: number }

const fmt = (options: Intl.DateTimeFormatOptions, timeZone: string) => new Intl.DateTimeFormat("en-AU", { timeZone, ...options });
const isDateOnly = (value: string) => value.length === 10;
/** Calendar-day key in the brokerage zone, for "is this today" comparisons. */
export const dayKey = (value: Date | string, timeZone = DEFAULT_ORGANISATION_TIME_ZONE) => fmt({ year: "numeric", month: "2-digit", day: "2-digit" }, timeZone).format(typeof value === "string" ? new Date(value) : value);
export const formatTime = (value: string, timeZone = DEFAULT_ORGANISATION_TIME_ZONE) => fmt({ hour: "numeric", minute: "2-digit" }, timeZone).format(new Date(value)).replace(/\s?(am|pm)/i, " $1").toLowerCase();
/** Date-only values (YYYY-MM-DD) are calendar dates, so they are never shifted by a zone. */
export const formatDayMonth = (value: string, timeZone = DEFAULT_ORGANISATION_TIME_ZONE) => isDateOnly(value) ? fmt({ day: "numeric", month: "short" }, "UTC").format(new Date(`${value}T12:00:00Z`)) : fmt({ day: "numeric", month: "short" }, timeZone).format(new Date(value));
export const formatDate = (value: string, timeZone = DEFAULT_ORGANISATION_TIME_ZONE) => isDateOnly(value) ? fmt({ day: "numeric", month: "short", year: "numeric" }, "UTC").format(new Date(`${value}T12:00:00Z`)) : fmt({ day: "numeric", month: "short", year: "numeric" }, timeZone).format(new Date(value));
const dueLabel = (value: string, now: Date, tz: string) => dayKey(value, tz) === dayKey(now, tz) ? `today ${formatTime(value, tz)}` : `${formatDayMonth(value, tz)} ${formatTime(value, tz)}`;
const fullName = (lead: Pick<MortgageLead, "firstName" | "lastName">) => `${lead.firstName} ${lead.lastName}`;
const isActive = (lead: MortgageLead) => lead.status !== "Closed" && lead.status !== "Converted";
const dateValue = (value: string, tz: string) => isDateOnly(value) ? Date.parse(zonedLocalToIso(`${value}T09:00`, tz)) : Date.parse(value);

export function greeting(now: Date, userName: string, timeZone = DEFAULT_ORGANISATION_TIME_ZONE) {
  const hour = Number(fmt({ hour: "numeric", hourCycle: "h23" }, timeZone).format(now));
  return `Good ${hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening"}, ${userName.split(" ")[0]}`;
}

function statusBadge(dueAt: number, now: Date, tz: string): { label: string; tone: BadgeTone } {
  if (dueAt < now.getTime()) return { label: "Overdue", tone: "danger" };
  if (dayKey(new Date(dueAt), tz) === dayKey(now, tz)) return { label: "Today", tone: "info" };
  if (dueAt - now.getTime() < 7 * 86400000) return { label: "Due", tone: "warning" };
  return { label: "Upcoming", tone: "neutral" };
}

export function buildToday(input: TodayInputs) {
  const tz = input.timeZone ?? DEFAULT_ORGANISATION_TIME_ZONE;
  const { now, leads, tasks, appointments, activities, reviews } = input;
  const member = (id?: string) => id ? input.memberships.find(item => item.id === id)?.displayName : undefined;
  const responses = leads.map(lead => ({ lead, state: leadResponseState(lead, activities, now) }));
  const awaiting = responses.filter(item => item.state.kind === "awaiting").sort((a, b) => (a.state.kind === "awaiting" && b.state.kind === "awaiting" ? Date.parse(a.state.dueAt) - Date.parse(b.state.dueAt) : 0));
  const firstResponseMinutes = leads.flatMap(lead => { const first = firstContactAttemptAt(lead, activities); return first ? [(Date.parse(first) - Date.parse(lead.createdAt)) / 60000] : []; });
  const median = medianMinutes(firstResponseMinutes);
  const newLeads = leads.filter(lead => lead.status === "New");
  const today = dayKey(now, tz);
  const callsToday = appointments.filter(item => item.status === "Booked" && dayKey(item.startsAt, tz) === today).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const openReviews = reviews.filter(item => !["Completed", "Dismissed"].includes(item.status));
  const annualDue = openReviews.filter(item => item.type === "Annual review" && (item.status === "Due" || item.status === "Overdue"));
  const fixed = openReviews.filter(item => item.type === "Fixed-rate expiry").sort((a, b) => a.triggerDate.localeCompare(b.triggerDate));
  const leadById = new Map(leads.map(lead => [lead.id, lead]));
  const nextCall = appointments.filter(item => item.status === "Booked" && Date.parse(item.startsAt) + item.durationMinutes * 60000 >= now.getTime()).sort((a, b) => a.startsAt.localeCompare(b.startsAt))[0];

  const needsAction: NeedsActionItem[] = [];
  for (const { lead, state } of awaiting) {
    if (state.kind !== "awaiting") continue;
    const waiting = Math.round((now.getTime() - Date.parse(lead.createdAt)) / 60000), overdue = state.minutesUntilDue < 0, owner = member(lead.ownerMembershipId);
    needsAction.push({ id: `respond-${lead.id}`, kind: "first-response", responseDeadline: Date.parse(state.dueAt), dueAt: Date.parse(state.dueAt), icon: "phone", title: `Call ${fullName(lead)}`, badge: overdue ? { label: `${formatDuration(waiting)} waiting`, tone: "danger" } : { label: `Due in ${formatDuration(state.minutesUntilDue)}`, tone: "warning" },
      text: `${lead.loanPurpose} enquiry from ${lead.source}. No first response yet${owner ? `. Owned by ${owner}.` : " and no owner assigned."}`,
      actions: owner ? [{ label: "Add note", href: `/leads/${lead.id}?action=note` }, { label: "Open lead", href: `/leads/${lead.id}`, primary: true }] : [{ label: "Assign owner", href: `/leads/${lead.id}?action=assign` }, { label: "Open lead", href: `/leads/${lead.id}`, primary: true }] });
  }
  for (const lead of leads.filter(item => isActive(item) && !item.ownerMembershipId && !awaiting.some(entry => entry.lead.id === item.id))) {
    const days = Math.max(0, Math.floor((now.getTime() - Date.parse(lead.updatedAt)) / 86400000));
    needsAction.push({ id: `assign-${lead.id}`, kind: "unassigned", dueAt: Date.parse(lead.nextActionAt ?? lead.createdAt), icon: "user", title: `Assign ${fullName(lead)}`, badge: { label: days ? `Unassigned ${days} ${days === 1 ? "day" : "days"}` : "Needs owner", tone: "warning" }, text: `${lead.loanPurpose} lead in ${lead.status}. No owner is responsible for the next step.`, actions: [{ label: "Open lead", href: `/leads/${lead.id}` }, { label: "Assign", href: `/leads/${lead.id}?action=assign`, primary: true }] });
  }
  for (const review of annualDue.sort((a, b) => a.triggerDate.localeCompare(b.triggerDate))) {
    const overdue = review.status === "Overdue";
    needsAction.push({ id: `review-${review.id}`, kind: "annual-review", dueAt: dateValue(review.triggerDate, tz), icon: "mail", title: `Annual review due: ${review.householdName}`, badge: { label: `Review due ${formatDayMonth(review.triggerDate, tz)}`, tone: overdue ? "danger" : "warning" }, text: `Annual review ${overdue ? "was" : "is"} due ${formatDayMonth(review.triggerDate, tz)}. ${review.ownerName ? `Assigned to ${review.ownerName}.` : "No owner assigned."}`, actions: [{ label: "Add note", href: `/client-book/${review.householdId}?action=note` }, { label: "Open client", href: `/client-book/${review.householdId}`, primary: true }] });
  }
  for (const review of fixed.filter(item => (item.status === "Due" || item.status === "Overdue"))) {
    needsAction.push({ id: `fixed-${review.id}`, kind: "fixed-rate", dueAt: dateValue(review.triggerDate, tz), icon: "calendar", title: `Fixed-rate expiry: ${review.householdName}`, badge: { label: `Expires ${formatDayMonth(review.triggerDate, tz)}`, tone: review.status === "Overdue" ? "danger" : "warning" }, text: `Fixed rate ends ${formatDayMonth(review.triggerDate, tz)}. ${review.ownerName ? `Assigned to ${review.ownerName}, no` : "No owner and no"} review call booked yet.`, actions: [{ label: "Add note", href: `/client-book/${review.householdId}?action=note` }, { label: "Open household", href: `/client-book/${review.householdId}`, primary: true }] });
  }

  const priorities: PriorityItem[] = [];
  for (const { lead, state } of awaiting) if (state.kind === "awaiting") { const due = Date.parse(state.dueAt); priorities.push({ id: `p-respond-${lead.id}`, icon: "clock", title: `${fullName(lead)}: first response ${due < now.getTime() ? "overdue" : "due"}`, detail: `${lead.source}, ${lead.loanPurpose.toLowerCase()}`, ownerName: member(lead.ownerMembershipId), status: statusBadge(due, now, tz), href: `/leads/${lead.id}`, responseDeadline: due, dueAt: due }); }
  for (const task of tasks.filter(item => item.status === "Open" && item.leadId)) { const lead = leadById.get(task.leadId!); if (!lead || !isActive(lead)) continue; const due = Date.parse(task.dueAt); priorities.push({ id: `p-task-${task.id}`, icon: lead.status === "Nurture" ? "clock" : "phone", title: task.title, detail: `${fullName(lead)}, due ${dueLabel(task.dueAt, now, tz)}`, ownerName: member(lead.ownerMembershipId), status: statusBadge(due, now, tz), href: `/leads/${lead.id}`, dueAt: due }); }
  for (const item of appointments.filter(entry => entry.status === "Booked" && Date.parse(entry.startsAt) >= now.getTime() - 3600000)) { const lead = leadById.get(item.leadId); if (!lead) continue; const due = Date.parse(item.startsAt); priorities.push({ id: `p-apt-${item.id}`, icon: item.meetingMethod === "Video" ? "video" : item.meetingMethod === "Phone" ? "phone" : "calendar", title: `Discovery call with ${fullName(lead)}`, detail: `${lead.loanPurpose}, ${item.meetingMethod.toLowerCase()}, ${dueLabel(item.startsAt, now, tz)}`, ownerName: member(item.assignedMembershipId), status: statusBadge(due, now, tz), href: `/leads/${lead.id}`, dueAt: due }); }
  for (const lead of leads.filter(item => item.status === "Nurture" && item.nextActionAt && !tasks.some(task => task.leadId === item.id && task.status === "Open"))) { const due = Date.parse(lead.nextActionAt!); if (due - now.getTime() > 7 * 86400000) continue; priorities.push({ id: `p-nurture-${lead.id}`, icon: "clock", title: `Nurture follow-up for ${fullName(lead)}`, detail: `${lead.loanPurpose}, due ${dueLabel(lead.nextActionAt!, now, tz)}`, ownerName: member(lead.ownerMembershipId), status: statusBadge(due, now, tz), href: `/leads/${lead.id}`, dueAt: due }); }
  for (const review of openReviews.filter(item => item.type === "Annual review" && item.status !== "Upcoming")) { const due = dateValue(review.triggerDate, tz); priorities.push({ id: `p-review-${review.id}`, icon: "calendar", title: `${review.householdName} annual review`, detail: `Due ${formatDayMonth(review.triggerDate, tz)}`, ownerName: review.ownerName, status: review.status === "Overdue" ? { label: "Overdue", tone: "danger" } : review.status === "Review booked" ? { label: "Booked", tone: "info" } : { label: "Due", tone: "warning" }, href: `/client-book/${review.householdId}`, dueAt: due }); }
  priorities.sort(comparePriorities);

  const recentActivity = [...activities].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt)).slice(0, 5).map(event => {
    const lead = event.leadId ? leadById.get(event.leadId as MortgageLead["id"]) : undefined;
    const subject = lead ? fullName(lead) : event.subjectReference ? input.householdNames?.[event.subjectReference.id] : undefined;
    const actor = member(event.actorMembershipId);
    return { id: event.id, time: dayKey(event.occurredAt, tz) === today ? formatTime(event.occurredAt, tz) : formatDayMonth(event.occurredAt, tz), text: `${subject ? `${subject}: ` : ""}${event.summary}${actor ? ` (${actor})` : ""}` };
  });

  needsAction.sort(comparePriorities);
  const awaitingCount = needsAction.filter(item => item.kind === "first-response").length;
  const nextCallLead = nextCall ? leadById.get(nextCall.leadId) : undefined;
  return {
    greeting: greeting(now, input.userName, tz),
    summary: `${fmt({ weekday: "long", day: "numeric", month: "long" }, tz).format(now).replace(",", "")}. ${needsActionSummary(needsAction.length, awaitingCount)}`,
    metrics: {
      medianFirstResponse: median === null ? null : { label: formatDuration(median, true), overTarget: median > FIRST_RESPONSE_TARGET_MINUTES },
      newLeads: { count: newLeads.length, unassigned: newLeads.filter(lead => !lead.ownerMembershipId).length },
      discoveryToday: (() => { const call = callsToday.find(item => Date.parse(item.startsAt) >= now.getTime()) ?? callsToday[0]; const lead = call ? leadById.get(call.leadId) : undefined; return { count: callsToday.length, nextLabel: call ? `${formatTime(call.startsAt, tz)}${lead ? `, ${fullName(lead)}` : ""}` : undefined }; })(),
      reviewsDue: { count: annualDue.length, fixedIn90: fixed.length },
    },
    needsAction,
    priorities: priorities.slice(0, 8),
    recentActivity,
    nextCall: nextCall && nextCallLead ? { when: `${dayKey(nextCall.startsAt, tz) === today ? "Today" : formatDayMonth(nextCall.startsAt, tz)}, ${formatTime(nextCall.startsAt, tz)}, ${nextCall.meetingMethod === "In person" ? "in person" : `${nextCall.meetingMethod.toLowerCase()} call`}`, title: `Discovery call with ${fullName(nextCallLead)}`, text: `${nextCallLead.loanPurpose} lead from ${nextCallLead.source}. Owned by ${member(nextCall.assignedMembershipId) ?? "no one yet"}.`, href: `/leads/${nextCallLead.id}` } : undefined,
    fixedExpiries: fixed.slice(0, 5).map(item => ({ id: item.id, householdId: item.householdId, name: item.householdName, detail: `Ends ${formatDate(item.triggerDate, tz)}, ${item.ownerName ?? "Unassigned"}`, status: item.status === "Review booked" ? { label: "Call booked", tone: "info" as BadgeTone } : { label: "Not started", tone: "neutral" as BadgeTone } })),
  };
}

/** Subtitle text derived from the same Needs action list as the card count, so the two cannot disagree. */
export function needsActionSummary(total: number, awaitingFirstResponse: number) {
  if (!total) return "Nothing needs action today.";
  const items = `${total} ${total === 1 ? "item needs" : "items need"} action today`;
  return awaitingFirstResponse ? `${items}, including ${awaitingFirstResponse} ${awaitingFirstResponse === 1 ? "lead" : "leads"} waiting for a first response.` : `${items}.`;
}

/** Brief §6.1: priorities sort by response deadline first, then by due date. */
export function comparePriorities(a: Pick<PriorityItem, "responseDeadline" | "dueAt">, b: Pick<PriorityItem, "responseDeadline" | "dueAt">) {
  if (a.responseDeadline !== undefined && b.responseDeadline !== undefined) return a.responseDeadline - b.responseDeadline;
  if (a.responseDeadline !== undefined) return -1;
  if (b.responseDeadline !== undefined) return 1;
  return a.dueAt - b.dueAt;
}
export type TodayModel = ReturnType<typeof buildToday>;
