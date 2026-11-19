import type { MembershipId, OrganisationId } from "@/platform/core/models";
import type { HouseholdId } from "@/verticals/mortgage/households/models";
import type { LoanPurpose } from "@/verticals/mortgage/leads/models";

export type MinimalLoanRecordId=`loan_${string}`;
export const loanRecordStatuses=["Active","Discharged","Unknown"]as const;
export type LoanRecordStatus=(typeof loanRecordStatuses)[number];
export const loanRecordSources=["Lead conversion","Manual entry","Imported fixture"]as const;
export type LoanRecordSource=(typeof loanRecordSources)[number];
export const dataConfidences=["Confirmed","Unverified"]as const;
export type DataConfidence=(typeof dataConfidences)[number];
export interface MinimalLoanRecord{id:MinimalLoanRecordId;organisationId:OrganisationId;householdId:HouseholdId;ownerMembershipId:MembershipId;externalReference?:string;lenderName:string;loanPurpose:LoanPurpose;settlementDate:string;fixedRateExpiryDate?:string;lastReviewDate?:string;nextReviewDate?:string;status:LoanRecordStatus;source:LoanRecordSource;dataConfidence:DataConfidence;createdAt:string;updatedAt:string;version:number;}
export interface NewLoanInput extends Omit<MinimalLoanRecord,"id"|"organisationId"|"createdAt"|"updatedAt"|"version"|"source">{source?:LoanRecordSource;}
