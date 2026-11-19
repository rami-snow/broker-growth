import type { TenantContext } from "@/platform/core/models";
import type { LeadId } from "@/platform/leads/models";
import type { InMemoryOperationsRepository } from "./operations-repository";
import type { LeadOperationsReadPort, LeadOperationsSnapshot } from "./lead-operations-port";

/** Async read adapter proving the same port is immediately usable in fixture mode. */
export class FixtureLeadOperationsAdapter implements LeadOperationsReadPort {
  constructor(private readonly repository: InMemoryOperationsRepository) {}
  async readSnapshot(context: TenantContext): Promise<LeadOperationsSnapshot> {
    return {
      leads: this.repository.listLeads(context),
      memberships: this.repository.listMemberships(context),
      tasks: this.repository.listTasks(context),
      appointments: this.repository.listAppointments(context),
      activities: this.repository.snapshot().activities.filter(item => item.organisationId === context.organisationId && ["lead.created","lead.assigned","lead.claimed","lead.status_changed","lead.next_action_changed","contact.attempted","note.added","task.created","appointment.created"].includes(item.type)) as LeadOperationsSnapshot["activities"],
    };
  }
  async readLead(context: TenantContext, leadId: LeadId): Promise<LeadOperationsSnapshot> {
    const snapshot = await this.readSnapshot(context);
    this.repository.getLead(context, leadId);
    return { ...snapshot, leads: snapshot.leads.filter(item => item.id === leadId), tasks: snapshot.tasks.filter(item => item.leadId === leadId), appointments: snapshot.appointments.filter(item => item.leadId === leadId), activities: snapshot.activities.filter(item => item.leadId === leadId) };
  }
}
