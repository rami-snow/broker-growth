import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { MAX_IMPORT_ROWS } from "@/verticals/mortgage/imports/csv";
import { importKinds } from "@/verticals/mortgage/imports/model";

const sql = readFileSync(resolve(process.cwd(), "supabase/migrations/20261128090500_csv_import.sql"), "utf8");
const body = (name: string) => { const start = sql.indexOf(`create or replace function ${name}(`); if (start < 0) throw new Error(`Missing ${name}`); return sql.slice(start, sql.indexOf("\n$$;", start)); };

describe("CSV import migration", () => {
  it("checks the same capability per kind as the app", () => {
    const capability = body("private.import_capability");
    for (const kind of importKinds) expect(capability).toContain(`when '${kind.value}' then '${kind.capability}'`);
  });

  it("is idempotent, capability-checked and bounded", () => {
    const run = body("public.import_mortgage_records");
    expect(run).toContain("private.require_operation_actor(p_organisation_id, private.import_capability(p_kind))");
    expect(run).toContain("private.begin_operation_command_checked(p_organisation_id, p_command_id, 'mortgage.csv-import'");
    expect(run).toContain("if previous_result is not null then return previous_result; end if;");
    expect(run).toContain("private.finish_operation_command(p_organisation_id, p_command_id, result)");
    expect(run).toContain(`jsonb_array_length(p_records) > ${MAX_IMPORT_ROWS}`);
    expect(body("public.preview_mortgage_import")).toContain(`jsonb_array_length(p_records) > ${MAX_IMPORT_ROWS}`);
  });

  it("matches existing records before writing and skips rows repeated in the file", () => {
    const run = body("public.import_mortgage_records");
    expect(run.indexOf("'repeated'")).toBeLessThan(run.indexOf("insert into"));
    expect(run.indexOf("private.import_match(")).toBeLessThan(run.indexOf("insert into"));
    expect(body("public.preview_mortgage_import")).toContain("private.import_match(");
    const contact = body("private.import_contact");
    expect(contact.indexOf("select c.id into contact_id")).toBeLessThan(contact.indexOf("insert into public.contacts"));
  });

  it("attributes every audit entry to import, including trigger-generated ones", () => {
    const run = body("public.import_mortgage_records");
    expect(run).toContain("set_config('app.audit_actor_type', 'import', true)");
    for (const insert of run.split("insert into public.activity_events").slice(1)) expect(insert.slice(0, 400)).toContain("'import'");
    expect(body("private.default_audit_actor_type")).toContain("current_setting('app.audit_actor_type', true)");
  });

  it("never infers consent and keeps loan records minimal", () => {
    expect(body("private.import_contact")).toContain("'Not recorded', 'CSV import'");
    const run = body("public.import_mortgage_records");
    expect(run).toContain("'CSV import', 'Unverified'");
    expect(sql).not.toMatch(/balance|interest_rate|repayment|loan_amount/i);
  });

  it("isolates each record and grants only authenticated execution", () => {
    expect(body("public.import_mortgage_records")).toContain("exception when others then");
    expect(sql).toContain("revoke all on function public.import_mortgage_records(uuid,uuid,text,jsonb) from public, anon;");
    expect(sql).toContain("grant execute on function public.import_mortgage_records(uuid,uuid,text,jsonb) to authenticated;");
    for (const name of ["private.import_capability(text)", "private.import_match(uuid,text,jsonb)", "private.import_contact(uuid,uuid,jsonb)"]) expect(sql).toContain(`revoke all on function ${name} from public, anon, authenticated;`);
    expect(sql).not.toMatch(/grant [^;]* on function private\./);
  });
});
