import Link from "next/link";
import type { LeadOperationsSnapshot } from "@/verticals/mortgage/repositories/lead-operations-port";
import type { RetentionTodaySnapshot } from "@/verticals/mortgage/repositories/client-book-port";
import { buildToday, type TodayReview } from "./today-model";
import { TodayView } from "./today-view";

export function PersistentTodayScreen({ snapshot, retention, userName, capabilities = [], now = new Date() }: { snapshot: LeadOperationsSnapshot; retention: RetentionTodaySnapshot; userName?: string; capabilities?: string[]; now?: Date }) {
  const rows = new Map<string, TodayReview>();
  for (const row of [...retention.annualDue, ...retention.fixedApproaching, ...retention.unassigned]) rows.set(row.opportunityId, { id: row.opportunityId, householdId: row.householdId, householdName: row.householdName, type: row.triggerType, triggerDate: row.triggerDate, status: row.effectiveStatus, ownerName: row.ownerName });
  const model = buildToday({ now, userName: userName ?? "there", leads: snapshot.leads, memberships: snapshot.memberships, tasks: snapshot.tasks, appointments: snapshot.appointments, activities: snapshot.activities, reviews: [...rows.values()] });
  return <TodayView model={model} newLeadAction={capabilities.includes("lead.create") ? <Link className="ui-button ui-button--primary" href="/leads?new=1">New lead</Link> : undefined}/>;
}
