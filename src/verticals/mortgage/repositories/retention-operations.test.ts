import { describe, expect, it } from "vitest";
import { createFixtureState } from "@/verticals/mortgage/fixtures";
import { InMemoryClientBookRepository } from "./client-book-repository";
import { classifyOpportunity, businessDate } from "@/verticals/mortgage/review-opportunities/services";
import { assertRateTypeConsistent } from "@/verticals/mortgage/loans/models";
import { normaliseNextStep } from "@/verticals/mortgage/referrals/models";
import { normaliseHouseholdNote } from "@/verticals/mortgage/households/models";
import { auditActorType } from "@/verticals/mortgage/settings/models";

const admin = { organisationId: "brk_harbour", userId: "usr_alex" } as const;
const otherBrokerage = { organisationId: "brk_ranges", userId: "usr_priya" } as const;
const now = () => new Date("2026-11-14T12:00:00+11:00");
const setup = () => { const state = createFixtureState(); return { state, repo: new InMemoryClientBookRepository(state, now) }; };

describe("4F.3 household notes", () => {
  it("adds a trimmed note with a person audit entry, newest first", () => {
    const { state, repo } = setup();
    repo.addNote(admin, "household_001", "  Called about review timing.  ");
    const notes = repo.listNotes(admin, "household_001");
    expect(notes[0]!.body).toBe("Called about review timing.");
    expect(notes.length).toBe(2);
    expect(state.activities.at(-1)).toMatchObject({ type: "household.note_added", actorType: "person", subjectReference: { id: "household_001" } });
  });
  it("rejects empty or over-long notes, other brokerages and archived households", () => {
    const { state, repo } = setup();
    expect(() => repo.addNote(admin, "household_001", "   ")).toThrow("Write a note first.");
    expect(() => normaliseHouseholdNote("x".repeat(2001))).toThrow("under 2000");
    expect(() => repo.addNote(otherBrokerage, "household_001", "Hello")).toThrow();
    state.households.find(item => item.id === "household_001")!.status = "Archived";
    expect(() => repo.addNote(admin, "household_001", "Hello")).toThrow("Archived");
  });
});

describe("4F.3 rate type", () => {
  it("sets Fixed, Variable or Split with a version bump and audit entry", () => {
    const { state, repo } = setup();
    const variable = state.loanRecords.find(item => item.organisationId === "brk_harbour" && !item.fixedRateExpiryDate)!;
    variable.rateType = undefined;
    const before = variable.version;
    repo.setLoanRateType(admin, variable.id, "Variable");
    expect(variable).toMatchObject({ rateType: "Variable", version: before + 1 });
    expect(state.activities.at(-1)).toMatchObject({ type: "loan.rate_type_set", actorType: "person" });
  });
  it("rejects Variable on a loan with a fixed-rate expiry date, no-op changes and missing capability", () => {
    const { state, repo } = setup();
    const fixed = state.loanRecords.find(item => item.organisationId === "brk_harbour" && item.fixedRateExpiryDate)!;
    expect(() => repo.setLoanRateType(admin, fixed.id, "Variable")).toThrow("cannot have a fixed-rate expiry");
    expect(() => repo.setLoanRateType(admin, fixed.id, fixed.rateType!)).toThrow("already");
    const owner = state.households.find(item => item.id === fixed.householdId)!.ownerMembershipId;
    const otherBroker = owner === "mem_h_broker1" ? { organisationId: "brk_harbour", userId: "usr_marcus" } : { organisationId: "brk_harbour", userId: "usr_dana" };
    expect(() => repo.setLoanRateType(otherBroker, fixed.id, "Split")).toThrow("denied");
    expect(() => assertRateTypeConsistent("Balance" as never)).toThrow("Fixed, Variable or Split");
  });
});

describe("4F.3 partner next step", () => {
  it("sets and clears a manual next step with audit entries", () => {
    const { state, repo } = setup();
    repo.setPartnerNextStep(admin, "referral_harbour_conveyancing", "  Invite to client event ");
    expect(state.referralPartners.find(item => item.id === "referral_harbour_conveyancing")!.nextStep).toBe("Invite to client event");
    repo.setPartnerNextStep(admin, "referral_harbour_conveyancing", "");
    expect(state.referralPartners.find(item => item.id === "referral_harbour_conveyancing")!.nextStep).toBeUndefined();
    expect(state.activities.slice(-2).map(item => item.summary)).toEqual(["Partner next step set", "Partner next step cleared"]);
  });
  it("needs mortgage.referral.manage, stays in the brokerage and limits length", () => {
    const { repo } = setup();
    expect(() => repo.setPartnerNextStep({ organisationId: "brk_harbour", userId: "usr_dana" }, "referral_harbour_conveyancing", "Call")).toThrow("denied");
    expect(() => repo.setPartnerNextStep(otherBrokerage, "referral_harbour_conveyancing", "Call")).toThrow();
    expect(() => normaliseNextStep("x".repeat(201))).toThrow("under 200");
  });
});

describe("4F.3 audit actor and brokerage time zone", () => {
  it("prefers the stored actor type and falls back for legacy entries", () => {
    expect(auditActorType("m1", "import")).toBe("Import");
    expect(auditActorType(null, "system")).toBe("System");
    expect(auditActorType("m1", undefined)).toBe("Person");
    expect(auditActorType(null, undefined)).toBe("System");
  });
  it("classifies review dates in the brokerage zone", () => {
    const instant = new Date("2026-11-14T13:30:00Z"); // 15 Nov in Sydney, 14 Nov in Brisbane
    expect(businessDate(instant, "Australia/Sydney")).toBe("2026-11-15");
    expect(classifyOpportunity("Annual review", "2026-11-14", instant, "Australia/Sydney")).toBe("Overdue");
    expect(classifyOpportunity("Annual review", "2026-11-14", instant, "Australia/Brisbane")).toBe("Due");
  });
  it("gives every fixture brokerage an explicit time zone", () => {
    expect(createFixtureState().organisations.every(item => Boolean(item.timeZone))).toBe(true);
  });
});
