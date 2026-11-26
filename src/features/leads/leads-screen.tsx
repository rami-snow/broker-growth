"use client";
import { usePrototype } from "@/components/prototype-provider";
import { hasCapability } from "@/verticals/mortgage/permissions";
import { LeadsListView } from "./leads-list-view";
import { NewLeadForm } from "./new-lead-form";

export function LeadsScreen() {
  const { repo, context, now, revision } = usePrototype(); void revision;
  const membership = repo.getMembership(context);
  return <LeadsListView leads={repo.listLeads(context)} memberships={repo.listMemberships(context)} activities={repo.snapshot().activities.filter(item => item.organisationId === context.organisationId)} tasks={repo.listTasks(context)} now={now()} canCreate={hasCapability(membership, "lead.create")} renderCreate={close => <NewLeadForm onClose={close}/>}/>;
}
