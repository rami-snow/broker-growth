import type { MembershipId, OrganisationId } from "@/platform/core/models";
import type { LeadId } from "@/platform/leads/models";

export type AppointmentId = `apt_${string}`;
export interface Appointment {
  id: AppointmentId;
  organisationId: OrganisationId;
  leadId: LeadId;
  assignedMembershipId: MembershipId;
  startsAt: string;
  durationMinutes: number;
  meetingMethod: "Phone" | "Video" | "In person";
  locationOrLink?: string;
  notes: string;
  status: "Booked" | "Completed" | "Cancelled";
}
export type NewAppointmentInput = Omit<Appointment, "id" | "organisationId" | "status">;
