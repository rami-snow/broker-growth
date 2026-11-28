-- Milestone 4F.3 CSV import hosted verification for migrations 20261128090500_csv_import.sql and
-- 20261128090600_import_phone_matching_and_failure_codes.sql.
-- Development project only. Every mutation runs inside one transaction and rolls back.
-- All names and addresses are fictional and end in csvimport@example.test so residue is easy to find.
begin;
create temp table csv_results(passed integer not null default 0,failed integer not null default 0);
insert into csv_results default values;
grant select,update on csv_results to authenticated,anon;
create or replace function pg_temp.csv_check(condition boolean,label text)returns void language plpgsql as $$begin if condition then update csv_results set passed=passed+1;raise notice 'ok - %',label;else update csv_results set failed=failed+1;raise exception 'verification failed: %',label;end if;end$$;
grant execute on function pg_temp.csv_check(boolean,text) to authenticated,anon;
create or replace function pg_temp.csv_error(statement text,pattern text,label text)returns void language plpgsql as $$begin begin execute statement;perform pg_temp.csv_check(false,label);exception when others then if sqlerrm~*pattern then perform pg_temp.csv_check(true,label);else raise;end if;end;end$$;
grant execute on function pg_temp.csv_error(text,text,text) to authenticated,anon;
create temp table csv_state(name text primary key,result jsonb);
grant select,insert,update on csv_state to authenticated,anon;
create temp table csv_input(kind text primary key,records jsonb);
grant select on csv_input to authenticated,anon;
insert into csv_input values
('leads','[{"firstName":"Mila","lastName":"Hart","email":"mila.csvimport@example.test","loanPurpose":"Purchase","ownerMembershipId":"30000000-0000-0000-0000-000000000004"},
  {"firstName":"Mila","lastName":"Again","email":"MILA.csvimport@example.test"},
  {"firstName":"Bad","lastName":"Purpose","email":"bad.csvimport@example.test","loanPurpose":"Yacht"}]'),
('clients','[{"displayName":"Cove household","ownerMembershipId":"30000000-0000-0000-0000-000000000004",
  "members":[{"firstName":"Amelia","lastName":"Cove","email":"amelia.csvimport@example.test","relationship":"Primary applicant"},
             {"firstName":"Jonah","lastName":"Cove","email":"jonah.csvimport@example.test","relationship":"Joint applicant"}],
  "loans":[{"lenderName":"Example Mutual","rateType":"Fixed","fixedRateExpiryDate":"2027-01-20","nextReviewDate":"2026-12-10"}]},
 {"displayName":"Wrong owner household","ownerMembershipId":"30000000-0000-0000-0000-000000000003",
  "members":[{"firstName":"Wren","lastName":"Owner","email":"wren.csvimport@example.test"}]},
 {"displayName":"Variable household","ownerMembershipId":"30000000-0000-0000-0000-000000000004",
  "members":[{"firstName":"Vera","lastName":"Able","email":"vera.csvimport@example.test"}],
  "loans":[{"lenderName":"Example Mutual","rateType":"Variable","fixedRateExpiryDate":"2027-01-20"}]}]'),
('partners','[{"name":"Morgan Csvimport","organisationName":"North Quay Csvimport","type":"Accountant","ownerMembershipId":"30000000-0000-0000-0000-000000000004"}]');

-- Dana (Broker). The development seed gives her only lead capabilities, so grant import capabilities here;
-- they roll back with the transaction.
insert into public.membership_capabilities(organisation_id,membership_id,capability)
select '10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004',capability
from unnest(array['lead.create','lead.assign','mortgage.household.create','mortgage.loan-record.manage','mortgage.referral.manage']) capability
on conflict do nothing;
select set_config('request.jwt.claim.sub',(select user_id::text from public.organisation_memberships where id='30000000-0000-0000-0000-000000000004'),true);
set local role authenticated;

-- Preview is read-only and uses the same match rule.
insert into csv_state select 'preview',public.preview_mortgage_import('10000000-0000-0000-0000-000000000001','leads',records) from csv_input where kind='leads';
reset role;
select pg_temp.csv_check((select jsonb_array_length(result)=3 and result->0->>'status'='new' from csv_state where name='preview'),'preview reports each record');
select pg_temp.csv_check(not exists(select 1 from public.contacts where email_normalized like '%csvimport@example.test'),'preview writes nothing');

-- Leads: one created, one repeated within the file, one failed; failures do not stop the rest.
set local role authenticated;
insert into csv_state select 'leads',public.import_mortgage_records('10000000-0000-0000-0000-000000000001','c5f00000-0000-4000-8000-000000000001','leads',records) from csv_input where kind='leads';
reset role;
select pg_temp.csv_check((select array_agg(item->>'outcome' order by (item->>'index')::int)=array['created','repeated','failed'] from csv_state,jsonb_array_elements(result->'items') item where name='leads'),'lead outcomes are created, repeated, failed');
select pg_temp.csv_check((select count(*)=1 from public.contacts where email_normalized='mila.csvimport@example.test'),'a repeated row does not create a second contact');
select pg_temp.csv_check((select l.lifecycle_status='New' and l.source='Other' and l.owner_membership_id='30000000-0000-0000-0000-000000000004' from public.leads l join public.contacts c on c.organisation_id=l.organisation_id and c.id=l.contact_id where c.email_normalized='mila.csvimport@example.test'),'imported lead is New with its owner');
select pg_temp.csv_check(not exists(select 1 from public.contacts where email_normalized='bad.csvimport@example.test'),'a failed record leaves nothing behind');

-- Same command again returns the stored result; a new command with the same file creates nothing.
set local role authenticated;
insert into csv_state select 'replay',public.import_mortgage_records('10000000-0000-0000-0000-000000000001','c5f00000-0000-4000-8000-000000000001','leads',records) from csv_input where kind='leads';
reset role;
select pg_temp.csv_check((select r.result=l.result from csv_state r,csv_state l where r.name='replay' and l.name='leads'),'replaying a command returns the stored result');
set local role authenticated;
insert into csv_state select 'rerun',public.import_mortgage_records('10000000-0000-0000-0000-000000000001','c5f00000-0000-4000-8000-000000000002','leads',records) from csv_input where kind='leads';
reset role;
select pg_temp.csv_check((select result->'items'->0->>'outcome'='exists' from csv_state where name='rerun'),'re-importing the same file matches the existing lead');
select pg_temp.csv_check((select count(*)=1 from public.leads l join public.contacts c on c.organisation_id=l.organisation_id and c.id=l.contact_id where c.email_normalized='mila.csvimport@example.test'),'re-importing creates no duplicate lead');
set local role authenticated;
select pg_temp.csv_error($sql$select public.import_mortgage_records('10000000-0000-0000-0000-000000000001','c5f00000-0000-4000-8000-000000000001','leads','[]')$sql$,'COMMAND_ID_REUSE_CONFLICT','a command id cannot be reused for different records');

-- Clients: household with two members and a minimal loan; wrong owner and Variable-with-date fail per record.
insert into csv_state select 'clients',public.import_mortgage_records('10000000-0000-0000-0000-000000000001','c5f00000-0000-4000-8000-000000000003','clients',records) from csv_input where kind='clients';
reset role;
select pg_temp.csv_check((select array_agg(item->>'outcome' order by (item->>'index')::int)=array['created','failed','failed'] from csv_state,jsonb_array_elements(result->'items') item where name='clients'),'client outcomes are created, failed, failed');
select pg_temp.csv_check((select result->'items'->1->>'detail' like '%ACTIVE_BROKER_OWNER_REQUIRED%' and result->'items'->2->>'detail' like '%VARIABLE_RATE_WITH_FIXED_EXPIRY%' from csv_state where name='clients'),'failures name the reason');
select pg_temp.csv_check((select count(*)=2 and bool_or(is_primary) and count(*) filter(where is_primary)=1 from public.mortgage_household_members hm join public.mortgage_households h on h.organisation_id=hm.organisation_id and h.id=hm.household_id where h.display_name='Cove household'),'household has two members and one primary');
select pg_temp.csv_check((select l.source='CSV import' and l.data_confidence='Unverified' and l.rate_type='Fixed' and l.settlement_date is null from public.mortgage_minimal_loan_records l join public.mortgage_households h on h.organisation_id=l.organisation_id and h.id=l.household_id where h.display_name='Cove household'),'loan record is minimal, unverified and from CSV import');
select pg_temp.csv_check((select count(*)>=1 from public.mortgage_review_opportunities o join public.mortgage_minimal_loan_records l on l.organisation_id=o.organisation_id and l.id=o.loan_record_id join public.mortgage_households h on h.organisation_id=l.organisation_id and h.id=l.household_id where h.display_name='Cove household'),'review opportunities are generated for the imported loan');
select pg_temp.csv_check(not exists(select 1 from public.mortgage_households where display_name in('Wrong owner household','Variable household')),'failed households are not created');
set local role authenticated;
insert into csv_state select 'clients again',public.import_mortgage_records('10000000-0000-0000-0000-000000000001','c5f00000-0000-4000-8000-000000000004','clients',records) from csv_input where kind='clients';
reset role;
select pg_temp.csv_check((select result->'items'->0->>'outcome'='exists' and (select count(*)=1 from public.mortgage_households where display_name='Cove household') from csv_state where name='clients again'),'re-importing clients creates no duplicate household');

-- Partners: matched on name and organisation when there is no email or phone.
set local role authenticated;
insert into csv_state select 'partners',public.import_mortgage_records('10000000-0000-0000-0000-000000000001','c5f00000-0000-4000-8000-000000000005','partners',records) from csv_input where kind='partners';
reset role;
select pg_temp.csv_check((select result->'items'->0->>'outcome'='created' from csv_state where name='partners'),'partner is created');
set local role authenticated;
insert into csv_state select 'partners again',public.preview_mortgage_import('10000000-0000-0000-0000-000000000001','partners',records) from csv_input where kind='partners';
reset role;
select pg_temp.csv_check((select result->0->>'matchedOn'='name and organisation' from csv_state where name='partners again'),'partner without email or phone matches on name and organisation');

-- Audit and consent.
select pg_temp.csv_check((select count(*)>=6 and bool_and(actor_type='import' and actor_membership_id='30000000-0000-0000-0000-000000000004') from public.activity_events where occurred_at=transaction_timestamp()),'every import audit entry, including generated reviews, has actor import');
select pg_temp.csv_check((select count(*)>=1 from public.activity_events where occurred_at=transaction_timestamp() and event_type='opportunity.generated' and actor_type='import'),'trigger-generated review events are attributed to import');
select pg_temp.csv_check((select count(*)>0 and bool_and(status='Not recorded' and provenance='CSV import') from public.consent_evidence where contact_id in(select id from public.contacts where email_normalized like '%csvimport@example.test')),'consent is never inferred from a CSV import');
select pg_temp.csv_check(coalesce(current_setting('app.audit_actor_type',true),'')='','the import actor flag is cleared after the operation');
insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,actor_membership_id,occurred_at,details)
values('10000000-0000-0000-0000-000000000001','lead',gen_random_uuid(),'csvimport.probe','probe','30000000-0000-0000-0000-000000000004',clock_timestamp(),'{}');
select pg_temp.csv_check((select actor_type='person' from public.activity_events where event_type='csvimport.probe'),'later entries in the same transaction are attributed normally');

-- Phone forms, failure codes and what the command ledger keeps (migration 20261128090600).
select pg_temp.csv_check((select count(distinct private.normalise_phone_number(form))=1 and min(private.normalise_phone_number(form))='0400111222' from unnest(array['0400 111 222','(04) 0011 1222','+61 400 111 222','0061 400 111 222','+61 (0) 400 111 222']) form),'+61, 0061, +61 (0), brackets and spaces normalise to one number');
set local role authenticated;
insert into csv_state select 'phone one',public.import_mortgage_records('10000000-0000-0000-0000-000000000001','c5f00000-0000-4000-8000-000000000006','leads','[{"firstName":"Pia","lastName":"Csvimport","phone":"0400 919 293"}]');
insert into csv_state select 'phone two',public.import_mortgage_records('10000000-0000-0000-0000-000000000001','c5f00000-0000-4000-8000-000000000007','leads','[{"firstName":"Pia","lastName":"Again","phone":"+61 (0) 400 919 293"},{"firstName":"Ed","lastName":"Csvimport","email":"  ED.csvimport@Example.TEST ","nextActionAt":"x"}]');
insert into csv_state select 'email again',public.preview_mortgage_import('10000000-0000-0000-0000-000000000001','leads','[{"firstName":"Ed","lastName":"Csvimport","email":"ed.csvimport@example.test"}]');
insert into csv_state select 'bad date',public.import_mortgage_records('10000000-0000-0000-0000-000000000001','c5f00000-0000-4000-8000-000000000008','clients','[{"displayName":"Date household","ownerMembershipId":"30000000-0000-0000-0000-000000000004","members":[{"firstName":"Dee","lastName":"Csvimport","email":"dee.csvimport@example.test"}],"loans":[{"lenderName":"Example Mutual","nextReviewDate":"2027-02-31"}]}]');
reset role;
select pg_temp.csv_check((select result->'items'->0->>'outcome'='exists' and result->'items'->0->>'detail' like '%phone%' from csv_state where name='phone two'),'a +61 (0) number matches the same number written with a leading 0');
select pg_temp.csv_check((select result->'items'->1->>'outcome'='created' from csv_state where name='phone two') and (select result->0->>'status'='exists' from csv_state where name='email again'),'email is trimmed and matched case-insensitively');
select pg_temp.csv_check((select result->'items'->0->>'detail'='IMPORT_RECORD_FAILED:22008' from csv_state where name='bad date'),'a failed record stores an error code, not the database message');
select pg_temp.csv_check(not exists(select 1 from public.operation_commands where command_id::text like 'c5f00000%' and (result::text ~* 'csvimport|2027-02-31|0400|Example Mutual' or request_fingerprint !~ '^[0-9a-f]{32}$')),'the command ledger keeps only a fingerprint and outcomes, no names, emails, phones or values');

-- Refusals.
delete from public.membership_capabilities where membership_id='30000000-0000-0000-0000-000000000004' and capability='mortgage.referral.manage';
set local role authenticated;
select pg_temp.csv_error($sql$select public.import_mortgage_records('10000000-0000-0000-0000-000000000001',gen_random_uuid(),'partners','[]')$sql$,'CAPABILITY_REQUIRED:mortgage.referral.manage','import requires the capability for its kind');
select pg_temp.csv_error($sql$select public.preview_mortgage_import('10000000-0000-0000-0000-000000000001','partners','[]')$sql$,'CAPABILITY_REQUIRED:mortgage.referral.manage','preview requires the capability for its kind');
select pg_temp.csv_error($sql$select public.import_mortgage_records('10000000-0000-0000-0000-000000000002',gen_random_uuid(),'leads','[]')$sql$,'MEMBERSHIP|CAPABILITY','another brokerage cannot be imported into');
select pg_temp.csv_error($sql$select public.import_mortgage_records('10000000-0000-0000-0000-000000000001',gen_random_uuid(),'contracts','[]')$sql$,'VALID_IMPORT_KIND_REQUIRED','unknown kinds are rejected');
select pg_temp.csv_error($sql$select public.import_mortgage_records('10000000-0000-0000-0000-000000000001',gen_random_uuid(),'leads',(select jsonb_agg('{}'::jsonb) from generate_series(1,1001)))$sql$,'IMPORT_TOO_LARGE','more than 1000 records are rejected');
select pg_temp.csv_error($sql$select private.import_contact('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004','{}')$sql$,'permission denied','private import helpers are not callable');
reset role;
set local role anon;
select pg_temp.csv_error($sql$select public.preview_mortgage_import('10000000-0000-0000-0000-000000000001','leads','[]')$sql$,'permission denied','anonymous users cannot preview imports');
reset role;

select pg_temp.csv_check((select failed=0 and passed=36 from csv_results),'planned CSV import assertion count');
select passed,failed,'hosted CSV import transaction will roll back' outcome from csv_results;
rollback;

-- Independent residue check after rollback: every count must be 0.
select
 (select count(*) from public.contacts where email_normalized like '%csvimport@example.test') contacts,
 (select count(*) from public.mortgage_households where display_name in('Cove household','Wrong owner household','Variable household')) households,
 (select count(*) from public.mortgage_referral_partners where name='Morgan Csvimport') partners,
 (select count(*) from public.operation_commands where command_id::text like 'c5f00000%') commands,
 (select count(*) from public.activity_events where actor_type='import') import_activities;
