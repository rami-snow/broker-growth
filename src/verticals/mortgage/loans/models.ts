import type { MembershipId, OrganisationId } from "@/platform/core/models";
import type { HouseholdId } from "@/verticals/mortgage/households/models";
import type { LoanPurpose } from "@/verticals/mortgage/leads/models";

export type MinimalLoanRecordId=`loan_${string}`;
export const loanRecordStatuses=["Active","Discharged","Unknown"]as const;
export type LoanRecordStatus=(typeof loanRecordStatuses)[number];
export const loanRecordSources=["Lead conversion","Manual entry","Imported fixture","CSV import"]as const;
export type LoanRecordSource=(typeof loanRecordSources)[number];
export const dataConfidences=["Confirmed","Unverified"]as const;
export type DataConfidence=(typeof dataConfidences)[number];
/** Rate type only: no rate value, balance or amount is ever stored. */
export const rateTypes=["Fixed","Variable","Split"]as const;
export type RateType=(typeof rateTypes)[number];
/** A variable loan cannot carry a fixed-rate expiry date; Fixed and Split can. */
export function assertRateTypeConsistent(rateType:RateType,fixedRateExpiryDate?:string){if(!rateTypes.includes(rateType))throw new Error("Choose Fixed, Variable or Split.");if(rateType==="Variable"&&fixedRateExpiryDate)throw new Error("A variable loan cannot have a fixed-rate expiry date. Clear the date first.");}
export interface MinimalLoanRecord{id:MinimalLoanRecordId;organisationId:OrganisationId;householdId:HouseholdId;ownerMembershipId:MembershipId;externalReference?:string;lenderName:string;loanPurpose:LoanPurpose;settlementDate:string;fixedRateExpiryDate?:string;rateType?:RateType;lastReviewDate?:string;nextReviewDate?:string;status:LoanRecordStatus;source:LoanRecordSource;dataConfidence:DataConfidence;createdAt:string;updatedAt:string;version:number;}
export interface NewLoanInput extends Omit<MinimalLoanRecord,"id"|"organisationId"|"createdAt"|"updatedAt"|"version"|"source">{source?:LoanRecordSource;}
