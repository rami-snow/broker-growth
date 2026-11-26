import { describe, expect, it } from "vitest";
import { partnerStats, partnerSummary, relationshipStatus } from "./relationship";

const now = new Date("2026-11-14T01:00:00Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86400000).toISOString();

describe("referral partner relationship", () => {
  it("derives status only from time since the last referral", () => {
    const partner = { status: "Active", createdAt: daysAgo(400) };
    expect(relationshipStatus(partner, daysAgo(5), now)).toBe("Strong");
    expect(relationshipStatus(partner, daysAgo(45), now)).toBe("Active");
    expect(relationshipStatus(partner, daysAgo(90), now)).toBe("Cooling");
    expect(relationshipStatus(partner, daysAgo(200), now)).toBe("Dormant");
    expect(relationshipStatus(partner, undefined, now)).toBe("Dormant");
    expect(relationshipStatus({ status: "Active", createdAt: daysAgo(10) }, undefined, now)).toBe("New");
    expect(relationshipStatus({ status: "Inactive", createdAt: daysAgo(10) }, daysAgo(1), now)).toBe("Inactive");
  });
  it("counts referrals, conversions and a conversion rate that excludes Closed leads", () => {
    const leads = [
      { referralPartnerId: "a", createdAt: daysAgo(10), status: "Converted" },
      { referralPartnerId: "a", createdAt: daysAgo(20), status: "Closed" },
      { referralPartnerId: "a", createdAt: daysAgo(120), status: "New" },
      { referralPartnerId: "b", createdAt: daysAgo(3), status: "Contacted" },
      { referralPartnerId: "z", createdAt: daysAgo(3), status: "Converted" },
    ];
    expect(partnerStats("a", leads, now)).toEqual({ referrals90Days: 2, converted: 1, lastReferralAt: daysAgo(10) });
    expect(partnerSummary([{ id: "a", status: "Active" }, { id: "b", status: "Inactive" }], leads, now)).toEqual({ activePartners: 1, referralsThisQuarter: 3, converted: 1, conversionRate: 33 });
  });
});
