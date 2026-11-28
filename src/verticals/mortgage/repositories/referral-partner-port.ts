import type { MortgageReferralPartnerType } from "@/verticals/mortgage/referrals/models";

export interface ReferralPartnerListQuery {
  search?:string; status?:"Active"|"Inactive"; type?:MortgageReferralPartnerType;
  ownerMembershipId?:string; sort?:"name"|"recent"; page?:number;
}
export interface ReferralPartnerSummary {
  id:string; name:string; organisationName?:string; type:MortgageReferralPartnerType;
  email?:string; phone?:string; ownerMembershipId:string; ownerName:string;
  status:"Active"|"Inactive"; nextStep?:string; version:number; createdAt:string; updatedAt:string;
}
export interface ReferralPartnerListSnapshot {
  rows:ReferralPartnerSummary[]; total:number; page:number; pageSize:number;
  brokers:Array<{id:string;displayName:string}>;
}
export interface ReferralPartnerDetailSnapshot {
  partner:ReferralPartnerSummary;
  brokers:Array<{id:string;displayName:string}>;
  leads:Array<{id:string;name:string;status:string;source:string;createdAt:string}>;
  households:Array<{id:string;displayName:string;status:string;createdAt:string}>;
  activities:Array<{id:string;eventType:string;summary:string;occurredAt:string;actorMembershipId?:string}>;
}
export interface ReferralDuplicateMatch {
  id:string; name:string; organisationName?:string; email?:string; status:"Active"|"Inactive";
  reasons:Array<"exact_email"|"normalized_name_and_organisation"|"exact_normalized_name_without_organisation">;
}
export interface ReferralPartnerMutationInput {
  name:string; organisationName?:string; type:MortgageReferralPartnerType;
  email?:string; phone?:string;
}
