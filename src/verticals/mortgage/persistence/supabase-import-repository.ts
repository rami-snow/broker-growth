import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/platform/database/database.types";
import type { TenantContext } from "@/platform/core/models";
import { MAX_IMPORT_ROWS } from "@/verticals/mortgage/imports/csv";
import { importFailureMessage, importPayload, planImport, type ImportKind, type ImportOwner, type ImportPlanItem, type ImportRecord } from "@/verticals/mortgage/imports/model";
import type { ImportResultItem } from "@/verticals/mortgage/repositories/import-port";

type Client = SupabaseClient<Database>;
type PreviewRow = { index: number; status: "new" | "exists"; matchedOn?: string; note?: string };
type RunRow = { index: number; outcome: ImportResultItem["outcome"]; detail?: string };
const nothingExisting = { leadContacts: [], clientContacts: [], partners: [] };

/** Persistent CSV import through the guarded preview_mortgage_import and import_mortgage_records operations. */
export class SupabaseImportRepository {
  constructor(private readonly client: Client) {}

  async owners(context: TenantContext): Promise<ImportOwner[]> {
    const [members, profiles] = await Promise.all([
      this.client.from("organisation_memberships").select("id,display_name").eq("organisation_id", context.organisationId).eq("status", "Active").order("display_name"),
      this.client.from("mortgage_membership_profiles").select("membership_id,position").eq("organisation_id", context.organisationId),
    ]);
    const error = members.error ?? profiles.error;
    if (error) throw new Error(`Unable to load brokerage members: ${error.message}`);
    const brokers = new Set((profiles.data ?? []).filter(row => row.position === "Broker").map(row => row.membership_id));
    return (members.data ?? []).map(row => ({ id: row.id, name: row.display_name, isBroker: brokers.has(row.id) }));
  }

  async preview(context: TenantContext, kind: ImportKind, records: ImportRecord[]): Promise<ImportPlanItem[]> {
    const checked = check(kind, records);
    // Rows repeated within the file are found locally; matches against existing records come from the database.
    const local = planImport(checked, nothingExisting);
    const { data, error } = await this.client.rpc("preview_mortgage_import" as never, { p_organisation_id: context.organisationId, p_kind: kind, p_records: checked.map(importPayload) } as never);
    if (error) throw new Error(importError(error.message));
    const remote = new Map(((data ?? []) as unknown as PreviewRow[]).map(row => [row.index, row]));
    return local.map((item, index) => {
      if (item.status === "repeated") return item;
      const row = remote.get(index);
      if (row?.status === "exists") return { record: item.record, status: "exists", matchedOn: row.matchedOn ?? "email" };
      return { record: item.record, status: "new", note: row?.note };
    });
  }

  async run(context: TenantContext, kind: ImportKind, commandId: string, records: ImportRecord[]): Promise<ImportResultItem[]> {
    const checked = check(kind, records), local = planImport(checked, nothingExisting);
    const { data, error } = await this.client.rpc("import_mortgage_records" as never, { p_organisation_id: context.organisationId, p_command_id: commandId, p_kind: kind, p_records: checked.map(importPayload) } as never);
    if (error) throw new Error(importError(error.message));
    const items = new Map((((data ?? {}) as { items?: RunRow[] }).items ?? []).map(row => [row.index, row]));
    return checked.map((record, index) => {
      const row = items.get(index), base = { rows: record.rows, label: record.label }, planned = local[index]!;
      if (!row) return { ...base, outcome: "failed", detail: "No result was returned for this record" };
      if (row.outcome === "repeated") return { ...base, outcome: "repeated", detail: planned.status === "repeated" ? `Same person as line ${planned.firstRows.join(", ")}` : "Same person as an earlier line" };
      if (row.outcome === "failed") return { ...base, outcome: "failed", detail: importFailureMessage(row.detail) };
      return { ...base, outcome: row.outcome, detail: row.detail };
    });
  }
}

function check(kind: ImportKind, records: ImportRecord[]) {
  if (!Array.isArray(records) || records.length > MAX_IMPORT_ROWS) throw new Error(`Import at most ${MAX_IMPORT_ROWS} records at a time.`);
  if (records.some(record => record?.kind !== kind)) throw new Error("Every record must match the chosen import type.");
  return records;
}
function importError(message: string) {
  if (message.includes("COMMAND_ID_REUSE_CONFLICT")) return "This import was already submitted with different records. Start the import again.";
  if (message.includes("COMMAND_INCOMPLETE")) return "This import is still running. Wait a moment, then check the results.";
  if (message.includes("IMPORT_TOO_LARGE")) return `Import at most ${MAX_IMPORT_ROWS} records at a time.`;
  if (message.includes("CAPABILITY_REQUIRED") || message.includes("MEMBERSHIP")) return "You do not have permission to import this type of record.";
  return "The import could not be completed. Nothing further was changed.";
}
