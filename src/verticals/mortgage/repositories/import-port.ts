import type { ImportKind, ImportOwner, ImportPlanItem, ImportRecord } from "@/verticals/mortgage/imports/model";

export interface ImportResultItem { rows: number[]; label: string; outcome: "created" | "exists" | "repeated" | "failed"; detail?: string }

/** What the import screen needs, in either runtime mode. The file itself never leaves the browser. */
export interface ImportScreenPort {
  preview(kind: ImportKind, records: ImportRecord[]): Promise<ImportPlanItem[]>;
  run(kind: ImportKind, commandId: string, records: ImportRecord[]): Promise<ImportResultItem[]>;
}
export interface ImportScreenSetup { owners: ImportOwner[]; allowedKinds: ImportKind[]; currentMembershipId: string }
