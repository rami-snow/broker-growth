import type { MembershipId, OrganisationId, SharedCapability, UserId, VerticalKey } from "@/platform/core/models";

export interface Organisation {
  id: OrganisationId;
  name: string;
  shortName: string;
  verticalKey: VerticalKey;
  status: "Active" | "Inactive";
  region?: string;
  /** IANA time zone used for business dates and for reading date-time inputs. */
  timeZone?: string;
}

export interface OrganisationMembership<TCapability extends string = SharedCapability> {
  id: MembershipId;
  organisationId: OrganisationId;
  userId: UserId;
  displayName: string;
  capabilities: TCapability[];
  status: "Active" | "Inactive";
}
