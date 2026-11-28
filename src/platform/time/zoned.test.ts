import { describe, expect, it } from "vitest";
import { businessDateIn, organisationTimeZone, zonedLocalToIso } from "./zoned";

describe("organisation-local date-time input", () => {
  it("reads a datetime-local value in the organisation zone, not the server or browser zone", () => {
    expect(zonedLocalToIso("2026-11-15T09:30")).toBe("2026-11-14T22:30:00.000Z"); // AEDT, UTC+11
    expect(zonedLocalToIso("2026-06-15T09:30")).toBe("2026-06-14T23:30:00.000Z"); // AEST, UTC+10
    expect(zonedLocalToIso("2026-11-15T09:30", "Australia/Perth")).toBe("2026-11-15T01:30:00.000Z");
  });
  it("handles daylight-saving transitions in Sydney", () => {
    expect(zonedLocalToIso("2026-10-04T03:30")).toBe("2026-10-03T16:30:00.000Z"); // first hour after clocks go forward
    expect(zonedLocalToIso("2026-04-05T01:30")).toBe("2026-04-04T14:30:00.000Z");
  });
  it("keeps explicit offsets and rejects invalid input", () => {
    expect(zonedLocalToIso("2026-11-15T09:30:00Z")).toBe("2026-11-15T09:30:00.000Z");
    expect(zonedLocalToIso("2026-11-15T09:30+08:00")).toBe("2026-11-15T01:30:00.000Z");
    expect(() => zonedLocalToIso("15/11/2026 9:30")).toThrow("Enter a valid date and time.");
  });
  it("gives the same result whatever the process time zone is", () => {
    const original = process.env.TZ;
    process.env.TZ = "America/Los_Angeles";
    try { expect(zonedLocalToIso("2026-11-15T09:30")).toBe("2026-11-14T22:30:00.000Z"); } finally { process.env.TZ = original; }
  });
});

describe("daylight-saving changes and non-DST zones", () => {
  it("Sydney, first Sunday of October 2026 (clocks go forward at 2 am)", () => {
    expect(zonedLocalToIso("2026-10-04T01:59", "Australia/Sydney")).toBe("2026-10-03T15:59:00.000Z"); // AEST +10
    expect(zonedLocalToIso("2026-10-04T03:00", "Australia/Sydney")).toBe("2026-10-03T16:00:00.000Z"); // AEDT +11
    // 2:30 am does not exist that day; it is read as the first valid time after the gap (3:30 am AEDT).
    expect(zonedLocalToIso("2026-10-04T02:30", "Australia/Sydney")).toBe("2026-10-03T16:30:00.000Z");
  });
  it("Sydney, first Sunday of April 2026 (clocks go back at 3 am)", () => {
    expect(zonedLocalToIso("2026-04-05T01:30", "Australia/Sydney")).toBe("2026-04-04T14:30:00.000Z"); // AEDT +11
    expect(zonedLocalToIso("2026-04-05T03:00", "Australia/Sydney")).toBe("2026-04-04T17:00:00.000Z"); // AEST +10
    // 2:30 am happens twice; it is read as the later (standard time) occurrence.
    expect(zonedLocalToIso("2026-04-05T02:30", "Australia/Sydney")).toBe("2026-04-04T16:30:00.000Z");
  });
  it("Brisbane has no daylight saving: always UTC+10, including on Sydney's change days", () => {
    for (const [local, expected] of [["2026-10-04T02:30", "2026-10-03T16:30:00.000Z"], ["2026-10-04T03:00", "2026-10-03T17:00:00.000Z"], ["2026-04-05T01:30", "2026-04-04T15:30:00.000Z"], ["2026-11-15T09:30", "2026-11-14T23:30:00.000Z"]] as const) expect(zonedLocalToIso(local, "Australia/Brisbane")).toBe(expected);
  });
  it("business dates follow the brokerage zone across midnight", () => {
    const instant = new Date("2026-11-14T13:30:00Z"); // 00:30 15 Nov in Sydney (AEDT), 23:30 14 Nov in Brisbane
    expect(businessDateIn(instant, "Australia/Sydney")).toBe("2026-11-15");
    expect(businessDateIn(instant, "Australia/Brisbane")).toBe("2026-11-14");
    expect(organisationTimeZone({ timeZone: "Australia/Brisbane" })).toBe("Australia/Brisbane");
    expect(organisationTimeZone({})).toBe("Australia/Sydney");
  });
});
