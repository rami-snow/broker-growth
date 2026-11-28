/** Read-only Settings data shared by fixture and Supabase runtimes. */
export type AuditActorType = "Person" | "System" | "Import";
export interface SettingsMember { id: string; name: string; position?: string; status: string; capabilities: string[] }
export interface SettingsAuditEntry { id: string; occurredAt: string; actorType: AuditActorType; actorName?: string; record?: string; summary: string }
export interface SettingsSnapshot {
  brokerage: { name: string; region?: string | null };
  currentMembershipId: string;
  members: SettingsMember[];
  audit: SettingsAuditEntry[];
}
export const AUDIT_LIMIT = 50;

/** Entity types stored on audit events, in the words the mortgage UI uses. */
export const auditRecordLabel = (entityType: string) => ({ lead: "Lead", "mortgage.household": "Household", mortgage_household: "Household", household: "Household", "mortgage.review-opportunity": "Review", opportunity: "Review", "mortgage.referral-partner": "Referral partner", "mortgage.referral_partner": "Referral partner", referral_partner: "Referral partner", campaign: "Campaign", task: "Task", appointment: "Appointment", contact: "Contact" } as Record<string, string>)[entityType] ?? entityType.replace(/[._-]+/g, " ").replace(/^\w/, letter => letter.toUpperCase());

/** Uses the stored actor type (4F.3 a); legacy entries without one are a Person when a member is present, otherwise System. */
export const auditActorType = (actorMembershipId: string | null | undefined, stored?: string | null): AuditActorType => stored === "import" ? "Import" : stored === "system" ? "System" : stored === "person" ? "Person" : actorMembershipId ? "Person" : "System";
