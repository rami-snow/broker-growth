import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { importFailureMessage } from "@/verticals/mortgage/imports/model";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20261128090600_import_phone_matching_and_failure_codes.sql"), "utf8");
const first = readFileSync(resolve(process.cwd(), "supabase/migrations/20261128090500_csv_import.sql"), "utf8");
const body = (source: string, name: string) => { const start = source.indexOf(`create or replace function ${name}(`); return source.slice(start, source.indexOf("\n$$;", start)); };

describe("CSV import follow-up migration", () => {
  it("uses one phone rule for contacts and referral partners, and recomputes stored values safely", () => {
    expect(body(sql, "private.normalise_contact_phone")).toContain("private.normalise_phone_number(value)");
    expect(body(sql, "private.normalise_referral_phone")).toContain("private.normalise_phone_number(value)");
    expect(sql.indexOf("PHONE_RENORMALISATION_WOULD_DUPLICATE_CONTACTS")).toBeLessThan(sql.indexOf("update public.contacts set phone_normalized"));
  });

  it("stores only an error code for a failed record, never the database message", () => {
    const run = body(sql, "public.import_mortgage_records");
    expect(run).toContain("'detail', private.import_failure_code(sqlerrm, sqlstate)");
    expect(run).not.toMatch(/'detail', sqlerrm/);
    // Apart from that line, the function is unchanged from 20261128090500.
    expect(run.replace("private.import_failure_code(sqlerrm, sqlstate)", "sqlerrm")).toBe(body(first, "public.import_mortgage_records"));
    expect(sql).toContain("grant execute on function public.import_mortgage_records(uuid,uuid,text,jsonb) to authenticated;");
  });

  it("never stores the import request, only a fingerprint", () => {
    const run = body(sql, "public.import_mortgage_records");
    expect(run).toContain("private.begin_operation_command_checked(");
    expect(sql).not.toMatch(/insert into public\.operation_commands/);
  });

  it("explains generic failure codes without quoting values", () => {
    expect(importFailureMessage("IMPORT_RECORD_FAILED:22008")).toBe("A value in this record is not in a recognised format");
    expect(importFailureMessage("IMPORT_RECORD_FAILED:23505")).toContain("created at the same time");
    expect(importFailureMessage("IMPORT_RECORD_FAILED:XX000")).toBe("This record could not be imported");
  });
});
