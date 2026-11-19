import type { MembershipId, OrganisationId } from "@/platform/core/models";

export interface SubjectReference<TType extends string = string> { type: TType; id: string; }
export interface OpportunityFoundation<TId extends string, TTypeKey extends string, TStatus extends string, TSubjectType extends string = string> {
  id: TId;
  organisationId: OrganisationId;
  subjectReference: SubjectReference<TSubjectType>;
  typeKey: TTypeKey;
  ownerMembershipId?: MembershipId;
  triggerDate: string;
  lifecycleStatus: TStatus;
  createdAt: string;
  updatedAt: string;
}
