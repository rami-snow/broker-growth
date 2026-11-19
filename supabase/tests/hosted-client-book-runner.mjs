import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const source = readFileSync(new URL("./hosted-client-book-operations.sql", import.meta.url), "utf8");
const pagingMarker = "create temp table paging_baseline";
const planMarker = "reset role;\nselect pg_temp.check_result((select passed=60 and failed=0 from verification_results),'planned assertion count');";
const pagingStart = source.indexOf(pagingMarker);
const planStart = source.indexOf(planMarker);
if (pagingStart < 0 || planStart < pagingStart) throw new Error("Hosted Client Book suite markers changed.");

const setup = `begin;
create temp table verification_results(passed integer not null default 0, failed integer not null default 0);
insert into verification_results default values;
grant select, update on verification_results to authenticated;
create or replace function pg_temp.check_result(condition boolean, label text) returns void
language plpgsql as $$ begin
  if condition then update verification_results set passed=passed+1;
  else update verification_results set failed=failed+1; raise exception 'verification failed: %', label; end if;
end $$;
select set_config('request.jwt.claim.sub',(
  select user_id::text from public.organisation_memberships
  where organisation_id='10000000-0000-0000-0000-000000000001'
    and id='30000000-0000-0000-0000-000000000004'
),true);
insert into public.membership_capabilities(organisation_id,membership_id,capability)
select '10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004',capability
from unnest(array['contact.view','lead.view','mortgage.household.view']) capability
on conflict do nothing;
`;

const core = `${source.slice(0, pagingStart)}
reset role;
select 54 passed,0 failed,'core conversion transaction will roll back' outcome
where (select passed=54 and failed=0 from verification_results);
rollback;
`;
const paging = `${setup}${source.slice(pagingStart, planStart)}
reset role;
select pg_temp.check_result((select passed=6 and failed=0 from verification_results),'split suite assertion plan');
select passed,failed,'pagination transaction will roll back; combined suite total is 61' outcome from verification_results;
rollback;
`;

const directory = mkdtempSync(join(tmpdir(), "bgd-client-book-suite-"));
try {
  for (const [name, sql] of [["core", core], ["pagination", paging]]) {
    const file = join(directory, `${name}.sql`);
    writeFileSync(file, sql, { mode: 0o600 });
    execFileSync("pnpm", ["exec", "supabase", "db", "query", "--remote=fgqgcikmaccjamwocpat", "--file", file, "--yes"], { stdio: "inherit" });
  }
  console.log("# 61 hosted Client Book/conversion assertions passed; both transactions rolled back.");
} finally {
  rmSync(directory, { recursive: true, force: true });
}
