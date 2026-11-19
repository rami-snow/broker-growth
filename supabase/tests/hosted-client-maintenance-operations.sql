-- Milestone 4E hosted Client Book maintenance verification.
-- Every mutation is contained in this transaction and the suite always rolls back.
begin;

create temp table verification_results(passed integer not null default 0, failed integer not null default 0);
insert into verification_results default values;
grant select,update on verification_results to authenticated,anon;

create or replace function pg_temp.check_result(condition boolean,label text) returns void
language plpgsql as $$
begin
  if condition then
    update verification_results set passed=passed+1;
    raise notice 'ok - %',label;
  else
    update verification_results set failed=failed+1;
    raise exception 'verification failed: %',label;
  end if;
end
$$;
grant execute on function pg_temp.check_result(boolean,text) to authenticated,anon;

create or replace function pg_temp.expect_error(statement text,pattern text,label text) returns void
language plpgsql as $$
begin
  begin
    execute statement;
    perform pg_temp.check_result(false,label);
  exception when others then
    if sqlerrm ~* pattern then perform pg_temp.check_result(true,label); else raise; end if;
  end;
end
$$;
grant execute on function pg_temp.expect_error(text,text,text) to authenticated,anon;

create or replace function pg_temp.expect_error_without(statement text,pattern text,forbidden_pattern text,label text) returns void
language plpgsql as $$
begin
  begin
    execute statement;
    perform pg_temp.check_result(false,label);
  exception when others then
    if sqlerrm ~* pattern and sqlerrm !~* forbidden_pattern then
      perform pg_temp.check_result(true,label);
    else raise; end if;
  end;
end
$$;
grant execute on function pg_temp.expect_error_without(text,text,text,text) to authenticated,anon;

create temp table verification_state(
  household_id uuid,primary_contact_id uuid,joint_contact_id uuid,
  name_household_id uuid,existing_household_id uuid,task_id uuid,
  second_task_id uuid,loan_id uuid,opportunity_id uuid,
  household_version integer,contact_version integer,consent_count integer
);
insert into verification_state default values;
grant select,update on verification_state to authenticated,anon;

-- Authentication and capability boundary.
set local role anon;
select pg_temp.expect_error(
  $sql$select public.preview_mortgage_manual_contact_duplicates('10000000-0000-0000-0000-000000000001','Fictional','Person','fictional@example.test',null)$sql$,
  'AUTHENTICATION_REQUIRED|permission denied','anonymous duplicate preview is rejected');

reset role;
select set_config('request.jwt.claim.sub',(select user_id::text from public.organisation_memberships where id='30000000-0000-0000-0000-000000000005'),true);
set local role authenticated;
select pg_temp.expect_error(
  $sql$select public.preview_mortgage_manual_contact_duplicates('10000000-0000-0000-0000-000000000001','Fictional','Person','fictional@example.test',null)$sql$,
  'ACTIVE_ORGANISATION_MEMBERSHIP_REQUIRED','inactive membership is rejected');

reset role;
select set_config('request.jwt.claim.sub',(select user_id::text from public.organisation_memberships where id='30000000-0000-0000-0000-000000000004'),true);
set local role authenticated;
select pg_temp.expect_error(
  $sql$select public.preview_mortgage_manual_contact_duplicates('10000000-0000-0000-0000-000000000001','Fictional','Person','fictional@example.test',null)$sql$,
  'CAPABILITY_REQUIRED:mortgage.household.create','missing creation capability is rejected');

-- Dana is an active Broker. Give this actor create/update without assign or
-- contact.view to exercise the exact capability combinations introduced in 4E.1.
reset role;
insert into public.membership_capabilities(organisation_id,membership_id,capability) values
('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004','mortgage.household.create'),
('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004','mortgage.household.update')
on conflict do nothing;
update public.mortgage_membership_profiles set position='Broker'
where organisation_id='10000000-0000-0000-0000-000000000001'
  and membership_id='30000000-0000-0000-0000-000000000006';
select set_config('request.jwt.claim.sub',(select user_id::text from public.organisation_memberships where id='30000000-0000-0000-0000-000000000004'),true);
set local role authenticated;

select pg_temp.expect_error_without(
  $sql$select public.preview_mortgage_manual_contact_duplicates('10000000-0000-0000-0000-000000000001','No','Match','no.match.4e1@example.test','0499410000')$sql$,
  'CAPABILITY_REQUIRED:contact.view','No|Match|no.match|0499410000|household','zero-row duplicate preview requires contact.view without leaking submitted or household data');
select pg_temp.expect_error_without(
  $sql$select public.preview_mortgage_manual_contact_duplicates('10000000-0000-0000-0000-000000000001','Ruby','March','ruby.march@example.test','0490100001')$sql$,
  'CAPABILITY_REQUIRED:contact.view','Ruby|March|ruby.march|0490100001|household','matching duplicate preview requires contact.view without leaking PII or associations');
select pg_temp.expect_error_without(
  $sql$select * from public.search_mortgage_contact_options('10000000-0000-0000-0000-000000000001','zz',null)$sql$,
  'CAPABILITY_REQUIRED:contact.view','Ruby|March|Amelia|Cove|@|0490|household','zero-row interactive lookup requires contact.view without leaking PII');
select pg_temp.expect_error_without(
  $sql$select * from public.search_mortgage_contact_options('10000000-0000-0000-0000-000000000001','ruby',null)$sql$,
  'CAPABILITY_REQUIRED:contact.view','Ruby|March|ruby.march|0490|household','matching interactive lookup requires contact.view without leaking PII');
select pg_temp.expect_error_without(
  $sql$select public.create_mortgage_household_manual('10000000-0000-0000-0000-000000000001','4e010000-0000-4000-8000-000000000001','Guessed contact','30000000-0000-0000-0000-000000000004',null,'40000000-0000-0000-0000-000000000001',null,null,null,null,null,false,'none',null,null,null,null,null,null,null,false)$sql$,
  'CAPABILITY_REQUIRED:contact.view','Ruby|March|ruby.march|0490|household association','guessed same-organisation primary contact is rejected without PII leakage');
select pg_temp.expect_error_without(
  $sql$select public.create_mortgage_household_manual('10000000-0000-0000-0000-000000000001','4e010000-0000-4000-8000-000000000002','Cross guessed contact','30000000-0000-0000-0000-000000000004',null,'40000000-0000-0000-0000-000000000003',null,null,null,null,null,false,'none',null,null,null,null,null,null,null,false)$sql$,
  'CAPABILITY_REQUIRED:contact.view','Nora|Wells|nora.wells|0490|household association','guessed cross-organisation primary contact remains unavailable');
select pg_temp.expect_error_without(
  $sql$select public.add_mortgage_household_member('10000000-0000-0000-0000-000000000001','4e010000-0000-4000-8000-000000000003','60000000-0000-0000-0000-000000000001',1,'existing','40000000-0000-0000-0000-000000000002',null,null,null,null,null,'Other',false)$sql$,
  'CAPABILITY_REQUIRED:contact.view','Amelia|Cove|amelia.cove|0490|household association','guessed existing member is rejected without PII leakage');
select pg_temp.expect_error_without(
  $sql$select public.add_mortgage_household_member('10000000-0000-0000-0000-000000000001','4e010000-0000-4000-8000-000000000004','60000000-0000-0000-0000-000000000001',1,'existing','40000000-0000-0000-0000-000000000003',null,null,null,null,null,'Other',false)$sql$,
  'CAPABILITY_REQUIRED:contact.view','Nora|Wells|nora.wells|0490|household association','guessed cross-organisation member remains unavailable');
select pg_temp.expect_error(
  $sql$select public.create_mortgage_household_manual('10000000-0000-0000-0000-000000000001','4e010000-0000-4000-8000-000000000005','Alternate owner','30000000-0000-0000-0000-000000000006',null,null,'Alternate','Owner','alternate.owner.4e1@example.test','0499410005','Email',false,'none',null,null,null,null,null,null,null,false)$sql$,
  'HOUSEHOLD_OWNER_SELF_ASSIGNMENT_REQUIRED','create without household.assign rejects an alternate active Broker');
select pg_temp.check_result(
  (public.create_mortgage_household_manual('10000000-0000-0000-0000-000000000001','4e010000-0000-4000-8000-000000000006','Self owner','30000000-0000-0000-0000-000000000004',null,null,'Self','Owner','self.owner.4e1@example.test','0499410006','Email',false,'none',null,null,null,null,null,null,null,false)->>'householdId') is not null,
  'create without household.assign permits an active Broker to own the new household');

-- Alex has the complete guarded capability bundle in the fictional seed.
reset role;
select set_config('request.jwt.claim.sub',(select user_id::text from public.organisation_memberships where id='30000000-0000-0000-0000-000000000001'),true);
set local role authenticated;

select pg_temp.check_result(
  (select reasons @> array['exact_email']::text[] from public.preview_mortgage_manual_contact_duplicates(
    '10000000-0000-0000-0000-000000000001','Different','Name','RUBY.MARCH@EXAMPLE.TEST',null)
   where contact_id='40000000-0000-0000-0000-000000000001'),
  'duplicate preview normalizes exact email');
select pg_temp.check_result(
  (select reasons @> array['exact_phone']::text[] from public.preview_mortgage_manual_contact_duplicates(
    '10000000-0000-0000-0000-000000000001','Different','Name',null,'0490-100-001')
   where contact_id='40000000-0000-0000-0000-000000000001'),
  'duplicate preview normalizes exact phone');
select pg_temp.check_result(
  (select reasons @> array['normalized_full_name']::text[] from public.preview_mortgage_manual_contact_duplicates(
    '10000000-0000-0000-0000-000000000001',' ruby ',' MARCH ',null,null)
   where contact_id='40000000-0000-0000-0000-000000000001'),
  'duplicate preview normalizes exact full name');
select pg_temp.check_result(
  (select jsonb_array_length(households)=1 and households->0->>'householdName'='March household'
   from public.preview_mortgage_manual_contact_duplicates(
    '10000000-0000-0000-0000-000000000001','Ruby','March',null,null)
   where contact_id='40000000-0000-0000-0000-000000000001'),
  'duplicate preview returns household context');
select pg_temp.check_result(
  not exists(select 1 from public.preview_mortgage_manual_contact_duplicates(
    '10000000-0000-0000-0000-000000000001','Nora','Wells','nora.wells@example.test','0490100003')),
  'duplicate preview never exposes cross-organisation contacts');
select pg_temp.expect_error(
  $sql$select * from public.search_mortgage_contact_options('10000000-0000-0000-0000-000000000001','r',null)$sql$,
  'MEANINGFUL_CONTACT_SEARCH_REQUIRED','interactive contact lookup requires at least two non-whitespace characters');
select pg_temp.check_result(
  (select count(*)=1 and min(contact_name)='Ruby March' from public.search_mortgage_contact_options('10000000-0000-0000-0000-000000000001','RUBY.MARCH',null)),
  'interactive contact lookup searches normalized email and returns selector fields');
select pg_temp.check_result(
  not exists(select 1 from public.search_mortgage_contact_options('10000000-0000-0000-0000-000000000001','ruby','60000000-0000-0000-0000-000000000001')),
  'interactive contact lookup can exclude contacts already attached to a household');
select pg_temp.check_result(
  not exists(select 1 from public.search_mortgage_contact_options('10000000-0000-0000-0000-000000000001','nora',null)),
  'interactive contact lookup remains tenant scoped');
select pg_temp.check_result(
  (select count(*)<=25 from public.search_mortgage_contact_options('10000000-0000-0000-0000-000000000001','example.test',null)),
  'interactive contact lookup is capped at 25 deterministic rows');

-- Atomic manual creation with two new contacts.
update verification_state set household_id=(result->>'householdId')::uuid,
  primary_contact_id=(result->>'primaryContactId')::uuid,
  joint_contact_id=(result->>'jointContactId')::uuid,household_version=(result->>'version')::integer
from (select public.create_mortgage_household_manual(
  '10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000001',
  '4E fictional household','30000000-0000-0000-0000-000000000004','41000000-0000-0000-0000-000000000001',
  null,'Avery','Verification','AVERY.4E@EXAMPLE.TEST','0499 400 001','Email',false,
  'new',null,'Jordan','Verification','jordan.4e@example.test','0499 400 002','Phone','Joint applicant',false
) result) created;
select pg_temp.check_result((select household_version=1 from verification_state),'manual creation returns household version one');
select pg_temp.check_result((select count(*)=1 from public.mortgage_households h,verification_state s where h.id=s.household_id and h.display_name='4E fictional household' and h.owner_membership_id='30000000-0000-0000-0000-000000000004' and h.referral_partner_id='41000000-0000-0000-0000-000000000001' and h.status='Active' and h.version=1),'manual household persists owner referral and version atomically');
select pg_temp.check_result((select count(*)=2 from public.mortgage_household_members m,verification_state s where m.household_id=s.household_id),'manual creation persists exactly two members');
select pg_temp.check_result((select bool_and((m.is_primary and m.relationship='Primary applicant') or (not m.is_primary and m.relationship='Joint applicant')) from public.mortgage_household_members m,verification_state s where m.household_id=s.household_id),'manual creation persists primary and joint relationships');
select pg_temp.check_result((select count(*)=2 and min(version)=1 and max(version)=1 from public.contacts c,verification_state s where c.id in(s.primary_contact_id,s.joint_contact_id)),'new contacts start at version one');
select pg_temp.check_result((select email_normalized='avery.4e@example.test' and phone_normalized='0499400001' from public.contacts c,verification_state s where c.id=s.primary_contact_id),'new contact details are normalized in the database');
select pg_temp.check_result((select count(*)=6 from public.consent_evidence e,verification_state s where e.contact_id in(s.primary_contact_id,s.joint_contact_id) and e.channel in('Email','SMS','Phone') and e.status='Not recorded' and not e.external_action_confirmed),'each new contact gets three explicit Not recorded records');
select pg_temp.check_result((select count(*)=0 from public.consent_evidence e,verification_state s where e.contact_id in(s.primary_contact_id,s.joint_contact_id) and e.status='Recorded'),'contact details and relationships never infer consent');
select pg_temp.check_result((select count(*)=1 from public.activity_events e,verification_state s where e.entity_id=s.household_id and e.event_type='household.created'),'manual creation appends structured household activity');

select pg_temp.check_result(
  (select public.create_mortgage_household_manual(
    '10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000001',
    '4E fictional household','30000000-0000-0000-0000-000000000004','41000000-0000-0000-0000-000000000001',
    null,'Avery','Verification','AVERY.4E@EXAMPLE.TEST','0499 400 001','Email',false,
    'new',null,'Jordan','Verification','jordan.4e@example.test','0499 400 002','Phone','Joint applicant',false
  )=(select jsonb_build_object('householdId',household_id,'primaryContactId',primary_contact_id,'jointContactId',joint_contact_id,'version',1) from verification_state)),
  'same command and canonical input is idempotent');
select pg_temp.check_result((select count(*)=1 from public.mortgage_households where display_name='4E fictional household'),'idempotent retry creates no duplicate household');
select pg_temp.expect_error(
  $sql$select public.create_mortgage_household_manual('10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000001','Changed input','30000000-0000-0000-0000-000000000004',null,'40000000-0000-0000-0000-000000000001',null,null,null,null,null,false,'none',null,null,null,null,null,null,null,false)$sql$,
  'COMMAND_ID_REUSE_CONFLICT','changed-input command reuse is rejected');

-- Final transaction repeats duplicate validation.
select pg_temp.expect_error(
  $sql$select public.create_mortgage_household_manual('10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000002','Email collision','30000000-0000-0000-0000-000000000004',null,null,'Email','Collision','ruby.march@example.test','0499400010','Email',false,'none',null,null,null,null,null,null,null,false)$sql$,
  'EXACT_CONTACT_MATCH_REQUIRES_EXISTING','final creation rejects exact email duplicate without trusting preview');
select pg_temp.expect_error(
  $sql$select public.create_mortgage_household_manual('10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000003','Phone collision','30000000-0000-0000-0000-000000000004',null,null,'Phone','Collision','unique.phone@example.test','0490 100 001','Phone',false,'none',null,null,null,null,null,null,null,false)$sql$,
  'EXACT_CONTACT_MATCH_REQUIRES_EXISTING','final creation rejects exact phone duplicate');
select pg_temp.expect_error(
  $sql$select public.create_mortgage_household_manual('10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000004','Name collision','30000000-0000-0000-0000-000000000004',null,null,'Ruby','March','ruby.distinct@example.test','0499400011','Email',false,'none',null,null,null,null,null,null,null,false)$sql$,
  'NAME_MATCH_ACKNOWLEDGEMENT_REQUIRED','name-only duplicate requires explicit acknowledgment');
update verification_state set name_household_id=(result->>'householdId')::uuid
from (select public.create_mortgage_household_manual(
  '10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000005',
  'Acknowledged name match','30000000-0000-0000-0000-000000000004',null,null,
  'Ruby','March','ruby.distinct@example.test','0499400011','Email',true,
  'none',null,null,null,null,null,null,null,false) result) acknowledged;
select pg_temp.check_result((select name_household_id is not null from verification_state),'acknowledged name-only match may create a distinct contact');

-- Existing contact selection preserves existing consent exactly.
update verification_state set consent_count=(select count(*) from public.consent_evidence where contact_id='40000000-0000-0000-0000-000000000001');
update verification_state set existing_household_id=(result->>'householdId')::uuid
from (select public.create_mortgage_household_manual(
  '10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000006',
  'Existing contact household','30000000-0000-0000-0000-000000000004',null,
  '40000000-0000-0000-0000-000000000001',null,null,null,null,null,false,
  'none',null,null,null,null,null,null,null,false) result) existing_created;
select pg_temp.check_result((select count(*)=1 from public.mortgage_household_members m,verification_state s where m.household_id=s.existing_household_id and m.contact_id='40000000-0000-0000-0000-000000000001' and m.is_primary),'existing contact can become the primary member');
select pg_temp.check_result((select count(*)=s.consent_count from public.consent_evidence e,verification_state s where e.contact_id='40000000-0000-0000-0000-000000000001' group by s.consent_count),'existing contact selection preserves consent evidence');

-- Invalid owner and referral boundaries.
select pg_temp.expect_error(
  $sql$select public.create_mortgage_household_manual('10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000007','Non broker owner','30000000-0000-0000-0000-000000000001',null,'40000000-0000-0000-0000-000000000001',null,null,null,null,null,false,'none',null,null,null,null,null,null,null,false)$sql$,
  'ACTIVE_BROKER_OWNER_REQUIRED','non-Broker household owner is rejected');
select pg_temp.expect_error(
  $sql$select public.create_mortgage_household_manual('10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000008','Cross tenant owner','30000000-0000-0000-0000-000000000002',null,'40000000-0000-0000-0000-000000000001',null,null,null,null,null,false,'none',null,null,null,null,null,null,null,false)$sql$,
  'ACTIVE_BROKER_OWNER_REQUIRED','cross-tenant Broker owner is rejected');

reset role;
insert into public.mortgage_referral_partners(id,organisation_id,name,partner_type,status,owner_membership_id)
values('4e100000-0000-4000-8000-000000000001','10000000-0000-0000-0000-000000000001','Inactive fictional referral','Other','Inactive','30000000-0000-0000-0000-000000000004'),
('4e100000-0000-4000-8000-000000000002','10000000-0000-0000-0000-000000000002','Cross tenant fictional referral','Other','Active','30000000-0000-0000-0000-000000000002');
select set_config('request.jwt.claim.sub',(select user_id::text from public.organisation_memberships where id='30000000-0000-0000-0000-000000000001'),true);
set local role authenticated;
select pg_temp.expect_error(
  $sql$select public.create_mortgage_household_manual('10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000009','Inactive referral','30000000-0000-0000-0000-000000000004','4e100000-0000-4000-8000-000000000001','40000000-0000-0000-0000-000000000001',null,null,null,null,null,false,'none',null,null,null,null,null,null,null,false)$sql$,
  'ACTIVE_REFERRAL_PARTNER_REQUIRED','inactive referral is rejected');
select pg_temp.expect_error(
  $sql$select public.create_mortgage_household_manual('10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000010','Cross referral','30000000-0000-0000-0000-000000000004','4e100000-0000-4000-8000-000000000002','40000000-0000-0000-0000-000000000001',null,null,null,null,null,false,'none',null,null,null,null,null,null,null,false)$sql$,
  'ACTIVE_REFERRAL_PARTNER_REQUIRED','cross-tenant referral is rejected');

-- Household and contact maintenance with optimistic concurrency.
select public.update_mortgage_household_details(
  '10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000011',
  household_id,1,'4E updated household',null) from verification_state;
update verification_state set household_version=2;
select pg_temp.check_result((select count(*)=1 from public.mortgage_households h,verification_state s where h.id=s.household_id and h.display_name='4E updated household' and h.referral_partner_id is null and h.version=2),'household name and referral clearing increment version');
select pg_temp.expect_error(
  (select format('select public.update_mortgage_household_details(%L,%L,%L,1,%L,null)','10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000012',household_id,'stale') from verification_state),
  'STALE_HOUSEHOLD_VERSION','stale household update is rejected');

update verification_state set consent_count=(select count(*) from public.consent_evidence e where e.contact_id=verification_state.primary_contact_id);
select public.update_mortgage_primary_contact(
  '10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000013',
  household_id,2,1,'avery.updated@example.test','0499 400 099','SMS') from verification_state;
update verification_state set contact_version=2;
select pg_temp.check_result((select email_normalized='avery.updated@example.test' and phone_normalized='0499400099' and preferred_contact_method='SMS' and version=2 from public.contacts c,verification_state s where c.id=s.primary_contact_id),'primary contact update normalizes values and increments contact version');
select pg_temp.check_result((select count(*)=s.consent_count from public.consent_evidence e,verification_state s where e.contact_id=s.primary_contact_id group by s.consent_count),'contact update preserves all consent evidence');
select pg_temp.expect_error(
  (select format('select public.update_mortgage_primary_contact(%L,%L,%L,2,1,%L,%L,%L)','10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000014',household_id,'new@example.test','0499400098','Email') from verification_state),
  'STALE_CONTACT_VERSION','stale contact version is rejected');
select pg_temp.expect_error(
  (select format('select public.update_mortgage_primary_contact(%L,%L,%L,2,2,%L,%L,%L)','10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000015',household_id,'ruby.march@example.test','0499400098','Email') from verification_state),
  'CONTACT_DETAIL_COLLISION','contact update rejects exact collision with another contact');

select public.add_mortgage_household_member(
  '10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000016',
  household_id,2,'existing','40000000-0000-0000-0000-000000000002',null,null,null,null,null,'Guarantor',false)
from verification_state;
update verification_state set household_version=3;
select pg_temp.check_result((select count(*)=1 from public.mortgage_household_members m,verification_state s where m.household_id=s.household_id and m.contact_id='40000000-0000-0000-0000-000000000002' and m.relationship='Guarantor' and not m.is_primary),'existing non-primary member is added with controlled relationship');
select pg_temp.check_result((select version=3 from public.mortgage_households h,verification_state s where h.id=s.household_id),'member addition increments household version');

-- Non-owner mutation is denied even with the nominal update capability.
reset role;
insert into public.membership_capabilities(organisation_id,membership_id,capability)
values('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000006','mortgage.household.update'),
('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000006','task.update')
on conflict do nothing;
select set_config('request.jwt.claim.sub',(select user_id::text from public.organisation_memberships where id='30000000-0000-0000-0000-000000000006'),true);
set local role authenticated;
select pg_temp.expect_error(
  (select format('select public.update_mortgage_household_details(%L,%L,%L,3,%L,null)','10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000017',household_id,'unauthorized') from verification_state),
  'HOUSEHOLD_OWNERSHIP_REQUIRED','non-owner household mutation is rejected');

-- Owner assignment updates loans only; opportunity and task assignments remain explicit.
reset role;
update public.mortgage_membership_profiles set position='Broker'
where organisation_id='10000000-0000-0000-0000-000000000001' and membership_id='30000000-0000-0000-0000-000000000006';
select set_config('request.jwt.claim.sub',(select user_id::text from public.organisation_memberships where id='30000000-0000-0000-0000-000000000001'),true);
set local role authenticated;
update verification_state set loan_id=(result->>'loanRecordId')::uuid
from (select public.add_mortgage_minimal_loan_record(
  '10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000018',
  household_id,'4E-VERIFY-LOAN','Fictional Mutual','Other',null,null,null,null,'Active','Confirmed') result
from verification_state) loan_created;
reset role;
insert into public.opportunities(id,organisation_id,opportunity_type,lifecycle_status,trigger_date,subject_type,subject_id,owner_membership_id,version)
select '4e020000-0000-4000-8000-000000000001',h.organisation_id,'Annual review','Due','2026-11-18','mortgage.household',h.id,null,1
from public.mortgage_households h join verification_state s on s.household_id=h.id;
insert into public.mortgage_review_opportunities(organisation_id,opportunity_id,household_id,loan_record_id,trigger_type,trigger_date)
select h.organisation_id,'4e020000-0000-4000-8000-000000000001',h.id,s.loan_id,'Annual review','2026-11-18'
from public.mortgage_households h join verification_state s on s.household_id=h.id;
select set_config('request.jwt.claim.sub',(select user_id::text from public.organisation_memberships where id='30000000-0000-0000-0000-000000000001'),true);
set local role authenticated;
select public.assign_mortgage_household_owner(
  '10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000019',
  household_id,3,'30000000-0000-0000-0000-000000000006') from verification_state;
update verification_state set household_version=4;
select pg_temp.check_result((select h.owner_membership_id='30000000-0000-0000-0000-000000000006' and l.owner_membership_id='30000000-0000-0000-0000-000000000006' from public.mortgage_households h join verification_state s on h.id=s.household_id join public.mortgage_minimal_loan_records l on l.id=s.loan_id),'owner assignment aligns household and loan ownership atomically');
select pg_temp.check_result((select details ? 'opportunityAssignmentsUnchanged' and details ? 'taskAssignmentsUnchanged' from public.activity_events e,verification_state s where e.entity_id=s.household_id and e.event_type='household.owner_assigned'),'owner audit records unchanged opportunity and task assignments');

-- Task lifecycle: versioning, assignee/admin authorization, terminal states and activity.
update verification_state set task_id=(result->>'taskId')::uuid
from (select public.create_mortgage_household_task(
  '10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000020',
  household_id,'4E fictional open task',transaction_timestamp()+interval '2 days','High','30000000-0000-0000-0000-000000000004') result
from verification_state) task_created;
select pg_temp.check_result((select status='Open' and version=1 from public.tasks t,verification_state s where t.id=s.task_id),'new household task starts Open at version one');

reset role;
select set_config('request.jwt.claim.sub',(select user_id::text from public.organisation_memberships where id='30000000-0000-0000-0000-000000000006'),true);
set local role authenticated;
select pg_temp.expect_error(
  (select format('select public.transition_mortgage_household_task(%L,%L,%L,1,%L)','10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000021',task_id,'Completed') from verification_state),
  'TASK_ASSIGNEE_OR_ADMIN_REQUIRED','non-assignee without administrative capability cannot resolve task');

reset role;
select set_config('request.jwt.claim.sub',(select user_id::text from public.organisation_memberships where id='30000000-0000-0000-0000-000000000001'),true);
set local role authenticated;
select pg_temp.expect_error(
  (select format('select public.transition_mortgage_household_status(%L,%L,%L,4,%L)','10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000022',household_id,'Archived') from verification_state),
  'HOUSEHOLD_ARCHIVE_OPEN_OPPORTUNITIES|HOUSEHOLD_ARCHIVE_OPEN_TASKS','open opportunity or task blocks archival');
select public.transition_mortgage_household_task(
  '10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000023',task_id,1,'Completed') from verification_state;
select pg_temp.check_result((select status='Completed' and version=2 from public.tasks t,verification_state s where t.id=s.task_id),'Open task transitions to Completed and increments version');
select pg_temp.expect_error(
  (select format('select public.transition_mortgage_household_task(%L,%L,%L,2,%L)','10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000024',task_id,'Completed') from verification_state),
  'TASK_STATUS_NO_OP','task no-op transition is rejected');
select pg_temp.expect_error(
  (select format('select public.transition_mortgage_household_task(%L,%L,%L,2,%L)','10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000025',task_id,'Cancelled') from verification_state),
  'TASK_TERMINAL','Completed task is terminal');

update verification_state set second_task_id=(result->>'taskId')::uuid
from (select public.create_mortgage_household_task(
  '10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000026',
  household_id,'4E fictional cancelled task',transaction_timestamp()+interval '3 days','Normal','30000000-0000-0000-0000-000000000001') result
from verification_state) task_created;
select public.transition_mortgage_household_task(
  '10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000027',second_task_id,1,'Cancelled') from verification_state;
select pg_temp.check_result((select status='Cancelled' and version=2 from public.tasks t,verification_state s where t.id=s.second_task_id),'Open task transitions to Cancelled and increments version');
select pg_temp.expect_error(
  (select format('select public.transition_mortgage_household_task(%L,%L,%L,1,%L)','10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000028',second_task_id,'Completed') from verification_state),
  'STALE_TASK_VERSION','stale task version is rejected');
select pg_temp.check_result((select count(*)=2 from public.activity_events e,verification_state s where e.entity_id=s.household_id and e.event_type='task.status_changed'),'task transitions append activity events');

-- Dismiss every generated open opportunity, then archive.
update verification_state set opportunity_id=(select r.opportunity_id from public.mortgage_review_opportunities r,verification_state s where r.loan_record_id=s.loan_id order by r.opportunity_id limit 1);
select public.transition_mortgage_review_opportunity(
  '10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000029',
  opportunity_id,1,'Dismissed','4E archive verification') from verification_state where opportunity_id is not null;
select public.transition_mortgage_household_status(
  '10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000030',
  household_id,4,'Archived') from verification_state;
update verification_state set household_version=5;
select pg_temp.check_result((select status='Archived' and version=5 from public.mortgage_households h,verification_state s where h.id=s.household_id),'resolved household archives and increments version');
select pg_temp.check_result((select count(*)=1 from public.list_mortgage_households('10000000-0000-0000-0000-000000000001','4E updated household','Archived',null,'name',1,25) payload where (payload->>'total')::integer=1),'archived household remains readable through defensive scoped read');
select pg_temp.check_result(not exists(select 1 from jsonb_array_elements(public.read_mortgage_retention_today('10000000-0000-0000-0000-000000000001',100)->'annualDue') row,verification_state s where row->>'householdId'=s.household_id::text),'archived household is absent from retention Today eligibility');
select pg_temp.expect_error(
  (select format('select public.transition_mortgage_review_opportunity(%L,%L,%L,2,%L,null)','10000000-0000-0000-0000-000000000001','4e020000-0000-4000-8000-000000000002',opportunity_id,'Reopen') from verification_state),
  'ACTIVE_HOUSEHOLD_REQUIRED','dismissed opportunity cannot reopen while its household is archived');
select pg_temp.expect_error(
  (select format('select public.claim_mortgage_review_opportunity(%L,%L,%L,2)','10000000-0000-0000-0000-000000000001','4e020000-0000-4000-8000-000000000003',opportunity_id) from verification_state),
  'ACTIVE_HOUSEHOLD_REQUIRED','opportunity claim requires an active household');
select pg_temp.expect_error(
  (select format('select public.assign_mortgage_review_opportunity(%L,%L,%L,2,%L)','10000000-0000-0000-0000-000000000001','4e020000-0000-4000-8000-000000000004',opportunity_id,'30000000-0000-0000-0000-000000000004') from verification_state),
  'ACTIVE_HOUSEHOLD_REQUIRED','opportunity assignment requires an active household');
select pg_temp.expect_error(
  (select format('select public.add_mortgage_household_member(%L,%L,%L,5,%L,null,%L,%L,%L,%L,%L,%L,false)','10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000031',household_id,'new','Archived','Member','archived.member@example.test','0499400031','Email','Other') from verification_state),
  'ACTIVE_HOUSEHOLD_REQUIRED','archived household rejects member creation');
select pg_temp.expect_error(
  (select format('select public.update_mortgage_primary_contact(%L,%L,%L,5,2,%L,%L,%L)','10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000032',household_id,'archived@example.test','0499400032','Email') from verification_state),
  'ACTIVE_HOUSEHOLD_REQUIRED','archived household rejects contact maintenance');
select pg_temp.expect_error(
  (select format('select public.add_mortgage_minimal_loan_record(%L,%L,%L,%L,%L,%L,null,null,null,null,%L,%L)','10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000033',household_id,'4E-ARCHIVED','Fictional Mutual','Other','Active','Confirmed') from verification_state),
  'ACTIVE_HOUSEHOLD_REQUIRED','archived household rejects loan creation');
select pg_temp.expect_error(
  (select format('select public.create_mortgage_household_task(%L,%L,%L,%L,transaction_timestamp()+interval ''1 day'',%L,%L)','10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000034',household_id,'Archived task','Normal','30000000-0000-0000-0000-000000000001') from verification_state),
  'ACTIVE_HOUSEHOLD_REQUIRED','archived household rejects task creation');

select public.transition_mortgage_household_status(
  '10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000035',
  household_id,5,'Active') from verification_state;
select pg_temp.check_result((select status='Active' and version=6 from public.mortgage_households h,verification_state s where h.id=s.household_id),'explicit Reactivate transition restores active maintenance state');
select public.transition_mortgage_review_opportunity(
  '10000000-0000-0000-0000-000000000001','4e020000-0000-4000-8000-000000000005',
  opportunity_id,2,'Reopen',null) from verification_state;
select pg_temp.check_result((select lifecycle_status in('Upcoming','Due','Overdue') and version=3 from public.opportunities o,verification_state s where o.id=s.opportunity_id),'reactivation permits an explicit opportunity reopen without reopening automatically');
select pg_temp.check_result(exists(select 1 from jsonb_array_elements(public.read_mortgage_retention_today('10000000-0000-0000-0000-000000000001',100)->'annualDue') row,verification_state s where row->>'householdId'=s.household_id::text),'explicitly reopened active household returns to retention Today eligibility');
select pg_temp.expect_error(
  (select format('select public.transition_mortgage_household_status(%L,%L,%L,6,%L)','10000000-0000-0000-0000-000000000001','4e000000-0000-4000-8000-000000000036',household_id,'Active') from verification_state),
  'HOUSEHOLD_STATUS_NO_OP','household status no-op is rejected');

-- Browser direct writes and defensive tenancy remain closed.
select pg_temp.expect_error(
  $sql$update public.mortgage_households set display_name='Forbidden direct write' where id='60000000-0000-0000-0000-000000000001'$sql$,
  'permission denied','authenticated direct household update is denied');
select pg_temp.expect_error(
  $sql$insert into public.tasks(organisation_id,household_id,assigned_membership_id,created_by_membership_id,title,due_at,priority,status) values('10000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Forbidden',now(),'Normal','Open')$sql$,
  'permission denied','authenticated direct task insert is denied');
select pg_temp.check_result(not exists(select 1 from public.mortgage_households where organisation_id='10000000-0000-0000-0000-000000000001' and id='60000000-0000-0000-0000-000000000002'),'cross-tenant household is absent from scoped reads');

reset role;
select pg_temp.check_result((select failed=0 and passed=82 from verification_results),'planned hosted maintenance assertion count');
select passed,failed,'hosted maintenance transaction will roll back' outcome from verification_results;
rollback;

-- Independent post-rollback checks for the suite's deterministic fictional tags.
select
  (select count(*) from public.contacts where email_normalized like '%4e@example.test' or email_normalized like 'avery.updated@example.test') as contacts,
  (select count(*) from public.mortgage_households where display_name like '4E %' or display_name='Acknowledged name match' or display_name='Existing contact household') as households,
  (select count(*) from public.leads where source='4E verification') as leads,
  (select count(*) from public.operation_commands where command_id::text like '4e000000-%') as commands,
  (select count(*) from public.tasks where title like '4E fictional%') as tasks,
  (select count(*) from public.appointments where notes='4E verification') as appointments,
  (select count(*) from public.mortgage_minimal_loan_records where external_reference like '4E-%') as loans,
  (select count(*) from public.mortgage_review_opportunities r join public.mortgage_minimal_loan_records l on l.organisation_id=r.organisation_id and l.id=r.loan_record_id where l.external_reference like '4E-%') as review_opportunities,
  (select count(*) from public.activity_events where details::text like '%4E-VERIFY-LOAN%') as activity_events;
