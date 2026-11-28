import type { ContactId } from "@/platform/contacts/models";
import type { OrganisationId } from "@/platform/core/models";
import type { MembershipId } from "@/platform/core/models";

export type ConsentChannelStatus = "Recorded" | "Not recorded" | "Opted out";
export const consentProvenances = ["Lead conversion", "Manual entry", "Imported fixture", "External change", "CSV import"] as const;
export type ConsentProvenance = (typeof consentProvenances)[number];

export interface ConsentSummary { email:ConsentChannelStatus; sms:ConsentChannelStatus; phone:ConsentChannelStatus; source:string; recordedAt:string; }
export type ConsentRecordId = `consent_${string}`;
export interface ConsentRecord {
  id: ConsentRecordId;
  organisationId: OrganisationId;
  subjectReference: { type: string; id: string };
  contactId: ContactId;
  channel: "Email" | "SMS" | "Phone";
  status: ConsentChannelStatus;
  originalSource: string;
  originalRecordedAt: string;
  effectiveAt?: string;
  recordedAt: string;
  actorMembershipId?: MembershipId;
  reason?: string;
  externalActionConfirmed?: true;
  provenance: ConsentProvenance;
}
