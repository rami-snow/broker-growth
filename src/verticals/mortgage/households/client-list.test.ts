import { describe, expect, it } from "vitest";
import { clientBookSummary, fixedRateEndsWithin, summariseClientRetention } from "./client-list";

describe("client list projection", () => {
  it("shows the soonest fixed-rate expiry and prefers a fixed-rate opportunity over an annual review", () => {
    const summary = summariseClientRetention([
      { householdId: "h1", lenderName: "Lender A", loanPurpose: "Purchase", fixedRateExpiryDate: "2027-03-01", status: "Active" },
      { householdId: "h1", lenderName: "Lender B", loanPurpose: "Refinance", fixedRateExpiryDate: "2027-01-12", status: "Active" },
      { householdId: "h1", lenderName: "Old lender", loanPurpose: "Purchase", fixedRateExpiryDate: "2026-01-01", status: "Discharged" },
    ], [{ householdId: "h1", type: "Annual review", triggerDate: "2026-11-10", status: "Overdue" }, { householdId: "h1", type: "Fixed-rate expiry", triggerDate: "2027-01-12", status: "Upcoming" }]);
    expect(summary).toEqual({ lenderName: "Lender B", loanPurpose: "Refinance", rateType: undefined, fixedRateExpiryDate: "2027-01-12", opportunity: { label: "Fixed-rate expiry", status: "Upcoming" } });
  });
  it("ignores completed, dismissed and not-yet-due annual reviews", () => {
    expect(summariseClientRetention([], [{ householdId: "h", type: "Annual review", triggerDate: "2026-12-01", status: "Upcoming" }, { householdId: "h", type: "Fixed-rate expiry", triggerDate: "2026-12-01", status: "Completed" }]).opportunity).toBeUndefined();
  });
  it("counts summary cards in households, matching what the list filter shows", () => {
    const result = clientBookSummary({
      businessDate: "2026-11-14",
      households: [{ id: "a", status: "Active" }, { id: "b", status: "Active" }, { id: "c", status: "Archived" }, { id: "d", status: "Inactive" }],
      members: [{ householdId: "a", contactId: "p1" }, { householdId: "a", contactId: "p2" }, { householdId: "b", contactId: "p2" }, { householdId: "c", contactId: "p3" }, { householdId: "d", contactId: "p4" }],
      loans: [{ householdId: "a", lenderName: "L", loanPurpose: "Purchase", fixedRateExpiryDate: "2027-01-01", status: "Active" }, { householdId: "a", lenderName: "L", loanPurpose: "Refinance", fixedRateExpiryDate: "2027-02-01", status: "Active" }, { householdId: "b", lenderName: "L", loanPurpose: "Purchase", fixedRateExpiryDate: "2027-03-01", status: "Active" }, { householdId: "c", lenderName: "L", loanPurpose: "Purchase", fixedRateExpiryDate: "2026-12-01", status: "Active" }],
      opportunities: [{ householdId: "a", type: "Annual review", triggerDate: "2026-11-01", status: "Overdue" }, { householdId: "a", type: "Annual review", triggerDate: "2026-10-01", status: "Overdue" }, { householdId: "b", type: "Annual review", triggerDate: "2026-11-01", status: "Review booked" }],
    });
    expect(result).toEqual({ activeHouseholds: 2, peopleInActiveHouseholds: 2, fixedEndingIn90Days: 1, overdueReviews: 1 });
    expect(fixedRateEndsWithin("2027-02-12", "2026-11-14", 90)).toBe(true);
    expect(fixedRateEndsWithin("2027-02-13", "2026-11-14", 90)).toBe(false);
    expect(fixedRateEndsWithin(undefined, "2026-11-14", 90)).toBe(false);
  });
});
