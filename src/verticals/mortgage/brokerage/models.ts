import type { SharedCapability } from "@/platform/core/models";
import type { OrganisationMembership } from "@/platform/organisations/models";

export type MortgageCapability=
  | "mortgage.household.view" | "mortgage.household.create" | "mortgage.household.update" | "mortgage.household.assign"
  | "mortgage.loan-record.manage"
  | "mortgage.review-opportunity.view" | "mortgage.review-opportunity.manage"
  | "mortgage.referral.view" | "mortgage.referral.manage";
export type MortgageApplicationCapability=SharedCapability|MortgageCapability;
export type MortgagePosition="Brokerage administrator"|"Broker"|"Support person";
export interface MortgageMembershipProfile { position:MortgagePosition; }
export interface MortgageOrganisationMembership extends OrganisationMembership<MortgageApplicationCapability>{ mortgageProfile:MortgageMembershipProfile; }
