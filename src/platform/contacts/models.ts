import type { OrganisationId } from "@/platform/core/models";

export type ContactId = `${"contact" | "person"}_${string}`;
export type ContactMethod = "Email" | "SMS" | "Phone";
export interface Contact {
  id: ContactId;
  organisationId: OrganisationId;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  preferredContactMethod: ContactMethod;
  status: "Active" | "Inactive";
  createdAt: string;
  updatedAt: string;
}
