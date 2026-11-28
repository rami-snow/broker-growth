import { loanPurposes, mortgageTimeframes, type LoanPurpose, type MortgageTimeframe } from "@/verticals/mortgage/leads/models";
import { rateTypes, type RateType } from "@/verticals/mortgage/loans/models";
import { mortgageReferralPartnerTypes, NEXT_STEP_MAX_LENGTH, type MortgageReferralPartnerType } from "@/verticals/mortgage/referrals/models";
import { householdRelationships } from "@/verticals/mortgage/households/models";

/**
 * CSV import (brief 4F.3). Records are matched on normalised email or phone, so running the same import
 * again never creates duplicates. Loan records stay minimal; financial columns are ignored, never stored.
 */
export type ImportKind = "leads" | "clients" | "partners";
export const importKinds: Array<{ value: ImportKind; label: string; capability: string }> = [
  { value: "leads", label: "Leads", capability: "lead.create" },
  { value: "clients", label: "Clients and households", capability: "mortgage.household.create" },
  { value: "partners", label: "Referral partners", capability: "mortgage.referral.manage" },
];
export interface ImportField { key: string; label: string; required?: boolean; aliases: string[]; help?: string }

const field = (key: string, label: string, aliases: string[], options: Partial<ImportField> = {}): ImportField => ({ key, label, aliases: [label, key, ...aliases], ...options });
export const importFields: Record<ImportKind, ImportField[]> = {
  leads: [
    field("firstName", "First name", ["given name", "firstname", "first"], { required: true }),
    field("lastName", "Last name", ["surname", "family name", "lastname", "last"], { required: true }),
    field("email", "Email", ["email address", "e-mail"], { help: "Email or phone is required" }),
    field("phone", "Phone", ["mobile", "phone number", "mobile number", "contact number"]),
    field("source", "Source", ["lead source", "channel"], { help: "Blank becomes Other" }),
    field("loanPurpose", "Loan purpose", ["purpose", "loan type", "enquiry type"]),
    field("timeframe", "Timeframe", ["timing", "when"]),
    field("preferredContact", "Preferred contact", ["preferred contact method", "contact method"]),
    field("owner", "Owner", ["broker", "assigned to", "owner name"], { help: "A broker's name as shown in the app" }),
  ],
  clients: [
    field("household", "Household", ["household name", "client group", "family", "account name"], { help: "Rows with the same household are grouped; blank uses the last name" }),
    field("firstName", "First name", ["given name", "firstname", "first"], { required: true }),
    field("lastName", "Last name", ["surname", "family name", "lastname", "last"], { required: true }),
    field("email", "Email", ["email address", "e-mail"], { help: "Email or phone is required" }),
    field("phone", "Phone", ["mobile", "phone number", "mobile number", "contact number"]),
    field("preferredContact", "Preferred contact", ["preferred contact method", "contact method"]),
    field("relationship", "Relationship", ["role", "applicant type"]),
    field("owner", "Owner", ["broker", "assigned to", "owner name"]),
    field("lender", "Lender", ["lender name", "bank"]),
    field("loanPurpose", "Loan purpose", ["purpose"]),
    field("rateType", "Rate type", ["loan type", "rate structure", "fixed or variable"]),
    field("fixedRateExpiryDate", "Fixed rate ends", ["fixed rate expiry", "fixed rate expiry date", "fixed expiry", "fixed until", "fixed rate end date"]),
    field("nextReviewDate", "Next review", ["next review date", "review date", "annual review"]),
  ],
  partners: [
    field("name", "Partner name", ["name", "contact name", "partner"], { required: true }),
    field("organisation", "Organisation", ["company", "business", "organisation name", "firm"]),
    field("type", "Partner type", ["type", "category"]),
    field("email", "Email", ["email address", "e-mail"]),
    field("phone", "Phone", ["mobile", "phone number"]),
    field("owner", "Owner", ["broker", "relationship owner", "assigned to"]),
    field("nextStep", "Next step", ["next action", "follow up"]),
  ],
};

const key = (value: string) => value.toLowerCase().replace(/[’']/g, "").replace(/[^a-z0-9]+/g, " ").trim();
/** Columns that look like financial data. They are reported as ignored and never read. */
const FINANCIAL = /\b(balance|loan amount|amount|interest|rate$|rate %|repayment|income|salary|expense|asset|liabilit|credit|valuation|lvr|security value|limit)\b/;
export const isFinancialColumn = (header: string) => { const k = key(header); return k !== "rate type" && !k.startsWith("fixed rate") && FINANCIAL.test(k); };

export type ColumnMapping = Record<string, number | undefined>;
/** Matches headers to fields by name or alias, ignoring case and punctuation. */
export function autoMapColumns(kind: ImportKind, headers: string[]): ColumnMapping {
  const used = new Set<number>(), mapping: ColumnMapping = {};
  for (const definition of importFields[kind]) {
    const names = definition.aliases.map(key);
    const index = headers.findIndex((header, column) => !used.has(column) && !isFinancialColumn(header) && names.includes(key(header)));
    if (index >= 0) { mapping[definition.key] = index; used.add(index); }
  }
  return mapping;
}
export function ignoredColumns(headers: string[], mapping: ColumnMapping) {
  const used = new Set(Object.values(mapping).filter((value): value is number => value !== undefined));
  return headers.flatMap((header, column) => used.has(column) ? [] : [{ header, reason: isFinancialColumn(header) ? "Financial data is never stored" : "Not used" }]);
}

export const normaliseEmail = (value?: string) => value?.trim().toLowerCase() || undefined;
export const normalisePhone = (value?: string) => value?.replace(/[^0-9]/g, "") || undefined;
export const normaliseName = (first: string, last: string) => `${first.trim()} ${last.trim()}`.toLowerCase();
export const normalisePartnerText = (value?: string) => value?.trim().toLowerCase().replace(/\s+/g, " ") || undefined;
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export interface ImportOwner { id: string; name: string; isBroker: boolean }
export interface LeadImportRecord { kind: "leads"; rows: number[]; label: string; firstName: string; lastName: string; email?: string; phone?: string; source: string; loanPurpose: LoanPurpose; timeframe: MortgageTimeframe; preferredContactMethod: "Phone" | "Email" | "SMS"; ownerMembershipId?: string }
export interface HouseholdImportMember { firstName: string; lastName: string; email?: string; phone?: string; preferredContactMethod: "Phone" | "Email" | "SMS"; relationship: (typeof householdRelationships)[number] }
export interface HouseholdImportLoan { lenderName: string; loanPurpose: LoanPurpose; rateType?: RateType; fixedRateExpiryDate?: string; nextReviewDate?: string }
export interface HouseholdImportRecord { kind: "clients"; rows: number[]; label: string; displayName: string; ownerMembershipId: string; members: HouseholdImportMember[]; loans: HouseholdImportLoan[] }
export interface PartnerImportRecord { kind: "partners"; rows: number[]; label: string; name: string; organisationName?: string; type: MortgageReferralPartnerType; email?: string; phone?: string; ownerMembershipId: string; nextStep?: string }
export type ImportRecord = LeadImportRecord | HouseholdImportRecord | PartnerImportRecord;
export interface ImportRowError { rows: number[]; label: string; message: string }

const pick = <T extends string>(value: string | undefined, allowed: readonly T[], fallback: T | undefined, label: string): T | undefined => {
  if (!value) return fallback;
  const match = allowed.find(item => key(item) === key(value));
  if (!match) throw new Error(`${label} "${value}" is not one of: ${allowed.join(", ")}`);
  return match;
};
/** Accepts YYYY-MM-DD and Australian DD/MM/YYYY; returns YYYY-MM-DD. */
export function parseImportDate(value: string | undefined, label: string) {
  if (!value) return undefined;
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value), au = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  const [y, m, d] = iso ? [iso[1], iso[2], iso[3]] : au ? [au[3], au[2], au[1]] : [];
  const date = y ? new Date(Date.UTC(Number(y), Number(m) - 1, Number(d))) : undefined;
  if (!date || date.getUTCMonth() !== Number(m) - 1 || date.getUTCDate() !== Number(d)) throw new Error(`${label} "${value}" is not a date. Use YYYY-MM-DD or DD/MM/YYYY.`);
  return date.toISOString().slice(0, 10);
}
function resolveOwner(name: string | undefined, owners: ImportOwner[], fallback: string | undefined, required: boolean) {
  if (name) { const owner = owners.find(item => item.name.toLowerCase() === name.trim().toLowerCase()); if (!owner) throw new Error(`Owner "${name}" is not a member of this brokerage`); if (required && !owner.isBroker) throw new Error(`Owner "${name}" is not a broker`); return owner.id; }
  if (required && !fallback) throw new Error("Owner is required. Add an Owner column or choose a default owner");
  return fallback;
}
function contactDetails(row: Record<string, string>) {
  const email = normaliseEmail(row.email), phone = normalisePhone(row.phone);
  if (!email && !phone) throw new Error("Email or phone is required, so the row can be matched next time");
  if (email && !EMAIL.test(email)) throw new Error(`Email "${row.email}" is not valid`);
  if (phone && phone.length < 8) throw new Error(`Phone "${row.phone}" is too short`);
  if (!row.firstName?.trim() || !row.lastName?.trim()) throw new Error("First and last name are required");
  const preferred = pick(row.preferredContact, ["Phone", "Email", "SMS"] as const, email ? "Email" : "Phone", "Preferred contact")!;
  return { firstName: row.firstName.trim(), lastName: row.lastName.trim(), email, phone, preferredContactMethod: preferred };
}

/** Reads mapped CSV rows into typed records. Row numbers are file line numbers (the header is line 1). */
export function readImportRows(kind: ImportKind, rows: string[][], mapping: ColumnMapping, owners: ImportOwner[], defaultOwnerId?: string): { records: ImportRecord[]; errors: ImportRowError[] } {
  const values = rows.map((cells, index) => ({ line: index + 2, row: Object.fromEntries(Object.entries(mapping).filter(([, column]) => column !== undefined).map(([name, column]) => [name, cells[column!] ?? ""])) as Record<string, string> }));
  const records: ImportRecord[] = [], errors: ImportRowError[] = [];
  const attempt = (lines: number[], label: string, work: () => void) => { try { work(); } catch (cause) { errors.push({ rows: lines, label, message: cause instanceof Error ? cause.message : "Invalid row" }); } };
  if (kind === "leads") for (const { line, row } of values) attempt([line], `${row.firstName ?? ""} ${row.lastName ?? ""}`.trim() || `Row ${line}`, () => {
    const contact = contactDetails(row);
    records.push({ kind, rows: [line], label: `${contact.firstName} ${contact.lastName}`, ...contact, source: row.source?.trim() || "Other", loanPurpose: pick(row.loanPurpose, loanPurposes, "Other", "Loan purpose")!, timeframe: pick(row.timeframe, mortgageTimeframes, "Researching", "Timeframe")!, ownerMembershipId: resolveOwner(row.owner, owners, defaultOwnerId, false) });
  });
  if (kind === "partners") for (const { line, row } of values) attempt([line], row.name?.trim() || `Row ${line}`, () => {
    if (!row.name?.trim()) throw new Error("Partner name is required");
    const email = normaliseEmail(row.email), phone = normalisePhone(row.phone);
    if (email && !EMAIL.test(email)) throw new Error(`Email "${row.email}" is not valid`);
    if (row.nextStep && row.nextStep.trim().length > NEXT_STEP_MAX_LENGTH) throw new Error(`Next step is longer than ${NEXT_STEP_MAX_LENGTH} characters`);
    records.push({ kind, rows: [line], label: row.name.trim(), name: row.name.trim(), organisationName: row.organisation?.trim() || undefined, type: pick(row.type, mortgageReferralPartnerTypes, "Other", "Partner type")!, email, phone, ownerMembershipId: resolveOwner(row.owner, owners, defaultOwnerId, true)!, nextStep: row.nextStep?.trim() || undefined });
  });
  if (kind === "clients") {
    const groups = new Map<string, typeof values>();
    for (const value of values) { const name = value.row.household?.trim() || `${value.row.lastName?.trim() || "Unnamed"} household`; const group = groups.get(name.toLowerCase()) ?? []; group.push(value); groups.set(name.toLowerCase(), group); }
    for (const group of groups.values()) {
      const lines = group.map(item => item.line), displayName = group[0]!.row.household?.trim() || `${group[0]!.row.lastName?.trim() || "Unnamed"} household`;
      attempt(lines, displayName, () => {
        const members = group.map(({ line, row }, index) => { try { return { ...contactDetails(row), relationship: pick(row.relationship, householdRelationships, index === 0 ? "Primary applicant" : "Joint applicant", "Relationship")! }; } catch (cause) { throw new Error(`Line ${line}: ${cause instanceof Error ? cause.message : "invalid"}`); } });
        const primaries = members.filter(member => member.relationship === "Primary applicant").length;
        if (primaries !== 1) throw new Error(primaries ? "Only one Primary applicant per household" : "One person must be the Primary applicant");
        members.sort((a, b) => Number(b.relationship === "Primary applicant") - Number(a.relationship === "Primary applicant"));
        const loans = group.flatMap(({ line, row }) => { if (!row.lender?.trim()) { if (row.rateType || row.fixedRateExpiryDate || row.nextReviewDate) throw new Error(`Line ${line}: loan details need a lender`); return []; }
          const rateType = pick(row.rateType, rateTypes, undefined, "Rate type"), fixedRateExpiryDate = parseImportDate(row.fixedRateExpiryDate, "Fixed rate ends");
          if (rateType === "Variable" && fixedRateExpiryDate) throw new Error(`Line ${line}: a Variable loan cannot have a fixed rate end date`);
          return [{ lenderName: row.lender.trim(), loanPurpose: pick(row.loanPurpose, loanPurposes, "Other", "Loan purpose")!, rateType, fixedRateExpiryDate, nextReviewDate: parseImportDate(row.nextReviewDate, "Next review") }]; });
        const ownerName = group.find(item => item.row.owner?.trim())?.row.owner;
        records.push({ kind, rows: lines, label: displayName, displayName, ownerMembershipId: resolveOwner(ownerName, owners, defaultOwnerId, true)!, members, loans });
      });
    }
  }
  return { records, errors };
}

/** Existing records the plan matches against, already normalised. */
export interface ImportExisting {
  leadContacts: Array<{ email?: string; phone?: string }>;
  clientContacts: Array<{ id: string; email?: string; phone?: string; inHousehold: boolean }>;
  partners: Array<{ email?: string; phone?: string; name: string; organisation?: string }>;
}
export type ImportItemStatus = { status: "new"; note?: string } | { status: "exists"; matchedOn: string } | { status: "repeated"; firstRows: number[] };
export type ImportPlanItem = { record: ImportRecord } & ImportItemStatus;

/** Decides, per record, whether it is new, already exists (by email or phone), or repeats an earlier row in the file. */
export function planImport(records: ImportRecord[], existing: ImportExisting): ImportPlanItem[] {
  const seen: Array<{ email?: string; phone?: string; nameKey?: string; rows: number[] }> = [];
  const firstSeen = (email?: string, phone?: string, nameKey?: string) => seen.find(item => (email && item.email === email) || (phone && item.phone === phone) || (nameKey && !email && !phone && item.nameKey === nameKey));
  return records.map(record => {
    if (record.kind === "leads") {
      const repeat = firstSeen(record.email, record.phone); if (repeat) return { record, status: "repeated", firstRows: repeat.rows };
      seen.push({ email: record.email, phone: record.phone, rows: record.rows });
      const match = existing.leadContacts.find(item => (record.email && item.email === record.email) || (record.phone && item.phone === record.phone));
      return match ? { record, status: "exists", matchedOn: record.email && match.email === record.email ? "email" : "phone" } : { record, status: "new" };
    }
    if (record.kind === "partners") {
      const nameKey = `${normalisePartnerText(record.name)}|${normalisePartnerText(record.organisationName) ?? ""}`;
      const repeat = firstSeen(record.email, record.phone, nameKey); if (repeat) return { record, status: "repeated", firstRows: repeat.rows };
      seen.push({ email: record.email, phone: record.phone, nameKey, rows: record.rows });
      const match = existing.partners.find(item => (record.email && item.email === record.email) || (record.phone && item.phone === record.phone) || (!record.email && !record.phone && `${normalisePartnerText(item.name)}|${normalisePartnerText(item.organisation) ?? ""}` === nameKey));
      return match ? { record, status: "exists", matchedOn: record.email && match.email === record.email ? "email" : record.phone && match.phone === record.phone ? "phone" : "name and organisation" } : { record, status: "new" };
    }
    for (const member of record.members) { const repeat = firstSeen(member.email, member.phone); if (repeat) return { record, status: "repeated", firstRows: repeat.rows }; }
    for (const member of record.members) seen.push({ email: member.email, phone: member.phone, rows: record.rows });
    const matches = record.members.map(member => existing.clientContacts.find(item => (member.email && item.email === member.email) || (member.phone && item.phone === member.phone)));
    const inHousehold = matches.find(match => match?.inHousehold);
    if (inHousehold) return { record, status: "exists", matchedOn: inHousehold.email && record.members.some(member => member.email === inHousehold.email) ? "email" : "phone" };
    const reused = matches.filter(Boolean).length;
    return { record, status: "new", note: reused ? `Links ${reused} existing ${reused === 1 ? "contact" : "contacts"} without a household` : undefined };
  });
}

export const importSummary = (items: ImportPlanItem[], errors: ImportRowError[]) => ({ create: items.filter(item => item.status === "new").length, existing: items.filter(item => item.status === "exists").length, repeated: items.filter(item => item.status === "repeated").length, errors: errors.length });

const failureMessages: Array<[RegExp, string]> = [
  [/ACTIVE_BROKER_OWNER_REQUIRED/, "Owner must be an active broker in this brokerage"],
  [/ACTIVE_ASSIGNEE_REQUIRED/, "Owner must be an active member of this brokerage"],
  [/HOUSEHOLD_OWNER_SELF_ASSIGNMENT_REQUIRED/, "You can only make yourself the owner of imported households"],
  [/CAPABILITY_REQUIRED:lead\.assign/, "Assigning an owner needs permission to assign leads"],
  [/CAPABILITY_REQUIRED:mortgage\.loan-record\.manage/, "Importing loans needs permission to manage loan records"],
  [/CAPABILITY_REQUIRED/, "You do not have permission to import this"],
  [/VALID_CONTACT_REQUIRED/, "Name and a valid email or phone are required"],
  [/VARIABLE_RATE_WITH_FIXED_EXPIRY/, "A Variable loan cannot have a fixed-rate end date"],
  [/VALID_RATE_TYPE_REQUIRED/, "Rate type must be Fixed, Variable or Split"],
  [/LENDER_REQUIRED/, "Lender is required for each loan"],
  [/INVALID_MORTGAGE_LEAD_DETAILS/, "Loan purpose or timeframe is not a recognised value"],
  [/VALID_REFERRAL_PARTNER_TYPE_REQUIRED/, "Partner type is not a recognised value"],
  [/REFERRAL_NAME_REQUIRED/, "Partner name is required"],
  [/VALID_HOUSEHOLD_RELATIONSHIP_REQUIRED/, "Each household needs exactly one Primary applicant, listed first"],
  [/HOUSEHOLD_DISPLAY_NAME_REQUIRED/, "Household name and at least one member are required"],
  [/unique|duplicate key/i, "A matching record was created at the same time; import the file again to match it"],
];
/** Turns a database refusal code into a sentence for the results table. */
export const importFailureMessage = (detail: string | undefined) => failureMessages.find(([pattern]) => pattern.test(detail ?? ""))?.[1] ?? "This record could not be imported";

/** Record fields sent to public.import_mortgage_records (the line numbers and label stay in the browser). */
export const importPayload = (record: ImportRecord) => Object.fromEntries(Object.entries(record).filter(([key]) => key !== "rows" && key !== "label"));
