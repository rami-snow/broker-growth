import type { ContactMethod } from "@/platform/contacts/models";
import type { MembershipId, OrganisationId } from "@/platform/core/models";

export type LeadId = `lead_${string}`;
export interface LeadFoundation<TStatus extends string> {
  id: LeadId;
  organisationId: OrganisationId;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  preferredContactMethod: ContactMethod;
  source: string;
  ownerMembershipId?: MembershipId;
  status: TStatus;
  nextActionAt?: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}
