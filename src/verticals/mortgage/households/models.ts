import type { Contact, ContactId, ContactMethod } from "@/platform/contacts/models";
import type { MembershipId, OrganisationId } from "@/platform/core/models";
import type { LeadId } from "@/platform/leads/models";
import type { ConsentChannelStatus } from "@/platform/consent/models";
import type { ReferralPartnerId } from "@/verticals/mortgage/referrals/models";

export type HouseholdId=`household_${string}`;
export const householdStatuses=["Active","Inactive","Archived"]as const;
export type HouseholdStatus=(typeof householdStatuses)[number];
export const householdRelationships=["Primary applicant","Joint applicant","Guarantor","Other"]as const;
export interface Household{id:HouseholdId;organisationId:OrganisationId;displayName:string;primaryContactId:ContactId;ownerMembershipId:MembershipId;sourceLeadId?:LeadId;referralPartnerId?:ReferralPartnerId;status:HouseholdStatus;createdAt:string;updatedAt:string;version:number;}
export type HouseholdRelationship=(typeof householdRelationships)[number];
export interface HouseholdMember{organisationId:OrganisationId;householdId:HouseholdId;contactId:ContactId;relationship:HouseholdRelationship;}
export interface JointContactInput{firstName:string;lastName:string;email:string;phone:string;preferredContactMethod:ContactMethod;relationship:"Joint applicant"|"Guarantor"|"Other";}
export interface ManualHouseholdInput{displayName:string;ownerMembershipId:MembershipId;referralPartnerId?:ReferralPartnerId;primary:Omit<Contact,"id"|"organisationId"|"status"|"createdAt"|"updatedAt">;consent:{email:ConsentChannelStatus;sms:ConsentChannelStatus;phone:ConsentChannelStatus;source:string;recordedAt:string};jointContact?:JointContactInput;}
