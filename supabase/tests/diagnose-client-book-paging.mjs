// Diagnostic: times each step of the Client Book pagination check, one request per step, so a slow step
// is identified instead of the whole request hitting the API gateway's ~100 second limit.
// Development project only. Every request runs in its own transaction and rolls back.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const source = readFileSync(new URL("./hosted-client-book-operations.sql", import.meta.url), "utf8");
const pagingStart = source.indexOf("create temp table paging_baseline");
const roleStart = source.indexOf("set local role authenticated;", pagingStart);
const planStart = source.indexOf("reset role;\nselect pg_temp.check_result((select passed=60", roleStart);
if (pagingStart < 0 || roleStart < 0 || planStart < 0) throw new Error("Hosted Client Book suite markers changed.");

const setupData = source.slice(pagingStart, roleStart);
const checks = source.slice(roleStart + "set local role authenticated;".length, planStart).trim().split("\n").filter(line => line.trim());

const prelude = `begin;
set local statement_timeout = '85s';
create temp table verification_results(passed integer not null default 0, failed integer not null default 0);
insert into verification_results default values;
grant select, update on verification_results to authenticated;
create or replace function pg_temp.check_result(condition boolean, label text) returns void
language plpgsql as $$ begin
  if condition then update verification_results set passed=passed+1;
  else update verification_results set failed=failed+1; raise exception 'verification failed: %', label; end if;
end $$;
create temp table step_timing(step text, started timestamptz, finished timestamptz);
grant select, insert, update on step_timing to authenticated;
select set_config('request.jwt.claim.sub',(select user_id::text from public.organisation_memberships
  where organisation_id='10000000-0000-0000-0000-000000000001' and id='30000000-0000-0000-0000-000000000004'),true);
insert into public.membership_capabilities(organisation_id,membership_id,capability)
select '10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004',capability
from unnest(array['contact.view','lead.view','mortgage.household.view']) capability on conflict do nothing;
insert into step_timing values ('setup data', clock_timestamp(), null);
${setupData}
update step_timing set finished = clock_timestamp() where step = 'setup data';
`;

const variants = [["setup only", []], ...checks.map((line, index) => [`setup + check ${index + 1}`, index > 0 && line.includes("paging_result") ? [checks[0], line] : [line]])];
const directory = mkdtempSync(join(tmpdir(), "bgd-paging-diagnosis-"));
try {
  for (const [name, lines] of variants) {
    const body = lines.map((line, index) => `insert into step_timing values ('${index === lines.length - 1 ? "measured step" : "prerequisite step"}', clock_timestamp(), null);
set local role authenticated;
${line}
reset role;
update step_timing set finished = clock_timestamp() where finished is null;`).join("\n");
    const sql = `${prelude}${body}
select step, round(extract(epoch from finished - started)::numeric, 2) as seconds from step_timing order by started;
rollback;
`;
    if (process.env.DRY_RUN) { console.log(sql); continue; }
    const file = join(directory, "variant.sql");
    writeFileSync(file, sql, { mode: 0o600 });
    console.log(`\n# ${name}${lines[0] ? `: ${lines[0].slice(0, 110)}…` : ""}`);
    try { execFileSync("pnpm", ["exec", "supabase", "db", "query", "--remote=fgqgcikmaccjamwocpat", "--file", file, "--yes"], { stdio: "inherit" }); }
    catch { console.log(`# ${name}: did not finish (timed out or failed); continuing`); }
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
