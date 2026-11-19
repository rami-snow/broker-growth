import type { OpportunityFoundation } from "@/platform/opportunities/models";
import type { HouseholdId } from "@/verticals/mortgage/households/models";
import type { MinimalLoanRecordId } from "@/verticals/mortgage/loans/models";
export type ReviewOpportunityId=`review_${string}`;
export const reviewOpportunityTypes=["Annual review","Fixed-rate expiry"]as const;
export type ReviewOpportunityType=(typeof reviewOpportunityTypes)[number];
export const reviewOpportunityStatuses=["Upcoming","Due","Overdue","Review booked","Completed","Dismissed"]as const;
export type ReviewOpportunityStatus=(typeof reviewOpportunityStatuses)[number];
export interface ReviewOpportunity extends OpportunityFoundation<ReviewOpportunityId,ReviewOpportunityType,ReviewOpportunityStatus,"mortgage.household">{householdId:HouseholdId;loanRecordId:MinimalLoanRecordId;completedAt?:string;dismissalReason?:string;}
