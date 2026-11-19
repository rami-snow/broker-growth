"use server";

import { revalidatePath } from "next/cache";
import { requireVerifiedCurrentUser } from "@/platform/auth/current-user";
import { createServerSupabaseClient } from "@/platform/auth/server-client";
import { resolveActiveOrganisationContext } from "@/platform/organisations/server-context";
import type { MembershipId, TenantContext, UserId } from "@/platform/core/models";
import type { LeadId } from "@/platform/leads/models";
import type { MortgageLeadStatus } from "@/verticals/mortgage/leads/models";
import { SupabaseLeadOperationsRepository } from "@/verticals/mortgage/persistence/supabase-lead-operations-repository";

export interface LeadActionState { ok: boolean; message: string; leadId?: string; }

export async function runLeadAction(_state: LeadActionState, formData: FormData): Promise<LeadActionState> {
  const operation = value(formData, "operation");
  const commandId = value(formData, "commandId");
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(commandId)) return failure("A valid action key is required. Close the form and try again.");
  try {
    const { context, repository } = await persistentOperationsContext();
    let result: { leadId: string; version: number };
    if (operation === "create") {
      result = await repository.createLead(context, commandId, {
        firstName: value(formData, "firstName"), lastName: value(formData, "lastName"),
        email: value(formData, "email"), phone: value(formData, "phone"), source: value(formData, "source"),
        loanPurpose: value(formData, "loanPurpose") as never, timeframe: value(formData, "timeframe") as never,
        preferredContactMethod: value(formData, "contact") as never,
        ownerMembershipId: optional(formData, "owner") as MembershipId | undefined,
      });
    } else {
      const leadId = value(formData, "leadId") as LeadId;
      const expectedVersion = integer(formData, "expectedVersion");
      if (operation === "claim") result = await repository.claimLead(context, commandId, leadId, expectedVersion);
      else if (operation === "assign") result = await repository.assignLead(context, commandId, leadId, expectedVersion, value(formData, "owner") as MembershipId);
      else if (operation === "transition") result = await repository.transitionLead(context, commandId, leadId, expectedVersion, value(formData, "status") as MortgageLeadStatus, optional(formData, "note"));
      else if (operation === "contact") result = await repository.recordContactAttempt(context, commandId, leadId, expectedVersion, { channel: value(formData, "channel") as never, outcome: value(formData, "outcome") as never, note: optional(formData, "note"), nextActionAt: dateTime(formData, "nextActionAt", false) });
      else if (operation === "note") result = await repository.addNote(context, commandId, leadId, expectedVersion, value(formData, "note"));
      else if (operation === "task") result = await repository.createTask(context, commandId, expectedVersion, { leadId, assignedMembershipId: value(formData, "owner") as MembershipId, title: value(formData, "title"), dueAt: dateTime(formData, "dueAt", true)!, priority: value(formData, "priority") as never });
      else if (operation === "appointment") result = await repository.createAppointment(context, commandId, expectedVersion, { leadId, assignedMembershipId: value(formData, "owner") as MembershipId, startsAt: dateTime(formData, "startsAt", true)!, durationMinutes: integer(formData, "duration"), meetingMethod: value(formData, "method") as never, locationOrLink: optional(formData, "location"), notes: optional(formData, "note") ?? "" });
      else if (operation === "referral") result = await repository.setReferralPartner(context,commandId,leadId,expectedVersion,optional(formData,"referralPartnerId"));
      else if (operation === "reopen") result = await repository.transitionLead(context, commandId, leadId, expectedVersion, "Nurture", "Lead deliberately reopened");
      else return failure("Unknown lead operation.");
    }
    revalidatePath("/today"); revalidatePath("/leads"); revalidatePath(`/leads/${result.leadId}`);revalidatePath("/referral-partners");
    return { ok: true, message: successMessage(operation), leadId: result.leadId };
  } catch (cause) {
    return failure(cause instanceof Error ? cause.message : "The action could not be completed.");
  }
}

export async function persistentOperationsContext() {
  const user = await requireVerifiedCurrentUser("/leads");
  const { activeMembership } = await resolveActiveOrganisationContext(user);
  if (!activeMembership) throw new Error("No active brokerage membership is available.");
  const client = await createServerSupabaseClient();
  return { user, activeMembership, context: { organisationId: activeMembership.organisationId, userId: user.id as UserId } as TenantContext, repository: new SupabaseLeadOperationsRepository(client) };
}

function value(data: FormData, key: string) { return String(data.get(key) ?? "").trim(); }
function optional(data: FormData, key: string) { const result = value(data, key); return result || undefined; }
function integer(data: FormData, key: string) { const result = Number(value(data, key)); if (!Number.isInteger(result)) throw new Error(`${key} must be a whole number.`); return result; }
function dateTime(data: FormData, key: string, required: boolean) { const raw = value(data, key); if (!raw && !required) return undefined; const parsed = Date.parse(raw); if (!Number.isFinite(parsed)) throw new Error(`Enter a valid ${key}.`); return new Date(parsed).toISOString(); }
function failure(message: string): LeadActionState { return { ok: false, message }; }
function successMessage(operation: string) { return ({ create: "Lead created", claim: "Lead claimed", assign: "Owner assigned", transition: "Status updated", contact: "Contact attempt recorded", note: "Note added", task: "Follow-up task created", appointment: "Discovery appointment booked", referral:"Referral attribution updated", reopen: "Lead reopened into nurture" } as Record<string,string>)[operation] ?? "Action completed"; }
