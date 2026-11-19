import type { ContactMethod } from "@/platform/contacts/models";
import type { MembershipId } from "@/platform/core/models";
import type { ConsentSummary } from "@/platform/consent/models";
import type { LeadFoundation } from "@/platform/leads/models";
import type { HouseholdId } from "@/verticals/mortgage/households/models";

export type MortgageLeadStatus="New"|"Contact attempted"|"Contacted"|"Discovery booked"|"Nurture"|"Converted"|"Closed";
export const loanPurposes=["Purchase","Refinance","Investment purchase","Construction loan","Asset finance","Commercial finance","Other"]as const;
export type LoanPurpose=(typeof loanPurposes)[number];
export const mortgageTimeframes=["Immediately","Within 1 month","1–3 months","3–6 months","Researching"]as const;
export type MortgageTimeframe=(typeof mortgageTimeframes)[number];
export interface MortgageLead extends LeadFoundation<MortgageLeadStatus>{
  referralPartnerId?:string;
  referralPartnerName?:string;
  referralPartnerStatus?:"Active"|"Inactive";
  loanPurpose:LoanPurpose;
  timeframe:MortgageTimeframe;
  consentSummary:ConsentSummary;
  convertedHouseholdId?:HouseholdId;
}
export interface NewMortgageLeadInput extends Pick<MortgageLead,"firstName"|"lastName"|"email"|"phone"|"source"|"loanPurpose"|"timeframe"|"preferredContactMethod">{ownerMembershipId?:MembershipId;preferredContactMethod:ContactMethod;}
