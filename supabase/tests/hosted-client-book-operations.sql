begin;

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
    and id='30000000-0000-0000-0000-000000000001'
),true);
set local role authenticated;

create temp table verification_state as
select
  '10000000-0000-0000-0000-000000000001'::uuid organisation_id,
  '30000000-0000-0000-0000-000000000001'::uuid actor_membership_id,
  public.create_mortgage_lead(
    '10000000-0000-0000-0000-000000000001','4c000001-0000-4000-8000-000000000001',
    'Mila','Verification','mila.4c.verification@example.test','0400 440 401',
    'Milestone 4C verification','Refinance','1–3 months','Email',
    '30000000-0000-0000-0000-000000000001'
  ) created;
alter table verification_state add column lead_id uuid;
update verification_state set lead_id=(created->>'leadId')::uuid;

select pg_temp.check_result(created->>'contactId' is not null,'lead contact created') from verification_state;
select pg_temp.check_result((created->>'version')::integer=1,'lead starts at version one') from verification_state;
select pg_temp.check_result((select count(*)=1 from public.leads l join verification_state s on l.id=s.lead_id),'lead is readable') ;
select pg_temp.check_result((select lifecycle_status='New' from public.leads l join verification_state s on l.id=s.lead_id),'lead starts new');

update verification_state set created=public.transition_lead(organisation_id,'4c000001-0000-4000-8000-000000000002',lead_id,1,'Contacted','Verification transition');
select pg_temp.check_result((created->>'version')::integer=2,'contacted increments version') from verification_state;
update verification_state set created=public.transition_lead(organisation_id,'4c000001-0000-4000-8000-000000000003',lead_id,2,'Discovery booked','Verification discovery');
select pg_temp.check_result((created->>'version')::integer=3,'discovery increments version') from verification_state;
select pg_temp.check_result((select lifecycle_status='Discovery booked' from public.leads l join verification_state s on l.id=s.lead_id),'lead is discovery booked');

alter table verification_state add column conversion jsonb;
update verification_state set conversion=public.convert_mortgage_lead_to_household(
  organisation_id,'4c000001-0000-4000-8000-000000000004',lead_id,3,'create-new',
  'Verification household',actor_membership_id,null,null,null,
  'Noah','Verification','noah.4c.verification@example.test','0400 440 402','Phone','Joint applicant',
  'RET-4C','Fictional Mutual','Refinance',current_date-365,null,null,current_date+5,
  'Active','Unverified'
);
alter table verification_state add column household_id uuid;
alter table verification_state add column contact_id uuid;
alter table verification_state add column joint_contact_id uuid;
alter table verification_state add column loan_id uuid;
update verification_state set household_id=(conversion->>'householdId')::uuid,
  contact_id=(conversion->>'contactId')::uuid,joint_contact_id=(conversion->>'jointContactId')::uuid,
  loan_id=(conversion->>'loanRecordId')::uuid;

select pg_temp.check_result((conversion->>'version')::integer=4,'conversion increments lead version') from verification_state;
select pg_temp.check_result((select lifecycle_status='Converted' from public.leads l join verification_state s on l.id=s.lead_id),'lead becomes converted');
select pg_temp.check_result((select version=4 from public.leads l join verification_state s on l.id=s.lead_id),'lead version is four');
select pg_temp.check_result((select l.contact_id=s.contact_id from public.leads l join verification_state s on l.id=s.lead_id),'durable lead contact reused');
select pg_temp.check_result((select primary_contact_id=s.contact_id from public.mortgage_households h join verification_state s on h.id=s.household_id),'lead contact is household primary');
select pg_temp.check_result((select count(*)=1 from public.mortgage_households h join verification_state s on h.id=s.household_id),'one household created');
select pg_temp.check_result((select source_lead_id=s.lead_id from public.mortgage_households h join verification_state s on h.id=s.household_id),'new household stores source lead');
select pg_temp.check_result((select count(*)=2 from public.mortgage_household_members hm join verification_state s on hm.household_id=s.household_id),'two members linked');
select pg_temp.check_result((select count(*)=1 from public.mortgage_household_members hm join verification_state s on hm.household_id=s.household_id where hm.is_primary),'exactly one primary member');
select pg_temp.check_result((select relationship='Joint applicant' from public.mortgage_household_members hm join verification_state s on hm.contact_id=s.joint_contact_id),'joint relationship recorded');
select pg_temp.check_result((select count(*)=3 from public.consent_evidence c join verification_state s on c.contact_id=s.joint_contact_id where c.status='Not recorded'),'joint consent explicitly not recorded');
select pg_temp.check_result((select count(*)=1 from public.mortgage_minimal_loan_records l join verification_state s on l.id=s.loan_id),'minimal loan created');
select pg_temp.check_result((select lender_name='Fictional Mutual' from public.mortgage_minimal_loan_records l join verification_state s on l.id=s.loan_id),'loan lender retained');
select pg_temp.check_result((select count(*)=1 from public.mortgage_review_opportunities r join verification_state s on r.loan_record_id=s.loan_id),'annual opportunity generated');
select pg_temp.check_result((select trigger_type='Annual review' from public.mortgage_review_opportunities r join verification_state s on r.loan_record_id=s.loan_id),'opportunity uses annual rule');
select pg_temp.check_result((select count(*)=1 from public.mortgage_lead_household_conversions c join verification_state s on c.lead_id=s.lead_id),'one conversion record created');
select pg_temp.check_result((select converted_by_membership_id=s.actor_membership_id from public.mortgage_lead_household_conversions c join verification_state s on c.lead_id=s.lead_id),'conversion actor derived from auth');
select pg_temp.check_result((select count(*)=7 from public.activity_events e join verification_state s on e.entity_id=s.household_id where e.entity_type='mortgage.household'),'complete household event sequence appended');
select pg_temp.check_result((select count(*)=1 from public.activity_events e join verification_state s on e.entity_id=s.household_id where e.event_type='household.created'),'household created event appended');
select pg_temp.check_result((select count(*)=1 from public.activity_events e join verification_state s on e.entity_id=s.household_id where e.event_type='household.member_added'),'joint member event appended');
select pg_temp.check_result((select count(*)=1 from public.activity_events e join verification_state s on e.entity_id=s.household_id where e.event_type='loan.created'),'loan created event appended');
select pg_temp.check_result((select count(*)=1 from public.activity_events e join verification_state s on e.entity_id=s.household_id where e.event_type='opportunity.generated'),'opportunity generated event appended');
select pg_temp.check_result((select count(*)=1 from public.activity_events e join verification_state s on e.entity_id=s.household_id where e.event_type='household.conversion_completed'),'conversion completion event appended');
select pg_temp.check_result((select count(*)=1 from public.activity_events e join verification_state s on e.entity_id=s.household_id where e.event_type='conversion.duplicate_reviewed'),'duplicate decision event appended');
select pg_temp.check_result((select count(*)=1 from public.activity_events e join verification_state s on e.entity_id=s.household_id where e.event_type='household.referral_attribution_recorded'),'referral attribution event appended');
select pg_temp.check_result((select details->>'decision'='create-new' from public.activity_events e join verification_state s on e.entity_id=s.household_id where e.event_type='conversion.duplicate_reviewed'),'duplicate decision structured');

select pg_temp.check_result(public.convert_mortgage_lead_to_household(
  organisation_id,'4c000001-0000-4000-8000-000000000004',lead_id,3,'create-new',
  'Verification household',actor_membership_id
)=conversion,'same command is idempotent') from verification_state;
select pg_temp.check_result((select count(*)=1 from public.mortgage_lead_household_conversions c join verification_state s on c.lead_id=s.lead_id),'idempotent replay creates no conversion');

do $$ declare denied boolean:=false; s verification_state%rowtype; begin select * into s from verification_state;
  begin perform public.convert_mortgage_lead_to_household(s.organisation_id,'4c000001-0000-4000-8000-000000000005',s.lead_id,3,'create-new','Stale',s.actor_membership_id);
  exception when serialization_failure then denied:=true; end;
  perform pg_temp.check_result(denied,'stale conversion rejected');
end $$;
do $$ declare denied boolean:=false; s verification_state%rowtype; begin select * into s from verification_state;
  begin perform public.convert_mortgage_lead_to_household('10000000-0000-0000-0000-000000000002','4c000001-0000-4000-8000-000000000006',s.lead_id,4,'create-new','Cross tenant',s.actor_membership_id);
  exception when others then denied:=true; end;
  perform pg_temp.check_result(denied,'cross-tenant conversion rejected');
end $$;

reset role;

-- Fictional authorization fixtures. Everything remains inside this transaction.
insert into public.membership_capabilities(organisation_id,membership_id,capability)
select '10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004',capability
from unnest(array[
  'contact.view','mortgage.household.view','mortgage.household.create',
  'mortgage.household.update','mortgage.loan-record.manage'
]) capability on conflict do nothing;

insert into public.contacts(id,organisation_id,given_name,family_name,email,email_normalized,phone,phone_normalized,preferred_contact_method,status) values
('4c110001-0000-4000-8000-000000000001','10000000-0000-0000-0000-000000000001','Existing','Match','other.owner.lead@example.test','other.owner.lead@example.test','0400 441 001','0400441001','Email','Active'),
('4c110001-0000-4000-8000-000000000002','10000000-0000-0000-0000-000000000001','Existing','Match','other.owner.household@example.test','other.owner.household@example.test','0400 441 002','0400441002','Email','Active'),
('4c110001-0000-4000-8000-000000000003','10000000-0000-0000-0000-000000000001','Assignable','Lead','assignable.lead@example.test','assignable.lead@example.test','0400 441 003','0400441003','Email','Active'),
('4c110001-0000-4000-8000-000000000004','10000000-0000-0000-0000-000000000001','No','Match','no.match@example.test','no.match@example.test','0400 441 004','0400441004','Email','Active'),
('4c110001-0000-4000-8000-000000000005','10000000-0000-0000-0000-000000000001','Existing','Household','existing.loan.lead@example.test','existing.loan.lead@example.test','0400 441 005','0400441005','Email','Active'),
('4c110001-0000-4000-8000-000000000006','10000000-0000-0000-0000-000000000001','Existing','Household','existing.loan.household@example.test','existing.loan.household@example.test','0400 441 006','0400441006','Email','Active');

insert into public.leads(id,organisation_id,contact_id,owner_membership_id,source,lifecycle_status,version) values
('4c120001-0000-4000-8000-000000000001','10000000-0000-0000-0000-000000000001','4c110001-0000-4000-8000-000000000001','30000000-0000-0000-0000-000000000004','4C.1 verification','Discovery booked',3),
('4c120001-0000-4000-8000-000000000002','10000000-0000-0000-0000-000000000001','4c110001-0000-4000-8000-000000000003','30000000-0000-0000-0000-000000000001','4C.1 verification','Discovery booked',3),
('4c120001-0000-4000-8000-000000000003','10000000-0000-0000-0000-000000000001','4c110001-0000-4000-8000-000000000004','30000000-0000-0000-0000-000000000004','4C.1 verification','Discovery booked',3),
('4c120001-0000-4000-8000-000000000004','10000000-0000-0000-0000-000000000001','4c110001-0000-4000-8000-000000000005','30000000-0000-0000-0000-000000000004','4C.1 verification','Discovery booked',3);

insert into public.mortgage_households(id,organisation_id,display_name,primary_contact_id,owner_membership_id,status) values
('4c130001-0000-4000-8000-000000000001','10000000-0000-0000-0000-000000000001','Other owner match household','4c110001-0000-4000-8000-000000000002','30000000-0000-0000-0000-000000000001','Active'),
('4c130001-0000-4000-8000-000000000002','10000000-0000-0000-0000-000000000001','Existing conversion household','4c110001-0000-4000-8000-000000000006','30000000-0000-0000-0000-000000000004','Active');
insert into public.mortgage_household_members(id,organisation_id,household_id,contact_id,relationship,is_primary) values
('4c140001-0000-4000-8000-000000000001','10000000-0000-0000-0000-000000000001','4c130001-0000-4000-8000-000000000001','4c110001-0000-4000-8000-000000000002','Primary applicant',true),
('4c140001-0000-4000-8000-000000000002','10000000-0000-0000-0000-000000000001','4c130001-0000-4000-8000-000000000002','4c110001-0000-4000-8000-000000000006','Primary applicant',true);

select set_config('request.jwt.claim.sub',(
  select user_id::text from public.organisation_memberships
  where organisation_id='10000000-0000-0000-0000-000000000001'
    and id='30000000-0000-0000-0000-000000000004'
),true);
set local role authenticated;

do $$ declare denied boolean:=false; begin
  begin perform public.convert_mortgage_lead_to_household(
    organisation_id=>'10000000-0000-0000-0000-000000000001',command_id=>'4c100001-0000-4000-8000-000000000001',
    lead_id=>'4c120001-0000-4000-8000-000000000001',expected_version=>3,duplicate_decision=>'add-existing',
    display_name=>'Ignored',owner_membership_id=>'30000000-0000-0000-0000-000000000004',existing_household_id=>'4c130001-0000-4000-8000-000000000001');
  exception when insufficient_privilege then denied:=true; end;
  perform pg_temp.check_result(denied,'broker cannot add contact to another owner household');
end $$;

reset role;
insert into public.membership_capabilities values
('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004','lead.assign',now());
set local role authenticated;
do $$ declare denied boolean:=false; begin
  begin perform public.convert_mortgage_lead_to_household(
    organisation_id=>'10000000-0000-0000-0000-000000000001',command_id=>'4c100001-0000-4000-8000-000000000002',
    lead_id=>'4c120001-0000-4000-8000-000000000002',expected_version=>3,duplicate_decision=>'create-new',
    display_name=>'Unauthorized owner household',owner_membership_id=>'30000000-0000-0000-0000-000000000001');
  exception when insufficient_privilege then denied:=true; end;
  perform pg_temp.check_result(denied,'lead assign does not authorize household owner assignment');
end $$;

reset role;
insert into public.membership_capabilities values
('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004','mortgage.household.assign',now());
set local role authenticated;
create temp table assignment_result as
select public.convert_mortgage_lead_to_household(
  organisation_id=>'10000000-0000-0000-0000-000000000001',command_id=>'4c100001-0000-4000-8000-000000000003',
  lead_id=>'4c120001-0000-4000-8000-000000000002',expected_version=>3,duplicate_decision=>'create-new',
  display_name=>'Authorized assigned household',owner_membership_id=>'30000000-0000-0000-0000-000000000001'
) result;
select pg_temp.check_result(result->>'householdId' is not null,'household assign authorizes assignment') from assignment_result;
select pg_temp.check_result((select h.owner_membership_id='30000000-0000-0000-0000-000000000001' from public.mortgage_households h where h.id=(result->>'householdId')::uuid),'authorized household owner stored') from assignment_result;
select pg_temp.check_result((select h.source_lead_id='4c120001-0000-4000-8000-000000000002' from public.mortgage_households h where h.id=(result->>'householdId')::uuid),'assigned household stores source lead') from assignment_result;

do $$ declare denied boolean:=false; begin
  begin perform public.convert_mortgage_lead_to_household(
    organisation_id=>'10000000-0000-0000-0000-000000000001',command_id=>'4c100001-0000-4000-8000-000000000004',
    lead_id=>'4c120001-0000-4000-8000-000000000003',expected_version=>3,duplicate_decision=>'add-existing',
    display_name=>'Ignored',owner_membership_id=>'30000000-0000-0000-0000-000000000004',existing_household_id=>'4c130001-0000-4000-8000-000000000001');
  exception when invalid_parameter_value then denied:=true; end;
  perform pg_temp.check_result(denied,'arbitrary nonmatching household rejected');
end $$;

create temp table existing_result as
select public.convert_mortgage_lead_to_household(
  organisation_id=>'10000000-0000-0000-0000-000000000001',command_id=>'4c100001-0000-4000-8000-000000000005',
  lead_id=>'4c120001-0000-4000-8000-000000000004',expected_version=>3,duplicate_decision=>'add-existing',
  display_name=>'Ignored submitted display',owner_membership_id=>'30000000-0000-0000-0000-000000000001',
  existing_household_id=>'4c130001-0000-4000-8000-000000000002',loan_external_reference=>'RET-4C1',
  loan_lender_name=>'Fictional Existing Mutual',loan_purpose=>'Refinance',loan_settlement_date=>current_date-365,
  loan_fixed_rate_expiry_date=>current_date+10,loan_next_review_date=>current_date+5,loan_status=>'Active',loan_data_confidence=>'Unverified'
) result;
select pg_temp.check_result(result->>'householdId'='4c130001-0000-4000-8000-000000000002','fresh duplicate match accepted') from existing_result;
select pg_temp.check_result((select l.owner_membership_id='30000000-0000-0000-0000-000000000004' from public.mortgage_minimal_loan_records l where l.id=(result->>'loanRecordId')::uuid),'existing household loan owner derived from household') from existing_result;
select pg_temp.check_result((select count(*)=1 from public.activity_events e where e.entity_id='4c130001-0000-4000-8000-000000000002' and e.event_type='household.member_added'),'existing conversion member event appended');
select pg_temp.check_result((select count(*)=1 from public.activity_events e where e.entity_id='4c130001-0000-4000-8000-000000000002' and e.event_type='loan.created'),'existing conversion loan event appended');
select pg_temp.check_result((select count(*)=2 from public.activity_events e where e.entity_id='4c130001-0000-4000-8000-000000000002' and e.event_type='opportunity.generated'),'one event per generated opportunity appended');
select pg_temp.check_result((select count(*)=1 from public.activity_events e where e.entity_id='4c130001-0000-4000-8000-000000000002' and e.event_type='conversion.duplicate_reviewed' and jsonb_array_length(e.details->'matches')>0),'duplicate event contains structured matches');
select pg_temp.check_result((select count(*)=1 from public.activity_events e where e.entity_id='4c120001-0000-4000-8000-000000000004' and e.event_type='lead.converted'),'lead converted event appended') from existing_result;
select pg_temp.check_result((select count(*)=1 from public.activity_events e where e.entity_id='4c130001-0000-4000-8000-000000000002' and e.event_type='household.conversion_completed'),'existing conversion completion appended');

reset role;
insert into public.consent_evidence(id,organisation_id,contact_id,channel,status,source,effective_at,recorded_at,provenance) values
('4c150001-0000-4000-8000-000000000001','10000000-0000-0000-0000-000000000001','4c110001-0000-4000-8000-000000000005','Email','Recorded','Fictional current','2026-11-01T00:00:00Z','2026-11-01T00:00:00Z','Imported fixture'),
('4c150001-0000-4000-8000-000000000002','10000000-0000-0000-0000-000000000001','4c110001-0000-4000-8000-000000000005','Email','Opted out','Fictional future opt-out','2026-11-18T00:00:00Z','2026-11-16T00:00:00Z','Imported fixture'),
('4c150001-0000-4000-8000-000000000003','10000000-0000-0000-0000-000000000001','4c110001-0000-4000-8000-000000000006','Email','Opted out','Fictional current','2026-11-02T00:00:00Z','2026-11-02T00:00:00Z','Imported fixture'),
('4c150001-0000-4000-8000-000000000004','10000000-0000-0000-0000-000000000001','4c110001-0000-4000-8000-000000000006','Email','Recorded','Fictional future re-consent','2026-11-19T00:00:00Z','2026-11-16T00:00:00Z','Imported fixture');
select pg_temp.check_result((select status='Recorded' from public.consent_evidence where contact_id='4c110001-0000-4000-8000-000000000005' and channel='Email' and effective_at<='2026-11-17T00:00:00Z' order by effective_at desc,recorded_at desc,id desc limit 1),'first member current consent ignores future opt-out');
select pg_temp.check_result((select status='Opted out' from public.consent_evidence where contact_id='4c110001-0000-4000-8000-000000000006' and channel='Email' and effective_at<='2026-11-17T00:00:00Z' order by effective_at desc,recorded_at desc,id desc limit 1),'second member current consent ignores future re-consent');
select pg_temp.check_result((select count(*)=2 from public.consent_evidence where id in ('4c150001-0000-4000-8000-000000000002','4c150001-0000-4000-8000-000000000004') and effective_at>'2026-11-17T00:00:00Z'),'future consent evidence retained but not current');

create temp table paging_baseline as select count(*)::integer household_count from public.mortgage_households where organisation_id='10000000-0000-0000-0000-000000000001';
create temp table paging_seed as
select n,gen_random_uuid() contact_id,gen_random_uuid() household_id
from generate_series(1,205) n;
grant select on paging_baseline, paging_seed to authenticated;
insert into public.contacts(id,organisation_id,given_name,family_name,email,email_normalized,phone,phone_normalized,preferred_contact_method,status)
select contact_id,'10000000-0000-0000-0000-000000000001',
  case when n=205 then 'Searchable' else 'Paging' end,
  case when n=205 then 'Beyond Two Hundred' else lpad(n::text,3,'0') end,
  case when n=205 then 'beyond.200@example.test' else 'paging.'||n||'@example.test' end,
  case when n=205 then 'beyond.200@example.test' else 'paging.'||n||'@example.test' end,
  '0400 55'||lpad(n::text,4,'0'),'040055'||lpad(n::text,4,'0'),'Email','Active'
from paging_seed;
insert into public.mortgage_households(id,organisation_id,display_name,primary_contact_id,owner_membership_id,status)
select household_id,'10000000-0000-0000-0000-000000000001',
  case when n in (1,2) then 'Stable household' else 'Paging household '||lpad(n::text,3,'0') end,
  contact_id,'30000000-0000-0000-0000-000000000001','Active'
from paging_seed;
insert into public.mortgage_household_members(organisation_id,household_id,contact_id,relationship,is_primary)
select '10000000-0000-0000-0000-000000000001',household_id,contact_id,'Primary applicant',true from paging_seed;
insert into public.contacts(id,organisation_id,given_name,family_name,email,email_normalized,phone,phone_normalized,preferred_contact_method,status) values
('4c110001-0000-4000-8000-000000000099','10000000-0000-0000-0000-000000000001','Searchable','Beyond Two Hundred','lead.beyond.200@example.test','lead.beyond.200@example.test','0400 559 999','0400559999','Email','Active');
insert into public.leads(id,organisation_id,contact_id,owner_membership_id,source,lifecycle_status,version) values
('4c120001-0000-4000-8000-000000000099','10000000-0000-0000-0000-000000000001','4c110001-0000-4000-8000-000000000099','30000000-0000-0000-0000-000000000004','4C.1 pagination verification','Discovery booked',3);

-- Refresh planner statistics so the 205 rows inserted above are visible to the planner. Without this it assumes
-- ~1 row per table and picks a contact x household cross product with per-row RLS checks (85 s+ instead of 0.02 s).
-- ANALYZE runs inside this transaction and its statistics roll back with it.
analyze public.contacts, public.leads, public.mortgage_households, public.mortgage_household_members;

set local role authenticated;
create temp table paging_result as select public.list_mortgage_households('10000000-0000-0000-0000-000000000001',null,null,null,'name',1,25) result;
select pg_temp.check_result((result->>'total')::integer=(select household_count+205 from paging_baseline),'database total is exact beyond two hundred') from paging_result;
select pg_temp.check_result(jsonb_array_length(result->'rows')=25,'database page remains bounded') from paging_result;
select pg_temp.check_result((public.list_mortgage_households('10000000-0000-0000-0000-000000000001','beyond.200@example.test',null,null,'name',1,25)->>'total')::integer=1,'search finds member beyond old contact limit');
select pg_temp.check_result((public.list_mortgage_households('10000000-0000-0000-0000-000000000001','Stable household',null,null,'name',1,25)->'rows'->0->>'id')::uuid=(select household_id from paging_seed where n in (1,2) order by household_id limit 1),'name ordering uses stable ID tie breaker');
select pg_temp.check_result((public.list_mortgage_households('10000000-0000-0000-0000-000000000002',null,null,null,'name',1,25)->>'total')::integer=0,'security invoker list hides cross tenant rows');
select pg_temp.check_result((select count(*)=1 from public.find_mortgage_lead_household_duplicates('10000000-0000-0000-0000-000000000001','4c120001-0000-4000-8000-000000000099') d where d.household_id=(select household_id from paging_seed where n=205)),'duplicate preview finds match beyond old candidate limit');

reset role;
select pg_temp.check_result((select passed=60 and failed=0 from verification_results),'planned assertion count');
select passed,failed,'transaction will roll back' as outcome from verification_results;
rollback;
