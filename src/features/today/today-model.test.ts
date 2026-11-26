import { describe, expect, it } from "vitest";
import { createFixtureState } from "@/verticals/mortgage/fixtures";
import { buildToday, comparePriorities, greeting } from "./today-model";

const now = new Date("2026-11-14T12:00:00+11:00");
function model() {
  const state = createFixtureState(), org = "brk_harbour";
  const households = Object.fromEntries(state.households.filter(item => item.organisationId === org).map(item => [item.id, item.displayName]));
  return buildToday({
    now, userName: "Alex Morgan",
    leads: state.leads.filter(item => item.organisationId === org),
    memberships: state.memberships.filter(item => item.organisationId === org),
    tasks: state.tasks.filter(item => item.organisationId === org),
    appointments: state.appointments.filter(item => item.organisationId === org),
    activities: state.activities.filter(item => item.organisationId === org),
    reviews: [], householdNames: households,
  });
}

describe("Today model", () => {
  it("greets by first name using the Sydney clock", () => {
    expect(greeting(new Date("2026-11-13T21:30:00Z"), "Alex Morgan")).toBe("Good morning, Alex");
    expect(greeting(now, "Dana Ellis")).toBe("Good afternoon, Dana");
  });
  it("lists only New leads without a logged contact attempt as needing a first response", () => {
    const today = model();
    const calls = today.needsAction.filter(item => item.title.startsWith("Call "));
    expect(calls.length).toBeGreaterThan(0);
    expect(calls.every(item => item.actions.some(action => action.label === "Open lead"))).toBe(true);
    expect(today.needsAction.find(item => item.title === "Call Ruby March")).toBeUndefined();
  });
  it("offers Assign owner only when the lead has no owner", () => {
    for (const item of model().needsAction.filter(entry => entry.title.startsWith("Call "))) {
      const unowned = item.text.includes("no owner assigned");
      expect(item.actions.some(action => action.label === "Assign owner")).toBe(unowned);
    }
  });
  it("sorts priorities by response deadline first, then due date", () => {
    const sorted = [{ dueAt: 5 }, { dueAt: 1 }, { responseDeadline: 9, dueAt: 9 }, { responseDeadline: 3, dueAt: 3 }].sort(comparePriorities);
    expect(sorted).toEqual([{ responseDeadline: 3, dueAt: 3 }, { responseDeadline: 9, dueAt: 9 }, { dueAt: 1 }, { dueAt: 5 }]);
    const items = model().priorities;
    const firstNonResponse = items.findIndex(item => item.responseDeadline === undefined);
    expect(items.slice(firstNonResponse).every(item => item.responseDeadline === undefined)).toBe(true);
  });
  it("reads recent activity from the audit log, newest first, and never shows money fields", () => {
    const activity = model().recentActivity;
    expect(activity.length).toBeLessThanOrEqual(5);
    expect(JSON.stringify(model())).not.toMatch(/balance|interest rate|loan amount|\$\d/i);
  });
});
