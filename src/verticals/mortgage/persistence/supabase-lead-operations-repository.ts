import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/platform/database/database.types";
import type { TenantContext, MembershipId } from "@/platform/core/models";
import type { LeadId } from "@/platform/leads/models";
import type { ActivityEvent, ContactAttemptInput } from "@/platform/audit/models";
import type { Appointment, NewAppointmentInput } from "@/platform/appointments/models";
import type { NewTaskInput, Task } from "@/platform/tasks/models";
import type { MortgageLead, MortgageLeadStatus, NewMortgageLeadInput } from "@/verticals/mortgage/leads/models";
import type { MortgageOrganisationMembership } from "@/verticals/mortgage/brokerage/models";
import type { LeadOperationsSnapshot } from "@/verticals/mortgage/repositories/lead-operations-port";
import { selectCurrentEffectiveEvidence } from "@/platform/consent/effective-evidence";

type Client = SupabaseClient<Database>;
type LeadRow = Database["public"]["Tables"]["leads"]["Row"];
type ContactRow = Pick<Database["public"]["Tables"]["contacts"]["Row"], "id" | "organisation_id" | "given_name" | "family_name" | "email" | "phone">;
type DetailRow = Pick<Database["public"]["Tables"]["mortgage_lead_details"]["Row"], "organisation_id" | "lead_id" | "loan_purpose" | "timeframe" | "preferred_contact_method" | "referral_partner_id">;
type ConsentRow = Pick<Database["public"]["Tables"]["consent_evidence"]["Row"], "id" | "organisation_id" | "contact_id" | "channel" | "status" | "source" | "effective_at" | "recorded_at">;

const leadColumns = "id,organisation_id,contact_id,owner_membership_id,source,lifecycle_status,next_action_at,created_at,updated_at,version";
const contactColumns = "id,organisation_id,given_name,family_name,email,phone";
const detailColumns = "organisation_id,lead_id,loan_purpose,timeframe,preferred_contact_method,referral_partner_id";
const consentColumns = "id,organisation_id,contact_id,channel,status,source,effective_at,recorded_at";
const membershipColumns = "id,organisation_id,user_id,display_name,status";
const profileColumns = "organisation_id,membership_id,position";
const capabilityColumns = "organisation_id,membership_id,capability";
const taskColumns = "id,organisation_id,lead_id,assigned_membership_id,title,due_at,priority,status,version,created_by_membership_id,created_at";
const appointmentColumns = "id,organisation_id,lead_id,assigned_membership_id,starts_at,duration_minutes,meeting_method,location_or_link,notes,status";
const activityColumns = "id,organisation_id,entity_id,actor_membership_id,occurred_at,event_type,summary,details";

const object = (value: Json): Record<string, Json | undefined> => value && typeof value === "object" && !Array.isArray(value) ? value : {};
const text = (value: Json | undefined) => typeof value === "string" ? value : undefined;

export class SupabaseLeadOperationsRepository {
  constructor(private readonly client: Client, private readonly now: () => Date = () => new Date()) {}

  async readSnapshot(context: TenantContext): Promise<LeadOperationsSnapshot> {
    return this.read(context);
  }

  async readLead(context: TenantContext, leadId: LeadId): Promise<LeadOperationsSnapshot> {
    return this.read(context, leadId);
  }

  async createLead(context: TenantContext, commandId: string, input: NewMortgageLeadInput) {
    return this.command("create_mortgage_lead", { organisation_id: context.organisationId, command_id: commandId, first_name: input.firstName, last_name: input.lastName, email: input.email, phone: input.phone, source: input.source, loan_purpose: input.loanPurpose, timeframe: input.timeframe, preferred_contact_method: input.preferredContactMethod, owner_membership_id: input.ownerMembershipId });
  }
  async claimLead(context: TenantContext, commandId: string, leadId: LeadId, expectedVersion: number) {
    return this.command("claim_lead", { organisation_id: context.organisationId, command_id: commandId, lead_id: leadId, expected_version: expectedVersion });
  }
  async assignLead(context: TenantContext, commandId: string, leadId: LeadId, expectedVersion: number, targetId: MembershipId) {
    return this.command("assign_lead", { organisation_id: context.organisationId, command_id: commandId, lead_id: leadId, expected_version: expectedVersion, target_membership_id: targetId });
  }
  async transitionLead(context: TenantContext, commandId: string, leadId: LeadId, expectedVersion: number, next: MortgageLeadStatus, note?: string) {
    return this.command("transition_lead", { organisation_id: context.organisationId, command_id: commandId, lead_id: leadId, expected_version: expectedVersion, next_status: next, note });
  }
  async recordContactAttempt(context: TenantContext, commandId: string, leadId: LeadId, expectedVersion: number, input: ContactAttemptInput) {
    return this.command("record_contact_attempt", { organisation_id: context.organisationId, command_id: commandId, lead_id: leadId, expected_version: expectedVersion, channel: input.channel, outcome: input.outcome, note: input.note, next_action_at: input.nextActionAt });
  }
  async addNote(context: TenantContext, commandId: string, leadId: LeadId, expectedVersion: number, note: string) {
    return this.command("add_lead_note", { organisation_id: context.organisationId, command_id: commandId, lead_id: leadId, expected_version: expectedVersion, note });
  }
  async createTask(context: TenantContext, commandId: string, expectedVersion: number, input: NewTaskInput) {
    return this.command("create_lead_task", { organisation_id: context.organisationId, command_id: commandId, lead_id: input.leadId, expected_version: expectedVersion, assigned_membership_id: input.assignedMembershipId, title: input.title, due_at: input.dueAt, priority: input.priority });
  }
  async createAppointment(context: TenantContext, commandId: string, expectedVersion: number, input: NewAppointmentInput) {
    return this.command("book_discovery_appointment", { organisation_id: context.organisationId, command_id: commandId, lead_id: input.leadId, expected_version: expectedVersion, assigned_membership_id: input.assignedMembershipId, starts_at: input.startsAt, duration_minutes: input.durationMinutes, meeting_method: input.meetingMethod, location_or_link: input.locationOrLink, notes: input.notes });
  }
  async setReferralPartner(context:TenantContext,commandId:string,leadId:LeadId,expectedVersion:number,referralPartnerId?:string){return this.command("set_mortgage_lead_referral_partner" as never,{organisation_id:context.organisationId,command_id:commandId,lead_id:leadId,expected_version:expectedVersion,referral_partner_id:referralPartnerId??null} as never);}

  private async command<Name extends keyof Database["public"]["Functions"]>(name: Name, args: Database["public"]["Functions"][Name]["Args"]): Promise<{ leadId: string; version: number }> {
    const { data, error } = await this.client.rpc(name, args);
    if (error) throw operationError(error.message);
    const value = object(data as Json);
    if (typeof value.leadId !== "string" || typeof value.version !== "number") throw new Error("The operation returned an invalid result.");
    return { leadId: value.leadId, version: value.version };
  }

  private async read(context: TenantContext, leadId?: LeadId): Promise<LeadOperationsSnapshot> {
    const organisationId = context.organisationId;
    let leadsQuery = this.client.from("leads").select(leadColumns).eq("organisation_id", organisationId).order("created_at", { ascending: false });
    if (leadId) leadsQuery = leadsQuery.eq("id", leadId);
    const leadsResult = await leadsQuery;
    if (leadsResult.error) throw new Error(`Unable to load brokerage lead operations: ${leadsResult.error.message}`);
    const leadRows = leadsResult.data ?? [];
    const leadIds = leadRows.map(row => row.id);
    const contactIds = leadRows.flatMap(row => row.contact_id ? [row.contact_id] : []);

    const [contactsResult, detailsResult, consentsResult, membershipsResult, tasksResult, appointmentsResult, activitiesResult] = await Promise.all([
      contactIds.length ? this.client.from("contacts").select(contactColumns).eq("organisation_id", organisationId).in("id", contactIds) : Promise.resolve({ data: [], error: null }),
      leadIds.length ? this.client.from("mortgage_lead_details").select(detailColumns).eq("organisation_id", organisationId).in("lead_id", leadIds) : Promise.resolve({ data: [], error: null }),
      contactIds.length ? this.client.from("consent_evidence").select(consentColumns).eq("organisation_id", organisationId).in("contact_id", contactIds) : Promise.resolve({ data: [], error: null }),
      this.client.from("organisation_memberships").select(membershipColumns).eq("organisation_id", organisationId).eq("status", "Active"),
      leadIds.length ? this.client.from("tasks").select(taskColumns).eq("organisation_id", organisationId).in("lead_id", leadIds).order("due_at") : Promise.resolve({ data: [], error: null }),
      leadIds.length ? this.client.from("appointments").select(appointmentColumns).eq("organisation_id", organisationId).in("lead_id", leadIds).order("starts_at") : Promise.resolve({ data: [], error: null }),
      leadIds.length ? this.client.from("activity_events").select(activityColumns).eq("organisation_id", organisationId).eq("entity_type", "lead").in("entity_id", leadIds).order("occurred_at", { ascending: false }) : Promise.resolve({ data: [], error: null }),
    ]);
    const firstFailure = [contactsResult, detailsResult, consentsResult, membershipsResult, tasksResult, appointmentsResult, activitiesResult].find(item => item.error)?.error;
    if (firstFailure) throw new Error(`Unable to load brokerage lead operations: ${firstFailure.message}`);

    const membershipIds = (membershipsResult.data ?? []).map(row => row.id);
    const [profilesResult, capabilitiesResult] = await Promise.all([
      membershipIds.length ? this.client.from("mortgage_membership_profiles").select(profileColumns).eq("organisation_id", organisationId).in("membership_id", membershipIds) : Promise.resolve({ data: [], error: null }),
      membershipIds.length ? this.client.from("membership_capabilities").select(capabilityColumns).eq("organisation_id", organisationId).in("membership_id", membershipIds) : Promise.resolve({ data: [], error: null }),
    ]);
    const membershipFailure = [profilesResult, capabilitiesResult].find(item => item.error)?.error;
    if (membershipFailure) throw new Error(`Unable to load brokerage lead operations: ${membershipFailure.message}`);

    const selectedLeadIds = new Set(leadIds);
    const contacts = new Map((contactsResult.data ?? []).map(row => [row.id, row]));
    const details = new Map((detailsResult.data ?? []).map(row => [row.lead_id, row]));
    const consents = consentsResult.data ?? [];
    const memberships = (membershipsResult.data ?? []).map(row => {
      const profile = (profilesResult.data ?? []).find(item => item.membership_id === row.id);
      return {
        id: row.id as MembershipId,
        organisationId: row.organisation_id,
        userId: row.user_id,
        displayName: row.display_name,
        status: "Active" as const,
        capabilities: (capabilitiesResult.data ?? []).filter(item => item.membership_id === row.id).map(item => item.capability),
        mortgageProfile: { position: (profile?.position ?? "Support person") as MortgageOrganisationMembership["mortgageProfile"]["position"] },
      } as MortgageOrganisationMembership;
    });
    const referralIds=[...new Set((detailsResult.data??[]).flatMap(row=>row.referral_partner_id?[row.referral_partner_id]:[]))];
    const referrals=referralIds.length?await this.client.from("mortgage_referral_partners").select("id,name,status").eq("organisation_id",organisationId).in("id",referralIds):{data:[],error:null};
    if(referrals.error)throw new Error(`Unable to load lead referral attribution: ${referrals.error.message}`);
    const referralMap=new Map((referrals.data??[]).map(row=>[row.id,row]));
    const referenceTime = this.now();
    const leads = leadRows.map(row => {const detail=details.get(row.id),referral=detail?.referral_partner_id?referralMap.get(detail.referral_partner_id):undefined;return mapLead(row, contacts.get(row.contact_id ?? ""), detail, consents, referenceTime,referral);});
    return {
      leads,
      memberships,
      tasks: (tasksResult.data ?? []).filter(row => row.lead_id && selectedLeadIds.has(row.lead_id)).map(row => ({ id: row.id, organisationId: row.organisation_id, leadId: row.lead_id!, assignedMembershipId: row.assigned_membership_id, title: row.title, dueAt: row.due_at, priority: row.priority, status: row.status, version: row.version, createdBy: row.created_by_membership_id, createdAt: row.created_at }) as Task),
      appointments: (appointmentsResult.data ?? []).filter(row => selectedLeadIds.has(row.lead_id)).map(row => ({ id: row.id, organisationId: row.organisation_id, leadId: row.lead_id, assignedMembershipId: row.assigned_membership_id, startsAt: row.starts_at, durationMinutes: row.duration_minutes, meetingMethod: row.meeting_method, locationOrLink: row.location_or_link ?? undefined, notes: row.notes, status: row.status }) as Appointment),
      activities: (activitiesResult.data ?? []).filter(row => selectedLeadIds.has(row.entity_id)).map(row => { const details = object(row.details); return { id: row.id, organisationId: row.organisation_id, leadId: row.entity_id, actorMembershipId: row.actor_membership_id ?? "", occurredAt: row.occurred_at, type: row.event_type, summary: row.summary, oldStatus: text(details.oldStatus), newStatus: text(details.newStatus), contactChannel: text(details.channel), contactOutcome: text(details.outcome), nextActionAt: text(details.nextActionAt), note: text(details.note) } as ActivityEvent; }),
    };
  }
}

function operationError(message: string) {
  if (message.includes("STALE_LEAD_VERSION")) return new Error("This lead changed while you were working. Refresh and try again.");
  if (message.includes("CAPABILITY_REQUIRED") || message.includes("OWNERSHIP_REQUIRED")) return new Error("You do not have permission to perform this action.");
  if (message.includes("COMMAND_ID_REUSE_CONFLICT")) return new Error("This action key was already used for another operation. Try again.");
  return new Error(message.replace(/^.*?(AUTHENTICATION_REQUIRED|[A-Z][A-Z0-9_:-]+).*$/s, "$1").replaceAll("_", " ").toLowerCase().replace(/^./, character => character.toUpperCase()));
}

function mapLead(row: LeadRow, contact: ContactRow | undefined, detail: DetailRow | undefined, consents: ConsentRow[], referenceTime: Date,referral?:{id:string;name:string;status:string}): MortgageLead {
  if (!detail) throw new Error(`Lead ${row.id} is missing its tenant-scoped mortgage details`);
  const evidence = contact ? consents.filter(item => item.contact_id === contact.id) : [];
  const latest = (channel: "Email" | "SMS" | "Phone") => selectCurrentEffectiveEvidence(
    evidence.filter(item => item.channel === channel).map(item => ({ ...item, effectiveAt: item.effective_at, recordedAt: item.recorded_at })),
    referenceTime,
  );
  const email = latest("Email");
  const sms = latest("SMS");
  const phone = latest("Phone");
  const recorded = selectCurrentEffectiveEvidence([email, sms, phone].filter(item => item !== undefined), referenceTime);
  return {
    id: row.id as LeadId,
    organisationId: row.organisation_id,
    firstName: contact?.given_name ?? "Contact",
    lastName: contact?.family_name ?? "details restricted",
    email: contact?.email ?? "Contact details require contact.view",
    phone: contact?.phone ?? "Contact details require contact.view",
    preferredContactMethod: detail.preferred_contact_method as MortgageLead["preferredContactMethod"],
    source: row.source,
    referralPartnerId:detail.referral_partner_id??undefined,
    referralPartnerName:referral?.name,
    referralPartnerStatus:referral?.status as "Active"|"Inactive"|undefined,
    ownerMembershipId: row.owner_membership_id as MembershipId | undefined,
    status: row.lifecycle_status as MortgageLeadStatus,
    nextActionAt: row.next_action_at ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    version: row.version,
    loanPurpose: detail.loan_purpose as MortgageLead["loanPurpose"],
    timeframe: detail.timeframe as MortgageLead["timeframe"],
    consentSummary: {
      email: (email?.status ?? "Not recorded") as MortgageLead["consentSummary"]["email"],
      sms: (sms?.status ?? "Not recorded") as MortgageLead["consentSummary"]["sms"],
      phone: (phone?.status ?? "Not recorded") as MortgageLead["consentSummary"]["phone"],
      source: recorded?.source ?? "No evidence recorded",
      recordedAt: recorded?.recorded_at ?? row.created_at,
    },
  };
}
