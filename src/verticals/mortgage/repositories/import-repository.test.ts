import { describe, expect, it } from "vitest";
import { createFixtureState } from "@/verticals/mortgage/fixtures";
import { parseCsv } from "@/verticals/mortgage/imports/csv";
import { autoMapColumns, readImportRows, type ImportKind } from "@/verticals/mortgage/imports/model";
import { InMemoryImportRepository } from "./import-repository";

const admin = { organisationId: "brk_harbour", userId: "usr_alex" } as const;
const dana = { organisationId: "brk_harbour", userId: "usr_dana" } as const;
const ranges = { organisationId: "brk_ranges", userId: "usr_priya" } as const;
const setup = () => { const state = createFixtureState(); return { state, repo: new InMemoryImportRepository(state, () => new Date("2026-11-14T12:00:00+11:00")) }; };
const records = (repo: InMemoryImportRepository, context: typeof admin, kind: ImportKind, csv: string, defaultOwner?: string) => { const parsed = parseCsv(csv); return readImportRows(kind, parsed.rows, autoMapColumns(kind, parsed.headers), repo.owners(context), defaultOwner).records; };

const clientsCsv = "Household,First name,Last name,Email,Phone,Lender,Rate type,Fixed rate ends,Next review,Loan balance\nHarbour Test,Ivy,Test,ivy.import@example.test,,Example Mutual,Fixed,2026-12-01,2026-11-20,450000\nHarbour Test,Max,Test,,0499 000 111,,,,,\n";

describe("fixture CSV import", () => {
  it("creates households, contacts with Not recorded consent, minimal loans and review opportunities, audited as import", () => {
    const { state, repo } = setup();
    const before = { households: state.households.length, opportunities: state.reviewOpportunities.length };
    const result = repo.run(admin, "clients", records(repo, admin, "clients", clientsCsv, "mem_h_broker1"));
    expect(result).toEqual([{ rows: [2, 3], label: "Harbour Test", outcome: "created", detail: undefined }]);
    const household = state.households.at(-1)!;
    expect(state.households.length).toBe(before.households + 1);
    expect(state.householdMembers.filter(item => item.householdId === household.id).map(item => item.relationship)).toEqual(["Primary applicant", "Joint applicant"]);
    const loan = state.loanRecords.find(item => item.householdId === household.id)!;
    expect(loan).toMatchObject({ lenderName: "Example Mutual", rateType: "Fixed", fixedRateExpiryDate: "2026-12-01", source: "CSV import", dataConfidence: "Unverified" });
    expect(JSON.stringify(loan)).not.toContain("450000");
    expect(state.reviewOpportunities.length).toBeGreaterThan(before.opportunities);
    expect(state.consentRecords.filter(item => item.subjectReference.id === household.id).every(item => item.status === "Not recorded" && item.provenance === "CSV import")).toBe(true);
    const events = state.activities.filter(item => item.subjectReference?.id === household.id);
    expect(events.length).toBeGreaterThanOrEqual(3);
    expect(events.every(item => item.actorType === "import" && item.actorMembershipId === "mem_h_admin")).toBe(true);
  });
  it("never duplicates when the same file is imported again", () => {
    const { state, repo } = setup();
    repo.run(admin, "clients", records(repo, admin, "clients", clientsCsv, "mem_h_broker1"));
    const counts = () => [state.households.length, state.contacts.length, state.loanRecords.length];
    const after = counts();
    expect(repo.run(admin, "clients", records(repo, admin, "clients", clientsCsv, "mem_h_broker1"))[0]).toMatchObject({ outcome: "exists", detail: "Already exists (matched on email)" });
    expect(counts()).toEqual(after);
  });
  it("imports leads as New with Not recorded consent and skips existing leads by email or phone", () => {
    const { state, repo } = setup();
    const existing = state.leads.find(item => item.organisationId === "brk_harbour")!;
    const csv = `First name,Last name,Email,Phone,Source\nNew,Person,new.person@example.test,,Website enquiry\nSame,Email,${existing.email.toUpperCase()},,\n`;
    const result = repo.run(admin, "leads", records(repo, admin, "leads", csv));
    expect(result.map(item => item.outcome)).toEqual(["created", "exists"]);
    expect(state.leads[0]).toMatchObject({ firstName: "New", status: "New", source: "Website enquiry", ownerMembershipId: undefined, consentSummary: { email: "Not recorded", sms: "Not recorded", phone: "Not recorded", source: "CSV import" } });
    expect(state.activities.at(-1)).toMatchObject({ type: "lead.created", summary: "Lead imported from CSV", actorType: "import" });
  });
  it("imports partners with a next step and matches on name and organisation when no email or phone", () => {
    const { state, repo } = setup();
    const result = repo.run(admin, "partners", records(repo, admin, "partners", "Partner name,Organisation,Partner type,Next step\nMorgan Lee,North Quay Accounting,Accountant,\nRiver Lane,Lane Legal,Conveyancer,Send intro pack\n", "mem_h_broker1"));
    expect(result.map(item => item.outcome)).toEqual(["exists", "created"]);
    expect(state.referralPartners.at(-1)).toMatchObject({ name: "River Lane", type: "Conveyancer", nextStep: "Send intro pack", ownerMembershipId: "mem_h_broker1" });
  });
  it("enforces capabilities and tenancy", () => {
    const { repo } = setup();
    expect(() => repo.run(dana, "partners", [])).toThrow("Import denied");
    expect(() => repo.existing(ranges, "clients")).not.toThrow();
    expect(repo.existing(ranges, "clients").clientContacts.every(item => !item.id.startsWith("person_00") || Number(item.id.slice(-3)) > 10)).toBe(true);
  });
});
