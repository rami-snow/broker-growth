-- Milestone 4F.3 hosted verification for migrations 20261128090000-20261128090400.
-- Development project only. Every mutation runs inside one transaction and rolls back.
begin;
create temp table m4f3_results(passed integer not null default 0,failed integer not null default 0);
insert into m4f3_results default values;
grant select,update on m4f3_results to authenticated,anon;
create or replace function pg_temp.m4f3_check(condition boolean,label text)returns void language plpgsql as $$begin if condition then update m4f3_results set passed=passed+1;raise notice 'ok - %',label;else update m4f3_results set failed=failed+1;raise exception 'verification failed: %',label;end if;end$$;
grant execute on function pg_temp.m4f3_check(boolean,text) to authenticated,anon;
create or replace function pg_temp.m4f3_error(statement text,pattern text,label text)returns void language plpgsql as $$begin begin execute statement;perform pg_temp.m4f3_check(false,label);exception when others then if sqlerrm~*pattern then perform pg_temp.m4f3_check(true,label);else raise;end if;end;end$$;
grant execute on function pg_temp.m4f3_error(text,text,text) to authenticated,anon;
create temp table m4f3_state(result jsonb,replay jsonb,loan_version integer,partner_version integer);
insert into m4f3_state default values;grant select,update on m4f3_state to authenticated,anon;

-- (a) Audit actor: backfilled, required and consistent.
select pg_temp.m4f3_check(not exists(select 1 from public.activity_events where actor_type is null),'every audit entry has an actor type');
select pg_temp.m4f3_check(not exists(select 1 from public.activity_events where actor_type='person' and actor_membership_id is null),'person entries always name a member');
select pg_temp.m4f3_check(not exists(select 1 from public.activity_events where actor_type not in('person','system','import')),'only person, system or import actors');
select pg_temp.m4f3_check(not exists(select 1 from public.campaign_activity_events where actor_type is null),'campaign audit entries are backfilled');

-- (b) Brokerage time zone.
select pg_temp.m4f3_check((select bool_and(time_zone='Australia/Sydney') from public.organisations where id in('10000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002')),'existing brokerages default to Australia/Sydney');
select pg_temp.m4f3_error($sql$update public.organisations set time_zone='Mars/Base' where id='10000000-0000-0000-0000-000000000001'$sql$,'VALID_TIME_ZONE_REQUIRED','invalid time zones are rejected');
select pg_temp.m4f3_check(private.organisation_business_date('10000000-0000-0000-0000-000000000001')=(transaction_timestamp() at time zone 'Australia/Sydney')::date,'business date follows the Sydney default');
update public.organisations set time_zone='Australia/Brisbane' where id='10000000-0000-0000-0000-000000000001';
select pg_temp.m4f3_check(private.organisation_business_date('10000000-0000-0000-0000-000000000001')=(transaction_timestamp() at time zone 'Australia/Brisbane')::date,'business date follows a changed brokerage zone');
select pg_temp.m4f3_check((select (public.read_mortgage_retention_today('10000000-0000-0000-0000-000000000001',5)->>'businessDate')::date=(transaction_timestamp() at time zone 'Australia/Brisbane')::date),'retention queue uses the brokerage zone');
update public.organisations set time_zone='Australia/Sydney' where id='10000000-0000-0000-0000-000000000001';

set local role anon;
select pg_temp.m4f3_error($sql$select public.organisation_time_zone('10000000-0000-0000-0000-000000000001')$sql$,'permission denied','anonymous users cannot read a brokerage zone');
reset role;

-- Dana (Broker, owner of March household) runs household operations.
select set_config('request.jwt.claim.sub',(select user_id::text from public.organisation_memberships where id='30000000-0000-0000-0000-000000000004'),true);
set local role authenticated;
select pg_temp.m4f3_check(public.organisation_time_zone('10000000-0000-0000-0000-000000000001')='Australia/Sydney','members read their brokerage zone');
select pg_temp.m4f3_check(public.organisation_time_zone('10000000-0000-0000-0000-000000000002') is null,'RLS hides another brokerage zone');

-- (d) Household notes.
update m4f3_state set result=public.add_mortgage_household_note('10000000-0000-0000-0000-000000000001','4f300000-0000-4000-8000-000000000001','60000000-0000-0000-0000-000000000001','  4F3 note: prefers calls after 5 pm  ');
select pg_temp.m4f3_check((select body='4F3 note: prefers calls after 5 pm' from public.mortgage_household_notes n,m4f3_state s where n.id=(s.result->>'noteId')::uuid),'note is stored trimmed');
select pg_temp.m4f3_check((select count(*)=1 from public.activity_events e,m4f3_state s where e.event_type='household.note_added' and e.details->>'noteId'=s.result->>'noteId' and e.actor_type='person'),'note appends a person audit entry');
update m4f3_state set replay=public.add_mortgage_household_note('10000000-0000-0000-0000-000000000001','4f300000-0000-4000-8000-000000000001','60000000-0000-0000-0000-000000000001','  4F3 note: prefers calls after 5 pm  ');
select pg_temp.m4f3_check((select replay=result from m4f3_state) and (select count(*)=1 from public.mortgage_household_notes where body like '4F3 note:%'),'replaying a command is idempotent');
select pg_temp.m4f3_error($sql$select public.add_mortgage_household_note('10000000-0000-0000-0000-000000000001','4f300000-0000-4000-8000-000000000001','60000000-0000-0000-0000-000000000001','Changed body')$sql$,'COMMAND|reuse|conflict|different','changed input cannot reuse a command');
select pg_temp.m4f3_error($sql$select public.add_mortgage_household_note('10000000-0000-0000-0000-000000000001','4f300000-0000-4000-8000-000000000002','60000000-0000-0000-0000-000000000001','   ')$sql$,'VALID_NOTE_REQUIRED','empty notes are rejected');
select pg_temp.m4f3_error($sql$select public.add_mortgage_household_note('10000000-0000-0000-0000-000000000002','4f300000-0000-4000-8000-000000000003','60000000-0000-0000-0000-000000000002','Cross tenant')$sql$,'MEMBERSHIP|CAPABILITY|NOT_FOUND|denied','notes cannot be added in another brokerage');
select pg_temp.m4f3_error($sql$insert into public.mortgage_household_notes(organisation_id,household_id,body,author_membership_id) values('10000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','Direct','30000000-0000-0000-0000-000000000004')$sql$,'permission denied','direct note writes are denied');
select pg_temp.m4f3_error($sql$update public.mortgage_household_notes set body='Edited' where body like '4F3 note:%'$sql$,'permission denied|append-only','notes are append-only');

-- (e) Rate type on the seeded fixed-rate loan.
update m4f3_state set loan_version=(select version from public.mortgage_minimal_loan_records where id='70000000-0000-0000-0000-000000000001');
select pg_temp.m4f3_error((select format('select public.set_mortgage_loan_rate_type(%L,%L,%L,%s,%L)','10000000-0000-0000-0000-000000000001','4f300000-0000-4000-8000-000000000010','70000000-0000-0000-0000-000000000001',loan_version,'Variable') from m4f3_state),'VARIABLE_RATE_WITH_FIXED_EXPIRY','Variable is rejected while a fixed-rate expiry exists');
select pg_temp.m4f3_error((select format('select public.set_mortgage_loan_rate_type(%L,%L,%L,%s,%L)','10000000-0000-0000-0000-000000000001','4f300000-0000-4000-8000-000000000011','70000000-0000-0000-0000-000000000001',loan_version,'Interest only') from m4f3_state),'VALID_RATE_TYPE_REQUIRED','only Fixed, Variable or Split are accepted');
update m4f3_state set result=public.set_mortgage_loan_rate_type('10000000-0000-0000-0000-000000000001','4f300000-0000-4000-8000-000000000012','70000000-0000-0000-0000-000000000001',loan_version,'Split');
select pg_temp.m4f3_check((select l.rate_type='Split' and l.version=s.loan_version+1 from public.mortgage_minimal_loan_records l,m4f3_state s where l.id='70000000-0000-0000-0000-000000000001'),'rate type is set with a version bump');
select pg_temp.m4f3_check((select count(*)=1 from public.activity_events where event_type='loan.rate_type_set' and details->>'loanRecordId'='70000000-0000-0000-0000-000000000001' and actor_type='person'),'rate type change is audited');
select pg_temp.m4f3_error((select format('select public.set_mortgage_loan_rate_type(%L,%L,%L,%s,%L)','10000000-0000-0000-0000-000000000001','4f300000-0000-4000-8000-000000000013','70000000-0000-0000-0000-000000000001',loan_version,'Fixed') from m4f3_state),'STALE_LOAN_VERSION','stale loan versions are rejected');
select pg_temp.m4f3_error($sql$update public.mortgage_minimal_loan_records set rate_type='Fixed' where id='70000000-0000-0000-0000-000000000001'$sql$,'permission denied','direct rate type writes are denied');

reset role;
-- (c) Partner next step as Alex (Brokerage administrator).
select set_config('request.jwt.claim.sub',(select user_id::text from public.organisation_memberships where id='30000000-0000-0000-0000-000000000001'),true);
update m4f3_state set partner_version=(select version from public.mortgage_referral_partners where id='41000000-0000-0000-0000-000000000001');
set local role authenticated;
update m4f3_state set result=public.set_mortgage_referral_partner_next_step('10000000-0000-0000-0000-000000000001','4f300000-0000-4000-8000-000000000020','41000000-0000-0000-0000-000000000001',partner_version,'  Invite to the client event  ');
select pg_temp.m4f3_check((select r.next_step='Invite to the client event' and r.version=s.partner_version+1 from public.mortgage_referral_partners r,m4f3_state s where r.id='41000000-0000-0000-0000-000000000001'),'next step is stored trimmed with a version bump');
select pg_temp.m4f3_error((select format('select public.set_mortgage_referral_partner_next_step(%L,%L,%L,%s,%L)','10000000-0000-0000-0000-000000000001','4f300000-0000-4000-8000-000000000021','41000000-0000-0000-0000-000000000001',partner_version+1,repeat('x',201)) from m4f3_state),'NEXT_STEP_TOO_LONG|check','next steps over 200 characters are rejected');
update m4f3_state set result=public.set_mortgage_referral_partner_next_step('10000000-0000-0000-0000-000000000001','4f300000-0000-4000-8000-000000000022','41000000-0000-0000-0000-000000000001',partner_version+1,'');
select pg_temp.m4f3_check((select next_step is null from public.mortgage_referral_partners where id='41000000-0000-0000-0000-000000000001'),'an empty next step clears it');
select pg_temp.m4f3_check((select count(*)=2 from public.activity_events where event_type='referral_partner.next_step_set' and entity_id='41000000-0000-0000-0000-000000000001' and actor_type='person'),'next step changes are audited');

reset role;
select pg_temp.m4f3_check((select failed=0 and passed=30 from m4f3_results),'planned 4F.3 assertion count');
select passed,failed,'hosted 4F.3 transaction will roll back' outcome from m4f3_results;
rollback;

-- Independent residue check after rollback: every count must be 0 (and time_zone must be back to the default).
select
 (select count(*) from public.mortgage_household_notes where body like '4F3 note:%') notes,
 (select count(*) from public.operation_commands where command_id::text like '4f30%') commands,
 (select count(*) from public.activity_events where event_type in('household.note_added','loan.rate_type_set','referral_partner.next_step_set')) activities,
 (select count(*) from public.mortgage_minimal_loan_records where rate_type is not null) loans_with_rate_type,
 (select count(*) from public.organisations where time_zone<>'Australia/Sydney') non_default_zones;
