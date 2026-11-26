import type { ActivityEvent } from "@/platform/audit/models";
import type { MortgageLead } from "./models";

/** Brief §4: first response is the time from lead created to the first logged contact attempt. Target: 1 hour. */
export const FIRST_RESPONSE_TARGET_MINUTES = 60;

/**
 * Earliest logged contact attempt after the lead was created. Status changes into
 * Contact attempted/Contacted count only when no explicit contact attempt exists, matching
 * the established Today metric so both surfaces agree.
 */
export function firstContactAttemptAt(lead: Pick<MortgageLead, "id" | "createdAt">, activities: ReadonlyArray<Pick<ActivityEvent<string>, "leadId" | "type" | "occurredAt" | "newStatus">>): string | undefined {
  const createdAt = Date.parse(lead.createdAt);
  if (!Number.isFinite(createdAt)) return undefined;
  const own = activities.filter(event => event.leadId === lead.id);
  const explicit = own.filter(event => event.type === "contact.attempted");
  const candidates = explicit.length ? explicit : own.filter(event => event.type === "lead.status_changed" && (event.newStatus === "Contact attempted" || event.newStatus === "Contacted"));
  return candidates.map(event => event.occurredAt).filter(value => Number.isFinite(Date.parse(value)) && Date.parse(value) > createdAt).sort((a, b) => Date.parse(a) - Date.parse(b))[0];
}

export type LeadResponseState =
  | { kind: "awaiting"; dueAt: string; minutesUntilDue: number }
  | { kind: "responded"; minutes: number; withinTarget: boolean }
  | { kind: "no-reply" };

/** Response clock for one lead at `now`. */
export function leadResponseState(lead: Pick<MortgageLead, "id" | "createdAt" | "status">, activities: Parameters<typeof firstContactAttemptAt>[1], now: Date): LeadResponseState {
  const first = firstContactAttemptAt(lead, activities);
  const createdAt = Date.parse(lead.createdAt);
  if (first) { const minutes = Math.round((Date.parse(first) - createdAt) / 60000); return { kind: "responded", minutes, withinTarget: minutes <= FIRST_RESPONSE_TARGET_MINUTES }; }
  // The clock only runs while the lead is still New; a lead moved on by hand is no longer awaiting a first response.
  if (lead.status !== "New") return { kind: "no-reply" };
  const due = createdAt + FIRST_RESPONSE_TARGET_MINUTES * 60000;
  return { kind: "awaiting", dueAt: new Date(due).toISOString(), minutesUntilDue: Math.round((due - now.getTime()) / 60000) };
}

export const needsFirstResponse = (lead: Pick<MortgageLead, "id" | "createdAt" | "status">, activities: Parameters<typeof firstContactAttemptAt>[1], now: Date) => leadResponseState(lead, activities, now).kind === "awaiting";

/** Short human label for a duration in minutes, e.g. 35m, 3h, 25h 45m. */
export function formatDuration(minutes: number, precise = false) {
  const value = Math.max(0, Math.round(Math.abs(minutes)));
  if (value < 60) return `${value}m`;
  const hours = Math.floor(value / 60), rest = value % 60;
  return precise && rest ? `${hours}h ${rest}m` : `${hours}h`;
}

export function medianMinutes(values: readonly number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b), middle = Math.floor(sorted.length / 2);
  return Math.round(sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2);
}

/** Response-due ordering used by Leads and Today: overdue/awaiting first by deadline, then by next action. */
export function compareByResponseDue(a: { state: LeadResponseState; nextActionAt?: string; createdAt: string }, b: { state: LeadResponseState; nextActionAt?: string; createdAt: string }) {
  const key = (item: typeof a) => item.state.kind === "awaiting" ? [0, Date.parse(item.state.dueAt)] : [1, item.nextActionAt ? Date.parse(item.nextActionAt) : Number.MAX_SAFE_INTEGER];
  const [ga, ta] = key(a), [gb, tb] = key(b);
  return ga - gb || ta - tb || b.createdAt.localeCompare(a.createdAt);
}
