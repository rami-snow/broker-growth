import type { MembershipId } from "@/platform/core/models";
import type { LeadFoundation } from "@/platform/leads/models";
import type { OrganisationMembership } from "@/platform/organisations/models";

export const hasCapability=<TCapability extends string>(membership:OrganisationMembership<TCapability>,capability:TCapability)=>membership.capabilities.includes(capability);
export const sameOrganisation=(membership:OrganisationMembership<string>,record:{organisationId:string})=>membership.organisationId===record.organisationId;
export const canClaimLead=<TCapability extends string>(membership:OrganisationMembership<TCapability>,lead:LeadFoundation<string>,claim:TCapability)=>sameOrganisation(membership,lead)&&!lead.ownerMembershipId&&hasCapability(membership,claim);
export const canAssignTo=<TCapability extends string>(actor:OrganisationMembership<TCapability>,targetId:MembershipId,memberships:OrganisationMembership<TCapability>[],assign:TCapability)=>hasCapability(actor,assign)&&memberships.some(member=>member.id===targetId&&member.organisationId===actor.organisationId&&member.status==="Active");
