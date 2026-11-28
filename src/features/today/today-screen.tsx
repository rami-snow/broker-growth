"use client";

import Link from "next/link";
import { usePrototype } from "@/components/prototype-provider";
import { hasCapability } from "@/verticals/mortgage/permissions";
import { buildToday, type TodayReview } from "./today-model";
import { NeedsActionView } from "./needs-action-view";
import { TodayView } from "./today-view";

/** Fixture adapter shared by Today and the Needs action page. */
export function useFixtureTodayModel() {
  const { repo, clientRepo, context, now, revision } = usePrototype(); void revision;
  const membership = repo.getMembership(context), state = repo.snapshot();
  const households = hasCapability(membership, "mortgage.household.view") ? clientRepo.listHouseholds(context) : [];
  const householdNames = Object.fromEntries(households.map(item => [item.id, item.displayName]));
  const members = repo.listMemberships(context);
  const reviews: TodayReview[] = hasCapability(membership, "mortgage.review-opportunity.view") ? clientRepo.listOpportunities(context).map(item => ({ id: item.id, householdId: item.householdId, householdName: householdNames[item.householdId] ?? "Household", type: item.typeKey, triggerDate: item.triggerDate, status: item.lifecycleStatus, ownerName: members.find(member => member.id === item.ownerMembershipId)?.displayName })) : [];
  const model = buildToday({ now: now(), userName: membership.displayName, leads: hasCapability(membership, "lead.view") ? repo.listLeads(context) : [], memberships: members, tasks: repo.listTasks(context), appointments: repo.listAppointments(context), activities: state.activities.filter(item => item.organisationId === context.organisationId), reviews, householdNames });
  return { model, membership };
}

export function TodayScreen() {
  const { model, membership } = useFixtureTodayModel();
  return <TodayView model={model} auditHref={hasCapability(membership, "settings.view") ? "/settings?tab=audit" : undefined} newLeadAction={hasCapability(membership, "lead.create") ? <Link className="ui-button ui-button--primary" href="/leads?new=1">New lead</Link> : undefined}/>;
}

export function FixtureNeedsActionScreen() {
  const { model } = useFixtureTodayModel();
  return <NeedsActionView items={model.needsAction}/>;
}
