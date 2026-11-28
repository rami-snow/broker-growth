import { describe, expect, it } from "vitest";
import { MAX_IMPORT_ROWS, parseCsv } from "./csv";
import { autoMapColumns, ignoredColumns, importSummary, isFinancialColumn, parseImportDate, planImport, readImportRows, type ImportExisting } from "./model";

const owners = [{ id: "m_dana", name: "Dana Ellis", isBroker: true }, { id: "m_alex", name: "Alex Morgan", isBroker: false }];
const none: ImportExisting = { leadContacts: [], clientContacts: [], partners: [] };
const read = (kind: Parameters<typeof readImportRows>[0], csv: string, defaultOwner?: string) => { const parsed = parseCsv(csv); return readImportRows(kind, parsed.rows, autoMapColumns(kind, parsed.headers), owners, defaultOwner); };

describe("CSV parsing", () => {
  it("handles quotes, embedded commas and newlines, CRLF, BOM and blank lines", () => {
    const parsed = parseCsv('﻿Name,Note\r\n"Lee, Morgan","Said ""hi""\nthen left"\r\n\r\nAsh,plain\n');
    expect(parsed.headers).toEqual(["Name", "Note"]);
    expect(parsed.rows).toEqual([["Lee, Morgan", 'Said "hi"\nthen left'], ["Ash", "plain"]]);
  });
  it("pads short rows, rejects unclosed quotes, empty files and too many rows", () => {
    expect(parseCsv("a,b,c\n1").rows).toEqual([["1", "", ""]]);
    expect(() => parseCsv('a\n"open')).toThrow("unclosed quote");
    expect(() => parseCsv("")).toThrow("empty");
    expect(() => parseCsv(`a\n${"x\n".repeat(MAX_IMPORT_ROWS + 1)}`)).toThrow(`at most ${MAX_IMPORT_ROWS}`);
  });
});

describe("column mapping", () => {
  it("maps common CRM headers and ignores financial columns", () => {
    const headers = ["Given Name", "Surname", "E-mail", "Mobile", "Lender", "Loan Balance", "Interest Rate", "Rate Type", "Fixed Rate Expiry", "Household"];
    const mapping = autoMapColumns("clients", headers);
    expect(mapping).toMatchObject({ firstName: 0, lastName: 1, email: 2, phone: 3, lender: 4, rateType: 7, fixedRateExpiryDate: 8, household: 9 });
    expect(ignoredColumns(headers, mapping)).toEqual([{ header: "Loan Balance", reason: "Financial data is never stored" }, { header: "Interest Rate", reason: "Financial data is never stored" }]);
    expect(isFinancialColumn("Rate type")).toBe(false);
    expect(isFinancialColumn("Repayment amount")).toBe(true);
  });
});

describe("reading rows", () => {
  it("reads leads with defaults and reports invalid rows by line number", () => {
    const { records, errors } = read("leads", "First name,Last name,Email,Phone,Loan purpose,Owner\nMila,Hart,MILA@Example.test,,Purchase,Dana Ellis\nNo,Contact,,,,\nBad,Purpose,bad@example.test,,Yacht,\n");
    expect(records).toEqual([{ kind: "leads", rows: [2], label: "Mila Hart", firstName: "Mila", lastName: "Hart", email: "mila@example.test", phone: undefined, preferredContactMethod: "Email", source: "Other", loanPurpose: "Purchase", timeframe: "Researching", ownerMembershipId: "m_dana" }]);
    expect(errors.map(error => [error.rows, error.message])).toEqual([[[3], "Email or phone is required, so the row can be matched next time"], [[4], expect.stringContaining('Loan purpose "Yacht"')]]);
  });
  it("groups client rows into households with one primary applicant and minimal loans", () => {
    const { records, errors } = read("clients", "Household,First name,Last name,Email,Relationship,Lender,Rate type,Fixed rate ends,Next review\nMarch household,Ruby,March,ruby@example.test,,Example Mutual,Fixed,20/11/2026,2026-12-01\nMarch household,Ben,March,ben@example.test,Joint applicant,,,,\n", "m_dana");
    expect(errors).toEqual([]);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ kind: "clients", rows: [2, 3], displayName: "March household", ownerMembershipId: "m_dana", members: [{ firstName: "Ruby", relationship: "Primary applicant" }, { firstName: "Ben", relationship: "Joint applicant" }], loans: [{ lenderName: "Example Mutual", rateType: "Fixed", fixedRateExpiryDate: "2026-11-20", nextReviewDate: "2026-12-01", loanPurpose: "Other" }] });
  });
  it("rejects a Variable loan with a fixed end date, unknown owners and non-broker owners", () => {
    expect(read("clients", "First name,Last name,Email,Lender,Rate type,Fixed rate ends\nA,B,a@example.test,L,Variable,2027-01-01\n", "m_dana").errors[0]!.message).toContain("Variable");
    expect(read("partners", "Partner name,Owner\nNorth Quay,Nobody\n").errors[0]!.message).toContain("not a member");
    expect(read("partners", "Partner name,Owner\nNorth Quay,Alex Morgan\n").errors[0]!.message).toContain("not a broker");
    expect(read("clients", "First name,Last name,Email\nA,B,a@example.test\n").errors[0]!.message).toContain("Owner is required");
  });
  it("parses Australian and ISO dates and rejects impossible ones", () => {
    expect(parseImportDate("5/3/2027", "Date")).toBe("2027-03-05");
    expect(parseImportDate("2027-03-05", "Date")).toBe("2027-03-05");
    expect(() => parseImportDate("31/02/2027", "Date")).toThrow("not a date");
  });
});

describe("duplicate plan", () => {
  it("matches leads on email or phone and flags rows repeated within the file", () => {
    const { records } = read("leads", "First name,Last name,Email,Phone\nA,One,a@example.test,\nB,Two,,0400 111 222\nC,Three,c@example.test,\nC,Again,C@example.test,\n");
    const plan = planImport(records, { ...none, leadContacts: [{ email: "a@example.test" }, { phone: "0400111222" }] });
    expect(plan.map(item => item.status === "exists" ? `exists:${item.matchedOn}` : item.status)).toEqual(["exists:email", "exists:phone", "new", "repeated"]);
    expect(importSummary(plan, [])).toEqual({ create: 1, existing: 2, repeated: 1, errors: 0 });
  });
  it("matches email case-insensitively with spaces trimmed, and phones across +61 and 0 forms", () => {
    const { records } = read("leads", "First name,Last name,Email,Phone\nA,One,  Ana.One@Example.TEST ,\nB,Two,,+61 (0) 400 333 444\nC,Three,,0061 400 555 666\n");
    expect(records.map(record => record.kind === "leads" && [record.email, record.phone])).toEqual([["ana.one@example.test", undefined], [undefined, "0400333444"], [undefined, "0400555666"]]);
    const plan = planImport(records, { ...none, leadContacts: [{ email: "ana.one@example.test" }, { phone: "0400333444" }, { phone: "0400555666" }] });
    expect(plan.map(item => item.status === "exists" ? item.matchedOn : item.status)).toEqual(["email", "phone", "phone"]);
    const repeated = planImport(read("leads", "First name,Last name,Phone\nA,One,0400 777 888\nB,Two,+61400777888\n").records, none);
    expect(repeated[1]).toMatchObject({ status: "repeated", firstRows: [2] });
  });
  it("is idempotent: re-running the same file after import creates nothing", () => {
    const csv = "Household,First name,Last name,Email,Phone\nCove,Amelia,Cove,amelia@example.test,\nCove,Jonah,Cove,,0490 100 004\n";
    const { records } = read("clients", csv, "m_dana");
    expect(planImport(records, none)[0]!.status).toBe("new");
    const afterImport: ImportExisting = { ...none, clientContacts: [{ id: "c1", email: "amelia@example.test", inHousehold: true }, { id: "c2", phone: "0490100004", inHousehold: true }] };
    expect(planImport(records, afterImport)[0]).toMatchObject({ status: "exists", matchedOn: "email" });
  });
  it("links an existing contact that has no household instead of duplicating it", () => {
    const { records } = read("clients", "First name,Last name,Email\nMila,Hart,mila@example.test\n", "m_dana");
    expect(planImport(records, { ...none, clientContacts: [{ id: "lead_contact", email: "mila@example.test", inHousehold: false }] })[0]).toMatchObject({ status: "new", note: "Links 1 existing contact without a household" });
  });
  it("matches partners on email, phone, or name and organisation when neither is given", () => {
    const { records } = read("partners", "Partner name,Organisation,Email\nMorgan Lee,North Quay Accounting,\nTaylor Finch,Finch Conveyancing,taylor@example.test\nNew Person,,\n", "m_dana");
    const plan = planImport(records, { ...none, partners: [{ name: "morgan  lee", organisation: "North Quay accounting" }, { email: "taylor@example.test", name: "Taylor F" }] });
    expect(plan.map(item => item.status === "exists" ? `exists:${item.matchedOn}` : item.status)).toEqual(["exists:name and organisation", "exists:email", "new"]);
  });
});
