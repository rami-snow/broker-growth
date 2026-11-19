import type { MembershipId } from "@/platform/core/models";
import { hasCapability, sameOrganisation } from "@/platform/permissions";
import type { MortgageLead } from "@/verticals/mortgage/leads/models";
import type { Household } from "@/verticals/mortgage/households/models";
import type { ReviewOpportunity } from "@/verticals/mortgage/review-opportunities/models";
import type { MortgageApplicationCapability, MortgageOrganisationMembership } from "@/verticals/mortgage/brokerage/models";

export { hasCapability };
export const canAssignLead=(membership:MortgageOrganisationMembership,lead:MortgageLead)=>sameOrganisation(membership,lead)&&hasCapability(membership,"lead.assign");
export const canClaimLead=(membership:MortgageOrganisationMembership,lead:MortgageLead)=>sameOrganisation(membership,lead)&&!lead.ownerMembershipId&&hasCapability(membership,"lead.claim");
export const canUpdateLead=(membership:MortgageOrganisationMembership,lead:MortgageLead)=>sameOrganisation(membership,lead)&&hasCapability(membership,"lead.update")&&(hasCapability(membership,"lead.assign")||lead.ownerMembershipId===membership.id);
export const isBrokerMembership=(membership:MortgageOrganisationMembership)=>membership.mortgageProfile.position==="Broker";
export const canAssignTo=(actor:MortgageOrganisationMembership,targetId:MembershipId,memberships:MortgageOrganisationMembership[])=>hasCapability(actor,"lead.assign")&&memberships.some(member=>member.id===targetId&&member.organisationId===actor.organisationId&&isBrokerMembership(member)&&member.status==="Active");
export const canManageHousehold=(membership:MortgageOrganisationMembership,household:Household)=>sameOrganisation(membership,household)&&hasCapability(membership,"mortgage.household.update")&&(hasCapability(membership,"mortgage.household.assign")||household.ownerMembershipId===membership.id);
export const canManageOpportunity=(membership:MortgageOrganisationMembership,opportunity:ReviewOpportunity)=>sameOrganisation(membership,opportunity)&&hasCapability(membership,"mortgage.review-opportunity.manage")&&(hasCapability(membership,"mortgage.household.assign")||opportunity.ownerMembershipId===membership.id);
export const canAssignClientRecord=(membership:MortgageOrganisationMembership)=>hasCapability(membership,"mortgage.household.assign");
export const canAssignClientTo=(actor:MortgageOrganisationMembership,targetId:MembershipId,memberships:MortgageOrganisationMembership[])=>canAssignClientRecord(actor)&&memberships.some(member=>member.id===targetId&&member.organisationId===actor.organisationId&&isBrokerMembership(member)&&member.status==="Active");
export type { MortgageApplicationCapability };
