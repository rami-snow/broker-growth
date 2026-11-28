export interface ClientBookListQuery {
  search?: string;
  status?: string;
  ownerMembershipId?: string;
  sort?: "name" | "recent";
  page?: number;
}

export interface ClientBookListItem {
  id: string;
  displayName: string;
  status: string;
  ownerMembershipId: string;
  ownerName: string;
  primaryContact: { id: string; name: string; email?: string; phone?: string };
  referralPartnerId?:string;
  referralPartnerName?:string;
  referralPartnerStatus?:"Active"|"Inactive";
  createdAt: string;
  version: number;
}

export interface DuplicateMatch {
  householdId: string;
  householdName: string;
  contactId: string;
  contactName: string;
  reasons: Array<"exact_email" | "exact_phone" | "normalized_full_name">;
  email?: string;
  phone?: string;
  households?: Array<{ householdId: string; householdName: string; householdStatus: string; relationship: string; isPrimary: boolean }>;
}

export interface ClientBookContactOption { id:string; name:string; email?:string; phone?:string }
export interface ReferralPartnerOption { id:string; name:string; organisationName?:string;status?:"Active"|"Inactive" }

export interface ClientBookListSnapshot {
  rows: ClientBookListItem[];
  total: number;
  page: number;
  pageSize: number;
  memberships: Array<{ id: string; displayName: string }>;
  brokers: Array<{ id:string; displayName:string }>;
  referralPartners: ReferralPartnerOption[];
}

export interface ClientBookDetailSnapshot {
  household: ClientBookListItem & { referralPartnerId?: string; primaryContact:ClientBookListItem["primaryContact"] & { preferredContactMethod?:string; version:number } };
  members: Array<{ contactId: string; name: string; email?: string; phone?: string; relationship: string; isPrimary: boolean }>;
  consent: Array<{
    contactId: string;
    contactName: string;
    channel: "Email" | "SMS" | "Phone";
    status: "Recorded" | "Not recorded" | "Opted out" | "Missing";
    evidenceId?: string;
    source?: string;
    effectiveAt?: string;
    recordedAt?: string;
  }>;
  notes?: Array<{ id: string; body: string; authorName?: string; createdAt: string }>;
  loans: Array<{ id: string; rateType?: "Fixed" | "Variable" | "Split"; externalReference?: string; lenderName: string; loanPurpose: string; settlementDate?: string; fixedRateExpiryDate?: string; lastReviewDate?: string; nextReviewDate?: string; status: string; source: string; dataConfidence: string; version: number }>;
  conversion?: { id: string; leadId: string; convertedAt: string; convertedByMembershipId: string };
  tasks: Array<{ id: string; title: string; dueAt: string; status: string; priority: string; assignedMembershipId: string; version:number }>;
  opportunities: Array<{ id: string; loanRecordId: string; type: string; triggerDate: string; status: string; ownerMembershipId?: string; ownerName?: string; version: number; completedAt?: string; dismissalReason?: string }>;
  memberships: Array<{ id: string; displayName: string; position: string }>;
  referralPartners: ReferralPartnerOption[];
  activities: Array<{ id: string; eventType: string; summary: string; occurredAt: string; actorMembershipId?: string }>;
}

export interface ManualContactInput {
  existingContactId?:string;
  firstName?:string;
  lastName?:string;
  email?:string;
  phone?:string;
  preferredContactMethod?:"Phone"|"Email"|"SMS";
  nameMatchAcknowledged?:boolean;
}
export interface ManualHouseholdOperationInput {
  commandId:string; displayName:string; ownerMembershipId:string; referralPartnerId?:string;
  primary:ManualContactInput;
  joint?:ManualContactInput & { relationship:"Joint applicant"|"Guarantor"|"Other" };
}

export interface RetentionTodayRow {
  opportunityId: string;
  householdId: string;
  householdName: string;
  triggerType: string;
  triggerDate: string;
  effectiveStatus: string;
  ownerMembershipId?: string;
  ownerName?: string;
  version: number;
}

export interface RetentionTodaySnapshot {
  businessDate: string;
  annualDueTotal: number;
  fixedApproachingTotal: number;
  unassignedTotal: number;
  annualDue: RetentionTodayRow[];
  fixedApproaching: RetentionTodayRow[];
  unassigned: RetentionTodayRow[];
}

export interface MinimalLoanOperationInput {
  commandId: string;
  householdId: string;
  externalReference?: string;
  lenderName: string;
  loanPurpose: string;
  settlementDate?: string;
  fixedRateExpiryDate?: string;
  lastReviewDate?: string;
  nextReviewDate?: string;
  status: "Active" | "Discharged" | "Unknown";
  dataConfidence: "Confirmed" | "Unverified";
}

export interface LoanDateOperationInput {
  commandId: string;
  loanRecordId: string;
  expectedVersion: number;
  nextReviewDate?: string;
  fixedRateExpiryDate?: string;
  lastReviewDate?: string;
}

export interface PersistentConversionInput {
  commandId: string;
  leadId: string;
  expectedVersion: number;
  duplicateDecision: "create-new" | "add-existing";
  displayName: string;
  ownerMembershipId: string;
  referralPartnerId?: string;
  existingHouseholdId?: string;
  joint?: { existingContactId?: string; firstName?: string; lastName?: string; email?: string; phone?: string; preferredContactMethod?: string; relationship: "Joint applicant" | "Guarantor" | "Other" };
  loan?: { externalReference?: string; lenderName: string; loanPurpose: string; settlementDate?: string; fixedRateExpiryDate?: string; lastReviewDate?: string; nextReviewDate?: string; status: string; dataConfidence: string };
}
