import { describe, expect, it } from "vitest";
import { createFixtureState } from "@/verticals/mortgage/fixtures";
import { calculateFirstResponseMinutes, calculateTodayMetrics, InMemoryOperationsRepository, isActiveUnassignedLead } from "@/verticals/mortgage/repositories/operations-repository";
import type { ActivityEvent } from "@/platform/audit/models";
import type { MortgageLead } from "@/verticals/mortgage/leads/models";
import { assertLeadTransition, canTransitionLead } from "@/verticals/mortgage/leads/workflow";

const harbour = { organisationId: "brk_harbour", userId: "usr_alex" } as const;
const dana = { organisationId: "brk_harbour", userId: "usr_dana" } as const;
const ranges = { organisationId: "brk_ranges", userId: "usr_priya" } as const;
const now = () => new Date("2026-11-14T12:00:00+11:00");
const repository = () => new InMemoryOperationsRepository(createFixtureState(), now);

describe("lead lifecycle", () => {
  it("permits required transitions", () => { expect(canTransitionLead("New","Contact attempted")).toBe(true); expect(canTransitionLead("Nurture","Discovery booked")).toBe(true); });
  it("rejects invalid transitions", () => expect(() => assertLeadTransition("New","Converted")).toThrow("Invalid lead transition"));
  it("keeps Converted terminal", () => expect(canTransitionLead("Converted","Nurture")).toBe(false));
  it("reopens Closed only into Nurture", () => { expect(canTransitionLead("Closed","Nurture")).toBe(true); expect(canTransitionLead("Closed","Contacted")).toBe(false); });
});

describe("permissions and tenancy", () => {
  it("allows support/admin assignment and rejects broker assignment", () => { const repo = repository(); expect(repo.assignLead(harbour,"lead_001","mem_h_broker1").ownerMembershipId).toBe("mem_h_broker1"); expect(() => repo.assignLead(dana,"lead_009","mem_h_broker2")).toThrow("denied"); });
  it("allows a broker to claim an unassigned lead", () => { const repo = repository(); expect(repo.claimLead(dana,"lead_001").ownerMembershipId).toBe("mem_h_broker1"); });
  it("denies cross-tenant lead access", () => { const repo = repository(); expect(() => repo.getLead(ranges,"lead_001")).toThrow("unavailable"); });
});

describe("appointments, events and metrics", () => {
  it("books discovery, transitions the lead and records both events", () => { const repo = repository(); repo.assignLead(harbour,"lead_004","mem_h_broker1"); const before = repo.listActivity(harbour,"lead_004").length; repo.createAppointment(harbour,{ leadId:"lead_004", assignedMembershipId:"mem_h_broker1", startsAt:"2026-11-15T10:00:00+11:00", durationMinutes:45, meetingMethod:"Phone", notes:"" }); expect(repo.getLead(harbour,"lead_004").status).toBe("Discovery booked"); expect(repo.listActivity(harbour,"lead_004")).toHaveLength(before+2); });
  it("exposes append-only activity operations", () => { const repo = repository() as unknown as Record<string,unknown>; expect(repo.appendActivity).toBeTypeOf("function"); expect(repo.updateActivity).toBeUndefined(); expect(repo.deleteActivity).toBeUndefined(); });
  it("calculates Today metrics from current repository state", () => { const repo = repository(); const before = calculateTodayMetrics(repo,harbour,now()); repo.assignLead(harbour,"lead_001","mem_h_broker1"); const after = calculateTodayMetrics(repo,harbour,now()); expect(before.activeUnassigned-after.activeUnassigned).toBe(1); expect(before.newLeads).toBeGreaterThan(0); expect(before.overdueFollowUps).toBe(2); });
  it("stores structured contact details and audits a next-action update", () => { const repo = repository(); repo.recordContactAttempt(harbour,"lead_001",{ channel:"Phone", outcome:"Left message", note:"Voicemail left", nextActionAt:"2026-11-15T09:30:00+11:00" }); const events = repo.listActivity(harbour,"lead_001"); expect(events.find(event => event.type === "contact.attempted")).toMatchObject({ contactChannel:"Phone", contactOutcome:"Left message", note:"Voicemail left" }); expect(events.some(event => event.type === "lead.next_action_changed")).toBe(true); expect(repo.getLead(harbour,"lead_001").nextActionAt).toBe("2026-11-15T09:30:00+11:00"); });
});

describe("first-response reporting", () => {
  const lead = (id: MortgageLead["id"], createdAt = "2026-11-14T09:00:00+11:00") => ({ ...createFixtureState().leads[0], id, createdAt }) as MortgageLead;
  const event = (id: ActivityEvent["id"], leadId: MortgageLead["id"], occurredAt: string, fields: Partial<ActivityEvent> = {}): ActivityEvent => ({ id, organisationId:"brk_harbour", leadId, actorMembershipId:"mem_h_support", occurredAt, type:"contact.attempted", summary:"Contact attempt recorded", ...fields });

  it("counts multiple contact attempts on one lead once", () => expect(calculateFirstResponseMinutes([lead("lead_a")],[event("evt_a1","lead_a","2026-11-14T09:10:00+11:00"),event("evt_a2","lead_a","2026-11-14T09:40:00+11:00")])).toEqual([10]));
  it("prefers a contact event over the status transition from the same operation", () => expect(calculateFirstResponseMinutes([lead("lead_a")],[event("evt_status","lead_a","2026-11-14T09:09:00+11:00",{type:"lead.status_changed",newStatus:"Contact attempted"}),event("evt_contact","lead_a","2026-11-14T09:10:00+11:00")])).toEqual([10]));
  it("produces the correct median across multiple leads", () => { const leads = [lead("lead_a"),lead("lead_b"),lead("lead_c")]; const activities = [event("evt_a","lead_a","2026-11-14T09:10:00+11:00"),event("evt_b","lead_b","2026-11-14T09:30:00+11:00"),event("evt_c","lead_c","2026-11-14T09:20:00+11:00")]; expect(calculateFirstResponseMinutes(leads,activities)).toEqual([10,20,30]); const state = createFixtureState(); state.leads = leads; state.activities = activities; state.tasks = []; state.appointments = []; const metrics = calculateTodayMetrics(new InMemoryOperationsRepository(state),harbour,now()); expect(metrics.medianFirstResponseMinutes).toBe(20); });
  it("excludes leads with no qualifying contact event", () => expect(calculateFirstResponseMinutes([lead("lead_a"),lead("lead_b")],[event("evt_a","lead_a","2026-11-14T09:15:00+11:00")])).toEqual([15]));
  it("excludes negative and invalid durations", () => expect(calculateFirstResponseMinutes([lead("lead_a"),lead("lead_b"),lead("lead_c","invalid")],[event("evt_a","lead_a","2026-11-14T08:59:00+11:00"),event("evt_b","lead_b","invalid"),event("evt_c","lead_c","2026-11-14T09:15:00+11:00")])).toEqual([]));
});

describe("active ownership", () => {
  it("requires an owner only for active leads", () => { const fixture = createFixtureState().leads[0]; expect(isActiveUnassignedLead({...fixture,status:"New",ownerMembershipId:undefined})).toBe(true); expect(isActiveUnassignedLead({...fixture,status:"Closed",ownerMembershipId:undefined})).toBe(false); expect(isActiveUnassignedLead({...fixture,status:"Converted",ownerMembershipId:undefined})).toBe(false); expect(isActiveUnassignedLead({...fixture,status:"Nurture",ownerMembershipId:"mem_h_broker1"})).toBe(false); });
  it("excludes terminal unassigned leads from the Today metric", () => { const state = createFixtureState(); state.leads.filter(lead => lead.organisationId === "brk_harbour").forEach(lead => { lead.ownerMembershipId = "mem_h_broker1"; }); state.leads.find(lead => lead.id === "lead_007")!.ownerMembershipId = undefined; state.leads.find(lead => lead.id === "lead_008")!.ownerMembershipId = undefined; expect(calculateTodayMetrics(new InMemoryOperationsRepository(state),harbour,now()).activeUnassigned).toBe(0); });
});
