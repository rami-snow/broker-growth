export type OrganisationId = string & { readonly __organisationId?: unique symbol };
export type UserId = string & { readonly __userId?: unique symbol };
export type MembershipId = string & { readonly __membershipId?: unique symbol };
export type VerticalKey = "mortgage" | "construction" | "trades";

export type SharedCapability =
  | "organisation.switch"
  | "contact.view" | "contact.update"
  | "lead.view" | "lead.create" | "lead.update" | "lead.assign" | "lead.claim"
  | "task.create" | "task.update" | "appointment.create"
  | "opportunity.view" | "opportunity.manage"
  | "report.view" | "settings.view"
  | "campaign.view" | "campaign.create" | "campaign.edit" | "campaign.submit" | "campaign.approve" | "campaign.cancel"
  | "consent.view" | "consent.record-external-change";

export interface TenantContext { organisationId: OrganisationId; userId: UserId; }
export interface UserIdentity { id: UserId; name: string; email: string; }
