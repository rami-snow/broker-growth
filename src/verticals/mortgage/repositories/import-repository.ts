import type { Contact, ContactId } from "@/platform/contacts/models";
import type { ConsentRecord } from "@/platform/consent/models";
import type { MembershipId, TenantContext } from "@/platform/core/models";
import type { LeadId } from "@/platform/leads/models";
import { organisationTimeZone } from "@/platform/time/zoned";
import type { FixtureState } from "@/verticals/mortgage/fixtures";
import type { Household, HouseholdId } from "@/verticals/mortgage/households/models";
import { importKinds, normaliseEmail, normalisePhone, planImport, type ImportExisting, type ImportKind, type ImportOwner, type ImportPlanItem, type ImportRecord } from "@/verticals/mortgage/imports/model";
import type { MortgageLead } from "@/verticals/mortgage/leads/models";
import type { MinimalLoanRecord } from "@/verticals/mortgage/loans/models";
import type { MortgageActivityEvent } from "@/verticals/mortgage/audit/models";
import type { ReferralPartner } from "@/verticals/mortgage/referrals/models";
import { generateReviewOpportunities } from "@/verticals/mortgage/review-opportunities/services";
import { hasCapability } from "@/verticals/mortgage/permissions";

export type { ImportResultItem } from "./import-port";
import type { ImportResultItem } from "./import-port";
const id = (prefix: string) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

/**
 * In-memory CSV import with the same rules as public.import_mortgage_records: capability-checked, re-planned
 * against current data at import time (so a re-run never duplicates), and audited with the actor "import".
 */
export class InMemoryImportRepository {
  constructor(private state: FixtureState, private now: () => Date = () => new Date()) {}
  private membership(context: TenantContext) { const member = this.state.memberships.find(item => item.userId === context.userId && item.organisationId === context.organisationId); if (!member) throw new Error("No active membership for this brokerage"); return member; }
  private require(context: TenantContext, kind: ImportKind) { const actor = this.membership(context), capability = importKinds.find(item => item.value === kind)!.capability; if (!hasCapability(actor, capability as never)) throw new Error("Import denied"); return actor; }

  owners(context: TenantContext): ImportOwner[] { this.membership(context); return this.state.memberships.filter(item => item.organisationId === context.organisationId && item.status === "Active").map(item => ({ id: item.id, name: item.displayName, isBroker: item.mortgageProfile.position === "Broker" })); }

  existing(context: TenantContext, kind: ImportKind): ImportExisting {
    this.require(context, kind);
    const org = context.organisationId, inHousehold = new Set(this.state.householdMembers.filter(item => item.organisationId === org).map(item => item.contactId));
    return {
      leadContacts: kind === "leads" ? this.state.leads.filter(item => item.organisationId === org).map(item => ({ email: normaliseEmail(item.email), phone: normalisePhone(item.phone) })) : [],
      clientContacts: kind === "clients" ? this.state.contacts.filter(item => item.organisationId === org).map(item => ({ id: item.id, email: normaliseEmail(item.email), phone: normalisePhone(item.phone), inHousehold: inHousehold.has(item.id) })) : [],
      partners: kind === "partners" ? this.state.referralPartners.filter(item => item.organisationId === org).map(item => ({ email: normaliseEmail(item.email), phone: normalisePhone(item.phone), name: item.name, organisation: item.organisationName })) : [],
    };
  }

  preview(context: TenantContext, kind: ImportKind, records: ImportRecord[]): ImportPlanItem[] { return planImport(records.filter(record => record.kind === kind), this.existing(context, kind)); }

  run(context: TenantContext, kind: ImportKind, records: ImportRecord[]): ImportResultItem[] {
    const actor = this.require(context, kind), owners = this.owners(context), now = this.now().toISOString(), org = context.organisationId;
    const assertOwner = (ownerId: string | undefined, broker: boolean) => { if (!ownerId) return; const owner = owners.find(item => item.id === ownerId); if (!owner || (broker && !owner.isBroker)) throw new Error("Owner must be an active broker in this brokerage"); };
    const audit = (event: Omit<MortgageActivityEvent, "id" | "organisationId" | "actorMembershipId" | "actorType" | "occurredAt">) => this.state.activities.push({ ...event, id: id("evt"), organisationId: org, actorMembershipId: actor.id, actorType: "import", occurredAt: now } as MortgageActivityEvent);
    const noConsent = (contactId: ContactId, subject: { type: string; id: string }): ConsentRecord[] => (["Email", "SMS", "Phone"] as const).map(channel => ({ id: `consent_${contactId}_${channel.toLowerCase()}` as ConsentRecord["id"], organisationId: org, subjectReference: subject, contactId, channel, status: "Not recorded", originalSource: "CSV import", originalRecordedAt: now, recordedAt: now, actorMembershipId: actor.id, provenance: "CSV import" }));
    return this.preview(context, kind, records).map(item => {
      const base = { rows: item.record.rows, label: item.record.label };
      if (item.status === "exists") return { ...base, outcome: "exists", detail: `Already exists (matched on ${item.matchedOn})` };
      if (item.status === "repeated") return { ...base, outcome: "repeated", detail: `Same person as line ${item.firstRows.join(", ")}` };
      try {
        const record = item.record;
        if (record.kind === "leads") {
          if (record.ownerMembershipId && !hasCapability(actor, "lead.assign")) throw new Error("Assigning an owner needs lead.assign");
          assertOwner(record.ownerMembershipId, false);
          const lead: MortgageLead = { id: id("lead") as LeadId, organisationId: org, firstName: record.firstName, lastName: record.lastName, email: record.email ?? "", phone: record.phone ?? "", preferredContactMethod: record.preferredContactMethod, source: record.source, loanPurpose: record.loanPurpose, timeframe: record.timeframe, ownerMembershipId: record.ownerMembershipId as MembershipId | undefined, status: "New", consentSummary: { email: "Not recorded", sms: "Not recorded", phone: "Not recorded", source: "CSV import", recordedAt: now }, createdAt: now, updatedAt: now, version: 1 };
          this.state.leads.unshift(lead);
          audit({ leadId: lead.id, type: "lead.created", summary: "Lead imported from CSV" });
          return { ...base, outcome: "created" };
        }
        if (record.kind === "partners") {
          assertOwner(record.ownerMembershipId, true);
          const partner: ReferralPartner = { id: id("referral") as ReferralPartner["id"], organisationId: org, name: record.name, organisationName: record.organisationName, type: record.type, email: record.email, phone: record.phone, ownerMembershipId: record.ownerMembershipId as MembershipId, status: "Active", nextStep: record.nextStep, version: 1, createdAt: now, updatedAt: now };
          this.state.referralPartners.push(partner);
          audit({ type: "referral_partner.created" as never, summary: "Referral partner imported from CSV", subjectReference: { type: "mortgage.referral_partner", id: partner.id } });
          return { ...base, outcome: "created" };
        }
        if (record.loans.length && !hasCapability(actor, "mortgage.loan-record.manage")) throw new Error("Importing loans needs mortgage.loan-record.manage");
        assertOwner(record.ownerMembershipId, true);
        const household: Household = { id: id("household") as HouseholdId, organisationId: org, displayName: record.displayName, primaryContactId: "" as ContactId, ownerMembershipId: record.ownerMembershipId as MembershipId, status: "Active", createdAt: now, updatedAt: now, version: 1 };
        const subject = { type: "mortgage.household", id: household.id };
        record.members.forEach((member, index) => {
          const existing = this.state.contacts.find(contact => contact.organisationId === org && ((member.email && normaliseEmail(contact.email) === member.email) || (member.phone && normalisePhone(contact.phone) === member.phone)));
          const contact: Contact = existing ?? { id: id("person") as ContactId, organisationId: org, firstName: member.firstName, lastName: member.lastName, email: member.email ?? "", phone: member.phone ?? "", preferredContactMethod: member.preferredContactMethod, status: "Active", createdAt: now, updatedAt: now };
          if (!existing) { this.state.contacts.push(contact); this.state.consentRecords.push(...noConsent(contact.id, subject)); }
          if (index === 0) household.primaryContactId = contact.id;
          this.state.householdMembers.push({ organisationId: org, householdId: household.id, contactId: contact.id, relationship: member.relationship });
        });
        this.state.households.push(household);
        audit({ type: "household.created", summary: "Client household imported from CSV", subjectReference: subject });
        const loans: MinimalLoanRecord[] = record.loans.map(loan => ({ id: id("loan") as MinimalLoanRecord["id"], organisationId: org, householdId: household.id, ownerMembershipId: household.ownerMembershipId, lenderName: loan.lenderName, loanPurpose: loan.loanPurpose, rateType: loan.rateType, fixedRateExpiryDate: loan.fixedRateExpiryDate, nextReviewDate: loan.nextReviewDate, settlementDate: "", status: "Active", source: "CSV import", dataConfidence: "Unverified", createdAt: now, updatedAt: now, version: 1 }));
        this.state.loanRecords.push(...loans);
        for (const loan of loans) audit({ type: "loan.created", summary: `Loan record imported from CSV (${loan.lenderName})`, subjectReference: subject });
        const generated = generateReviewOpportunities(loans, [household], this.state.reviewOpportunities, this.now(), () => organisationTimeZone(this.state.organisations.find(item => item.id === org)));
        this.state.reviewOpportunities.push(...generated);
        for (const opportunity of generated) audit({ type: "opportunity.generated", summary: `${opportunity.typeKey} review opportunity generated`, opportunityId: opportunity.id, subjectReference: subject });
        return { ...base, outcome: "created", detail: item.note };
      } catch (cause) { return { ...base, outcome: "failed", detail: cause instanceof Error ? cause.message : "Import failed" }; }
    });
  }
}
