import type { MembershipId, OrganisationId } from "@/platform/core/models";
import type { LeadId } from "@/platform/leads/models";

export type ActivityEventId = `evt_${string}`;
export const contactChannels = ["Phone", "Email", "SMS", "Other"] as const;
export type ContactChannel = (typeof contactChannels)[number];
export const contactOutcomes = ["No answer", "Left message", "Spoke with lead", "Email sent", "SMS sent", "Incorrect details", "Lead requested later follow-up", "Other"] as const;
export type ContactOutcome = (typeof contactOutcomes)[number];
export interface ContactAttemptInput { channel:ContactChannel; outcome:ContactOutcome; note?:string; nextActionAt?:string; }
export type SharedActivityType = "lead.created" | "lead.assigned" | "lead.claimed" | "lead.status_changed" | "lead.next_action_changed" | "contact.attempted" | "note.added" | "task.created" | "appointment.created";
/** Who caused an audit entry. Phase 2 can add an AI actor here without migrating existing entries. */
export const auditActorTypes = ["person", "system", "import"] as const;
export type AuditActorType = (typeof auditActorTypes)[number];
export interface ActivityEvent<TType extends string = SharedActivityType> {
  id: ActivityEventId;
  organisationId: OrganisationId;
  leadId?: LeadId;
  subjectReference?: { type: string; id: string };
  opportunityId?: string;
  actorMembershipId: MembershipId;
  /** Absent on legacy fixture entries; treated as "person" when a member is present, otherwise "system". */
  actorType?: AuditActorType;
  occurredAt: string;
  type: TType;
  summary: string;
  oldStatus?: string;
  newStatus?: string;
  contactChannel?: ContactChannel;
  contactOutcome?: ContactOutcome;
  nextActionAt?: string;
  note?: string;
}
