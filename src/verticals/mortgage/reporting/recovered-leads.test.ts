import { describe, expect, it } from "vitest";
import { leadRecovery } from "./recovered-leads";
import { reportingSettings } from "./settings";

const at = (day: number) => new Date(Date.UTC(2026, 8, 1) + day * 86400000).toISOString();
const status = (day: number, newStatus: string) => ({ type: "lead.status_changed", occurredAt: at(day), newStatus });
const contact = (day: number) => ({ type: "contact.attempted", occurredAt: at(day) });

describe("recovered lead definition", () => {
  it("uses one 30-day setting", () => expect(reportingSettings.recoveredLeadNoReplyDays).toBe(30));
  it("recovers a Nurture lead that reaches Discovery booked after a logged contact", () => {
    expect(leadRecovery([contact(1), status(2, "Nurture"), contact(40), status(41, "Discovery booked")])).toEqual({ recovered: true, dormantAt: at(2), recoveredAt: at(41) });
  });
  it("recovers a Closed lead that converts after a logged contact", () => {
    expect(leadRecovery([status(3, "Closed"), status(10, "Nurture"), contact(12), status(20, "Converted")]).recovered).toBe(true);
  });
  it("needs a logged contact attempt between going dormant and recovering", () => {
    expect(leadRecovery([status(2, "Nurture"), status(5, "Discovery booked")])).toEqual({ recovered: false, dormantAt: at(2) });
  });
  it("counts 30 days without a reply after a contact attempt as dormant, but not 29", () => {
    expect(leadRecovery([contact(0), contact(31), status(32, "Discovery booked")])).toMatchObject({ recovered: true, dormantAt: at(30) });
    expect(leadRecovery([contact(0), status(29, "Contacted"), contact(31), status(32, "Discovery booked")]).recovered).toBe(false);
  });
  it("reads the period from settings, not a hard-coded value", () => {
    const events = [contact(0), status(20, "Contacted"), contact(21), status(22, "Discovery booked")];
    expect(leadRecovery(events).recovered).toBe(false);
    expect(leadRecovery(events, { recoveredLeadNoReplyDays: 14 }).recovered).toBe(true);
  });
  it("never counts a lead that was never dormant", () => {
    expect(leadRecovery([contact(0), status(1, "Contacted"), status(3, "Discovery booked")])).toEqual({ recovered: false });
  });
});
