import { describe, expect, it } from "vitest";
import { compareByResponseDue, firstContactAttemptAt, formatDuration, leadResponseState, medianMinutes, needsFirstResponse } from "./response";

const lead = (overrides: Partial<{ id: string; createdAt: string; status: "New" | "Contact attempted" | "Contacted" | "Discovery booked" | "Nurture" | "Converted" | "Closed" }> = {}) => ({ id: "lead_a" as const, createdAt: "2026-11-14T08:00:00+11:00", status: "New" as const, ...overrides }) as { id: `lead_${string}`; createdAt: string; status: "New" };
const attempt = (occurredAt: string, leadId = "lead_a") => ({ leadId: leadId as `lead_${string}`, type: "contact.attempted", occurredAt });

describe("first response clock", () => {
  it("measures from creation to the earliest logged contact attempt", () => {
    const events = [attempt("2026-11-14T10:00:00+11:00"), attempt("2026-11-14T08:35:00+11:00"), attempt("2026-11-14T07:00:00+11:00")];
    expect(firstContactAttemptAt(lead(), events)).toBe("2026-11-14T08:35:00+11:00");
    expect(leadResponseState(lead(), events, new Date("2026-11-14T12:00:00+11:00"))).toEqual({ kind: "responded", minutes: 35, withinTarget: true });
  });
  it("ignores other leads' attempts and falls back to contact status changes", () => {
    const events = [attempt("2026-11-14T08:10:00+11:00", "lead_b"), { leadId: "lead_a" as const, type: "lead.status_changed", newStatus: "Contacted", occurredAt: "2026-11-14T10:00:00+11:00" }];
    expect(leadResponseState(lead({ status: "Contacted" }), events, new Date())).toMatchObject({ kind: "responded", minutes: 120, withinTarget: false });
  });
  it("counts down a one-hour deadline for New leads and goes negative when overdue", () => {
    expect(leadResponseState(lead(), [], new Date("2026-11-14T08:20:00+11:00"))).toEqual({ kind: "awaiting", dueAt: "2026-11-13T22:00:00.000Z", minutesUntilDue: 40 });
    expect(leadResponseState(lead(), [], new Date("2026-11-14T11:00:00+11:00"))).toMatchObject({ kind: "awaiting", minutesUntilDue: -120 });
  });
  it("stops the clock once a lead has left New, even without a logged attempt", () => {
    for (const status of ["Discovery booked", "Nurture", "Closed", "Converted"] as const) expect(needsFirstResponse(lead({ status }), [], new Date())).toBe(false);
  });
  it("orders awaiting leads by deadline before others by next action", () => {
    const now = new Date("2026-11-14T12:00:00+11:00");
    const rows = [
      { createdAt: "a", nextActionAt: "2026-11-14T09:00:00+11:00", state: leadResponseState(lead({ status: "Contacted" }), [], now) },
      { createdAt: "b", state: leadResponseState(lead({ createdAt: "2026-11-14T10:00:00+11:00" }), [], now) },
      { createdAt: "c", state: leadResponseState(lead({ createdAt: "2026-11-13T10:00:00+11:00" }), [], now) },
    ].sort(compareByResponseDue);
    expect(rows.map(row => row.createdAt)).toEqual(["c", "b", "a"]);
  });
  it("formats durations and medians", () => {
    expect(formatDuration(35)).toBe("35m");
    expect(formatDuration(1545, true)).toBe("25h 45m");
    expect(formatDuration(-180)).toBe("3h");
    expect(medianMinutes([])).toBeNull();
    expect(medianMinutes([10, 40, 20, 30])).toBe(25);
  });
});
