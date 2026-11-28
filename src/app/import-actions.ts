"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/platform/auth/server-client";
import { requireVerifiedCurrentUser } from "@/platform/auth/current-user";
import { resolveActiveOrganisationContext } from "@/platform/organisations/server-context";
import type { TenantContext, UserId } from "@/platform/core/models";
import { importKinds, type ImportKind, type ImportPlanItem, type ImportRecord } from "@/verticals/mortgage/imports/model";
import type { ImportResultItem } from "@/verticals/mortgage/repositories/import-port";
import { SupabaseImportRepository } from "@/verticals/mortgage/persistence/supabase-import-repository";

export type ImportActionResult<T> = { ok: true; value: T } | { ok: false; message: string };

/** Parsed records only: the CSV file is read in the browser and is never uploaded or stored. */
export async function previewImportAction(kind: ImportKind, records: ImportRecord[]): Promise<ImportActionResult<ImportPlanItem[]>> {
  try { const { context, repository } = await persistentImportContext(); return { ok: true, value: await repository.preview(context, validKind(kind), records) }; }
  catch (cause) { return { ok: false, message: message(cause) }; }
}

export async function runImportAction(kind: ImportKind, commandId: string, records: ImportRecord[]): Promise<ImportActionResult<ImportResultItem[]>> {
  try {
    if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(commandId)) throw new Error("The import reference is invalid. Start the import again.");
    const { context, repository } = await persistentImportContext();
    const value = await repository.run(context, validKind(kind), commandId, records);
    for (const path of ["/leads", "/client-book", "/referral-partners", "/today", "/settings"]) revalidatePath(path);
    return { ok: true, value };
  } catch (cause) { return { ok: false, message: message(cause) }; }
}

export async function persistentImportContext(returnPath = "/import") {
  const user = await requireVerifiedCurrentUser(returnPath);
  const { activeMembership } = await resolveActiveOrganisationContext(user);
  if (!activeMembership) throw new Error("No active brokerage membership is available.");
  const context = { organisationId: activeMembership.organisationId, userId: user.id as UserId } as TenantContext;
  return { user, activeMembership, context, repository: new SupabaseImportRepository(await createServerSupabaseClient()) };
}

function validKind(kind: ImportKind) { if (!importKinds.some(item => item.value === kind)) throw new Error("Choose what to import."); return kind; }
function message(cause: unknown) { return cause instanceof Error ? cause.message : "The import could not be completed."; }
