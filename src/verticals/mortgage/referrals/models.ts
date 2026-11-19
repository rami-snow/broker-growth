import type { MembershipId, OrganisationId } from "@/platform/core/models";
export type ReferralPartnerId=`referral_${string}`;
export const mortgageReferralPartnerTypes=["Accountant","Real estate agent","Buyer’s agent","Financial adviser","Conveyancer","Existing client","Other"]as const;
export type MortgageReferralPartnerType=(typeof mortgageReferralPartnerTypes)[number];
export interface ReferralPartner{id:ReferralPartnerId;organisationId:OrganisationId;name:string;organisationName?:string;type:MortgageReferralPartnerType;email?:string;phone?:string;ownerMembershipId:MembershipId;status:"Active"|"Inactive";version:number;createdAt:string;updatedAt:string;}
