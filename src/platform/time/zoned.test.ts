import { describe, expect, it } from "vitest";
import { zonedLocalToIso } from "./zoned";

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
