import type { Appointment, NewAppointmentInput } from "@/platform/appointments/models";
import type { ActivityEvent, ContactAttemptInput } from "@/platform/audit/models";
import type { MembershipId, TenantContext } from "@/platform/core/models";
import type { LeadId } from "@/platform/leads/models";
import type { NewTaskInput, Task } from "@/platform/tasks/models";
import type { MortgageOrganisationMembership } from "@/verticals/mortgage/brokerage/models";
import type { MortgageLead, MortgageLeadStatus, NewMortgageLeadInput } from "@/verticals/mortgage/leads/models";

export interface LeadOperationsSnapshot {
  leads: MortgageLead[];
  memberships: MortgageOrganisationMembership[];
  tasks: Task[];
  appointments: Appointment[];
  activities: ActivityEvent[];
}

export interface LeadOperationsReadPort {
  readSnapshot(context: TenantContext): Promise<LeadOperationsSnapshot>;
  readLead(context: TenantContext, leadId: LeadId): Promise<LeadOperationsSnapshot>;
}

export interface LeadCommandResult { leadId: string; version: number; }
export interface LeadOperationsCommandPort {
  createLead(context: TenantContext, commandId: string, input: NewMortgageLeadInput): Promise<LeadCommandResult>;
  claimLead(context: TenantContext, commandId: string, leadId: LeadId, expectedVersion: number): Promise<LeadCommandResult>;
  assignLead(context: TenantContext, commandId: string, leadId: LeadId, expectedVersion: number, targetId: MembershipId): Promise<LeadCommandResult>;
  transitionLead(context: TenantContext, commandId: string, leadId: LeadId, expectedVersion: number, next: MortgageLeadStatus, note?: string): Promise<LeadCommandResult>;
  recordContactAttempt(context: TenantContext, commandId: string, leadId: LeadId, expectedVersion: number, input: ContactAttemptInput): Promise<LeadCommandResult>;
  addNote(context: TenantContext, commandId: string, leadId: LeadId, expectedVersion: number, note: string): Promise<LeadCommandResult>;
  createTask(context: TenantContext, commandId: string, expectedVersion: number, input: NewTaskInput): Promise<LeadCommandResult>;
  createAppointment(context: TenantContext, commandId: string, expectedVersion: number, input: NewAppointmentInput): Promise<LeadCommandResult>;
  setReferralPartner(context:TenantContext,commandId:string,leadId:LeadId,expectedVersion:number,referralPartnerId?:string):Promise<LeadCommandResult>;
}

export type LeadOperationsPort = LeadOperationsReadPort & LeadOperationsCommandPort;
