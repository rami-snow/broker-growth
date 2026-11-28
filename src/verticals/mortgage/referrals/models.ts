import type { MembershipId, OrganisationId } from "@/platform/core/models";
export type ReferralPartnerId=`referral_${string}`;
export const mortgageReferralPartnerTypes=["Accountant","Real estate agent","Buyer’s agent","Financial adviser","Conveyancer","Existing client","Other"]as const;
export type MortgageReferralPartnerType=(typeof mortgageReferralPartnerTypes)[number];
export interface ReferralPartner{id:ReferralPartnerId;organisationId:OrganisationId;name:string;organisationName?:string;type:MortgageReferralPartnerType;email?:string;phone?:string;ownerMembershipId:MembershipId;status:"Active"|"Inactive";nextStep?:string;version:number;createdAt:string;updatedAt:string;}
export const NEXT_STEP_MAX_LENGTH=200;
/** Trims a manual next step; empty clears it. Mirrors the database check. */
export function normaliseNextStep(value:string|undefined){const cleaned=value?.trim()??"";if(cleaned.length>NEXT_STEP_MAX_LENGTH)throw new Error(`Keep the next step under ${NEXT_STEP_MAX_LENGTH} characters.`);return cleaned||undefined;}
