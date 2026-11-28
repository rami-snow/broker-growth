import { reportingSettings, type ReportingSettings } from "./settings";

/** Audit facts needed to decide whether a lead was recovered. */
export interface RecoveryEvent { type: string; occurredAt: string; newStatus?: string }
const DAY = 86400000;
const DORMANT = ["Nurture", "Closed"], ENGAGED = ["Contacted", "Discovery booked", "Converted"], RECOVERED = ["Discovery booked", "Converted"];

/**
 * Brief §4: a recovered lead was in Nurture or Closed, or had no reply for the configured period,
 * and later reached Discovery booked or Converted after a logged contact attempt.
 * "No reply" means a logged contact attempt followed by at least N days without the lead moving to
 * Contacted, Discovery booked or Converted. Returns when the lead went dormant and when it recovered.
 */
export function leadRecovery(events: RecoveryEvent[], settings: ReportingSettings = reportingSettings): { recovered: boolean; dormantAt?: string; recoveredAt?: string } {
  const ordered = [...events].sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
  const windowMs = settings.recoveredLeadNoReplyDays * DAY;
  const statusAt = (event: RecoveryEvent) => event.type === "lead.status_changed" ? event.newStatus : undefined;
  const candidates: number[] = [];
  ordered.forEach((event, index) => {
    if (DORMANT.includes(statusAt(event) ?? "")) candidates.push(Date.parse(event.occurredAt));
    if (event.type === "contact.attempted") {
      const engaged = ordered.slice(index + 1).find(next => ENGAGED.includes(statusAt(next) ?? ""));
      const silentUntil = engaged ? Date.parse(engaged.occurredAt) : Number.POSITIVE_INFINITY;
      if (silentUntil - Date.parse(event.occurredAt) >= windowMs) candidates.push(Date.parse(event.occurredAt) + windowMs);
    }
  });
  const dormantAt = candidates.length ? new Date(Math.min(...candidates)).toISOString() : undefined;
  if (!dormantAt) return { recovered: false };
  const after = ordered.filter(event => Date.parse(event.occurredAt) >= Date.parse(dormantAt!));
  const contactIndex = after.findIndex(event => event.type === "contact.attempted");
  if (contactIndex < 0) return { recovered: false, dormantAt };
  const recovery = after.slice(contactIndex + 1).find(event => RECOVERED.includes(statusAt(event) ?? ""));
  return recovery ? { recovered: true, dormantAt, recoveredAt: recovery.occurredAt } : { recovered: false, dormantAt };
}
