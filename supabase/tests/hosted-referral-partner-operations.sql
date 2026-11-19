-- Milestone 4F hosted referral-partner verification. All mutations roll back.
begin;
create temp table referral_results(passed integer not null default 0,failed integer not null default 0);
insert into referral_results default values;
grant select,update on referral_results to authenticated,anon;
create or replace function pg_temp.referral_check(condition boolean,label text)returns void language plpgsql as $$begin if condition then update referral_results set passed=passed+1;raise notice 'ok - %',label;else update referral_results set failed=failed+1;raise exception 'verification failed: %',label;end if;end$$;
grant execute on function pg_temp.referral_check(boolean,text) to authenticated,anon;
create or replace function pg_temp.referral_error(statement text,pattern text,label text)returns void language plpgsql as $$begin begin execute statement;perform pg_temp.referral_check(false,label);exception when others then if sqlerrm~*pattern then perform pg_temp.referral_check(true,label);else raise;end if;end;end$$;
grant execute on function pg_temp.referral_error(text,text,text) to authenticated,anon;
create temp table referral_state(partner_id uuid,second_id uuid,name_match_id uuid,inactive_id uuid,lead_id uuid,household_id uuid,historical_household_id uuid,result jsonb);
insert into referral_state default values;grant select,update on referral_state to authenticated,anon;
update public.mortgage_membership_profiles set position='Broker'
where organisation_id='10000000-0000-0000-0000-000000000001'
  and membership_id='30000000-0000-0000-0000-000000000006';

set local role anon;
select pg_temp.referral_error($sql$select * from public.preview_mortgage_referral_partner_duplicates('10000000-0000-0000-0000-000000000001','Test',null,null)$sql$,'AUTHENTICATION_REQUIRED|permission denied','anonymous preview denied');
reset role;
-- Dana receives view but not manage to prove exact capability combinations.
insert into public.membership_capabilities(organisation_id,membership_id,capability) values
('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004','mortgage.referral.view') on conflict do nothing;
select set_config('request.jwt.claim.sub',(select user_id::text from public.organisation_memberships where id='30000000-0000-0000-0000-000000000004'),true);
set local role authenticated;
select pg_temp.referral_check((select count(*)>=1 from public.mortgage_referral_partners where organisation_id='10000000-0000-0000-0000-000000000001'),'referral.view permits tenant read');
select pg_temp.referral_error($sql$select public.create_mortgage_referral_partner('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000001','Denied',null,'Other',null,null,'30000000-0000-0000-0000-000000000004',false)$sql$,'CAPABILITY_REQUIRED:mortgage.referral.manage','view without manage cannot mutate');
select pg_temp.referral_check(not exists(select 1 from public.mortgage_referral_partners where organisation_id='10000000-0000-0000-0000-000000000002'),'RLS hides cross-tenant referrals');

reset role;
select set_config('request.jwt.claim.sub',(select user_id::text from public.organisation_memberships where id='30000000-0000-0000-0000-000000000001'),true);
set local role authenticated;
update referral_state set result=public.create_mortgage_referral_partner('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000002','  Taylor   Example  ','  Fictional   Advisory  ','Accountant','TAYLOR.4F@EXAMPLE.TEST','0499 410 001','30000000-0000-0000-0000-000000000004',false);
update referral_state set partner_id=(result->>'referralPartnerId')::uuid;
select pg_temp.referral_check((select name='Taylor   Example' and name_normalized='taylor example' and organisation_name='Fictional   Advisory' and organisation_name_normalized='fictional advisory' and email='taylor.4f@example.test' and email_normalized='taylor.4f@example.test' and phone_normalized='0499410001' and version=1 and status='Active' from public.mortgage_referral_partners r,referral_state s where r.id=s.partner_id),'database normalizes values and starts positive version');
select pg_temp.referral_check((select count(*)=1 from public.activity_events e,referral_state s where e.entity_id=s.partner_id and e.event_type='referral_partner.created'),'create appends structured activity');
select pg_temp.referral_check((select reasons@>array['exact_email']::text[] from public.preview_mortgage_referral_partner_duplicates('10000000-0000-0000-0000-000000000001','Different',null,'TAYLOR.4F@EXAMPLE.TEST')),'preview explains exact email');
select pg_temp.referral_error($sql$select public.create_mortgage_referral_partner('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000003','Different',null,'Other','taylor.4f@example.test',null,'30000000-0000-0000-0000-000000000004',true)$sql$,'REFERRAL_EXACT_EMAIL_DUPLICATE','exact email blocks final create despite acknowledgement');
select pg_temp.referral_check((select reasons@>array['normalized_name_and_organisation']::text[] from public.preview_mortgage_referral_partner_duplicates('10000000-0000-0000-0000-000000000001','taylor example','fictional advisory',null)),'preview explains normalized name and organisation');
select pg_temp.referral_error($sql$select public.create_mortgage_referral_partner('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000004','Taylor Example','Fictional Advisory','Other','distinct.4f@example.test',null,'30000000-0000-0000-0000-000000000004',false)$sql$,'REFERRAL_NAME_DUPLICATE_ACKNOWLEDGEMENT_REQUIRED','final create revalidates name duplicate');
update referral_state set result=public.create_mortgage_referral_partner('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000005','Taylor Example','Fictional Advisory','Other','distinct.4f@example.test',null,'30000000-0000-0000-0000-000000000004',true);
update referral_state set name_match_id=(result->>'referralPartnerId')::uuid;
select pg_temp.referral_check((select name_match_id is not null from referral_state),'explicit name-match acknowledgement permits distinct record');

-- Every controlled type, including optional email and phone omissions.
with types(type,ordinal)as(values('Real estate agent',1),('Buyer’s agent',2),('Financial adviser',3),('Conveyancer',4),('Existing client',5),('Other',6))
select public.create_mortgage_referral_partner('10000000-0000-0000-0000-000000000001',format('4f100000-0000-4000-8000-%s',lpad(ordinal::text,12,'0'))::uuid,'4F Type '||ordinal,null,type,null,null,'30000000-0000-0000-0000-000000000004',false) from types;
select pg_temp.referral_check((select count(distinct partner_type)=7 from public.mortgage_referral_partners where organisation_id='10000000-0000-0000-0000-000000000001' and(name like '4F Type %' or email_normalized='taylor.4f@example.test')),'all seven controlled partner types persist');
select pg_temp.referral_check((select count(*)=6 from public.mortgage_referral_partners where name like '4F Type %' and email is null and phone is null),'email and phone are optional');

select pg_temp.referral_error($sql$select public.create_mortgage_referral_partner('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000006','Bad owner',null,'Other',null,null,'30000000-0000-0000-0000-000000000001',false)$sql$,'ACTIVE_BROKER_OWNER_REQUIRED','non-Broker owner rejected');
select pg_temp.referral_error($sql$select public.create_mortgage_referral_partner('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000007','Cross owner',null,'Other',null,null,'30000000-0000-0000-0000-000000000002',false)$sql$,'ACTIVE_BROKER_OWNER_REQUIRED','cross-tenant owner rejected');
select pg_temp.referral_check((select (public.create_mortgage_referral_partner('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000002','  Taylor   Example  ','  Fictional   Advisory  ','Accountant','TAYLOR.4F@EXAMPLE.TEST','0499 410 001','30000000-0000-0000-0000-000000000004',false)->>'referralPartnerId')::uuid=partner_id from referral_state),'same-command retry is idempotent');
select pg_temp.referral_error($sql$select public.create_mortgage_referral_partner('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000002','Changed',null,'Other',null,null,'30000000-0000-0000-0000-000000000004',false)$sql$,'COMMAND_ID_REUSE_CONFLICT','changed-input command reuse rejected');
select pg_temp.referral_error((select format('select public.update_mortgage_referral_partner(%L,%L,%L,99,%L,null,%L,null,null)','10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000008',partner_id,'Stale','Other') from referral_state),'STALE_REFERRAL_PARTNER_VERSION','stale update rejected');
update referral_state set result=public.update_mortgage_referral_partner('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000009',partner_id,1,'Taylor Updated','Fictional Advisory','Financial adviser','taylor.updated.4f@example.test','0499 410 002');
select pg_temp.referral_check((select name='Taylor Updated' and partner_type='Financial adviser' and version=2 from public.mortgage_referral_partners r,referral_state s where r.id=s.partner_id),'details update uses expected version');
update referral_state set result=public.assign_mortgage_referral_partner_owner('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000010',partner_id,2,'30000000-0000-0000-0000-000000000006');
select pg_temp.referral_check((select owner_membership_id='30000000-0000-0000-0000-000000000006' and version=3 from public.mortgage_referral_partners r,referral_state s where r.id=s.partner_id),'owner assignment validates active Broker and increments version');
update referral_state set result=public.transition_mortgage_referral_partner('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000011',partner_id,3,'Inactive');
select pg_temp.referral_check((select status='Inactive' and version=4 from public.mortgage_referral_partners r,referral_state s where r.id=s.partner_id),'inactivation retains versioned record');
select pg_temp.referral_error((select format('select public.transition_mortgage_referral_partner(%L,%L,%L,4,%L)','10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000012',partner_id,'Inactive') from referral_state),'REFERRAL_STATUS_NO_OP','no-op lifecycle rejected');
select pg_temp.referral_error((select format('select public.transition_mortgage_referral_partner(%L,%L,%L,4,%L)','10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000013',partner_id,'Archived') from referral_state),'INVALID_REFERRAL_STATUS_TRANSITION','invalid lifecycle rejected');
update referral_state set result=public.transition_mortgage_referral_partner('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000014',partner_id,4,'Active');
select pg_temp.referral_check((select status='Active' and version=5 from public.mortgage_referral_partners r,referral_state s where r.id=s.partner_id),'reactivation is explicit');

-- Lead attribution set/clear and ownership enforcement.
update referral_state set result=public.set_mortgage_lead_referral_partner('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000015','50000000-0000-0000-0000-000000000001',1,partner_id);
select pg_temp.referral_check((select d.referral_partner_id=s.partner_id and l.version=2 from public.mortgage_lead_details d join public.leads l using(organisation_id) cross join referral_state s where d.lead_id='50000000-0000-0000-0000-000000000001' and l.id=d.lead_id),'lead attribution set with lead version');
select pg_temp.referral_check((select details->>'previousReferralPartnerId'='41000000-0000-0000-0000-000000000001' and details->>'newReferralPartnerId'=s.partner_id::text from public.activity_events e,referral_state s where e.entity_id='50000000-0000-0000-0000-000000000001' and e.event_type='lead.referral_attribution_changed' order by occurred_at desc limit 1),'lead audit records previous and new partner IDs');
update referral_state set result=public.set_mortgage_lead_referral_partner('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000016','50000000-0000-0000-0000-000000000001',2,null);
select pg_temp.referral_check((select referral_partner_id is null from public.mortgage_lead_details where lead_id='50000000-0000-0000-0000-000000000001'),'lead attribution may be cleared without rewriting source');
select pg_temp.referral_check((select source='Website enquiry' from public.leads where id='50000000-0000-0000-0000-000000000001'),'lead free-text source remains unchanged');

-- Create then inactivate a dedicated partner for negative and history checks.
update referral_state set result=public.create_mortgage_referral_partner('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000017','4F Inactive History',null,'Other','inactive.history.4f@example.test',null,'30000000-0000-0000-0000-000000000004',false);
update referral_state set inactive_id=(result->>'referralPartnerId')::uuid;
update referral_state set result=public.transition_mortgage_referral_partner('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000018',inactive_id,1,'Inactive');
select pg_temp.referral_error((select format('select public.set_mortgage_lead_referral_partner(%L,%L,%L,3,%L)','10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000019','50000000-0000-0000-0000-000000000001',inactive_id) from referral_state),'ACTIVE_REFERRAL_PARTNER_REQUIRED','inactive partner rejected for new lead attribution');
select pg_temp.referral_error((select format('update public.mortgage_households set referral_partner_id=%L where organisation_id=%L and id=%L',inactive_id,'10000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001') from referral_state),'permission denied','direct household attribution write denied');

-- Limited owner without lead.assign cannot modify a lead owned by another Broker.
reset role;insert into public.membership_capabilities(organisation_id,membership_id,capability) values
('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000006','lead.update'),
('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000006','mortgage.referral.view') on conflict do nothing;
select set_config('request.jwt.claim.sub',(select user_id::text from public.organisation_memberships where id='30000000-0000-0000-0000-000000000006'),true);set local role authenticated;
select pg_temp.referral_error((select format('select public.set_mortgage_lead_referral_partner(%L,%L,%L,3,%L)','10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000020','50000000-0000-0000-0000-000000000001',partner_id) from referral_state),'LEAD_OWNERSHIP_REQUIRED','lead ownership rule enforced');

reset role;select set_config('request.jwt.claim.sub',(select user_id::text from public.organisation_memberships where id='30000000-0000-0000-0000-000000000001'),true);set local role authenticated;
-- Cross-tenant partner UUID cannot be selected.
select pg_temp.referral_error($sql$select public.set_mortgage_lead_referral_partner('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000021','50000000-0000-0000-0000-000000000001',3,'41000000-0000-0000-0000-000000000099')$sql$,'ACTIVE_REFERRAL_PARTNER_REQUIRED','cross-tenant referral UUID rejected');

-- Conversion preserves explicit active/default selection and structured attribution audit.
update referral_state set result=public.create_mortgage_lead('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000022','Conversion','Default','conversion.default.4f@example.test','0499410022','4F verification','Purchase','Immediately','Email','30000000-0000-0000-0000-000000000004');
update referral_state set lead_id=(result->>'leadId')::uuid;
update referral_state set result=public.record_contact_attempt('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000023',lead_id,1,'Phone','Spoke with lead','4F fictional verification',null);
update referral_state set result=public.transition_lead('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000024',lead_id,2,'Contacted','4F fictional progression');
update referral_state set result=public.book_discovery_appointment('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000025',lead_id,3,'30000000-0000-0000-0000-000000000004',transaction_timestamp()+interval '2 days',30,'Phone',null,'4F fictional verification');
update referral_state set result=public.set_mortgage_lead_referral_partner('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000027',lead_id,4,partner_id);
update referral_state set result=public.convert_mortgage_lead_to_household(organisation_id=>'10000000-0000-0000-0000-000000000001',command_id=>'4f000000-0000-4000-8000-000000000028',lead_id=>lead_id,expected_version=>5,duplicate_decision=>'create-new',display_name=>'4F Conversion household',owner_membership_id=>'30000000-0000-0000-0000-000000000004',referral_partner_id=>partner_id);
update referral_state set household_id=(result->>'householdId')::uuid;
update referral_state set historical_household_id=household_id;
select pg_temp.referral_check((select h.referral_partner_id=s.partner_id from public.mortgage_households h,referral_state s where h.id=s.household_id),'conversion stores explicit defaulted active referral attribution');
select pg_temp.referral_check((select details->>'leadReferralPartnerId'=s.partner_id::text and details->>'householdReferralPartnerId'=s.partner_id::text from public.activity_events e,referral_state s where e.entity_id=s.household_id and e.event_type='household.referral_attribution_recorded'),'conversion audit records lead and final household attribution');
select pg_temp.referral_error((select format('insert into public.mortgage_households(organisation_id,display_name,primary_contact_id,owner_membership_id,referral_partner_id,status) values(%L,%L,%L,%L,%L,%L)','10000000-0000-0000-0000-000000000001','Inactive attribution','40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004',inactive_id,'Active') from referral_state),'permission denied','direct referral household insert remains denied');

-- Explicit conversion override keeps the lead attribution but stores the chosen
-- active partner on the new household.
update referral_state set result=public.create_mortgage_lead('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000031','Conversion','Override','conversion.override.4f@example.test','0499410031','4F verification','Purchase','Immediately','Email','30000000-0000-0000-0000-000000000004');
update referral_state set lead_id=(result->>'leadId')::uuid;
update referral_state set result=public.record_contact_attempt('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000032',lead_id,1,'Phone','Spoke with lead','4F fictional verification',null);
update referral_state set result=public.transition_lead('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000033',lead_id,2,'Contacted','4F fictional progression');
update referral_state set result=public.book_discovery_appointment('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000034',lead_id,3,'30000000-0000-0000-0000-000000000004',transaction_timestamp()+interval '3 days',30,'Phone',null,'4F fictional verification');
update referral_state set result=public.set_mortgage_lead_referral_partner('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000035',lead_id,4,partner_id);
update referral_state set result=public.convert_mortgage_lead_to_household(organisation_id=>'10000000-0000-0000-0000-000000000001',command_id=>'4f000000-0000-4000-8000-000000000036',lead_id=>lead_id,expected_version=>5,duplicate_decision=>'create-new',display_name=>'4F Override household',owner_membership_id=>'30000000-0000-0000-0000-000000000004',referral_partner_id=>name_match_id);
update referral_state set household_id=(result->>'householdId')::uuid;
select pg_temp.referral_check((select d.referral_partner_id=s.partner_id and h.referral_partner_id=s.name_match_id from public.mortgage_lead_details d join public.mortgage_households h on h.organisation_id=d.organisation_id cross join referral_state s where d.lead_id=s.lead_id and h.id=s.household_id),'conversion permits an explicit active referral override without rewriting lead attribution');
select pg_temp.referral_check((select details->>'leadReferralPartnerId'=s.partner_id::text and details->>'householdReferralPartnerId'=s.name_match_id::text from public.activity_events e,referral_state s where e.entity_id=s.household_id and e.event_type='household.referral_attribution_recorded'),'override conversion audit distinguishes lead and final household attribution');

-- Direct/none remains an explicit conversion choice while historical lead
-- attribution is preserved.
update referral_state set result=public.create_mortgage_lead('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000037','Conversion','Direct','conversion.direct.4f@example.test','0499410037','4F verification','Purchase','Immediately','Email','30000000-0000-0000-0000-000000000004');
update referral_state set lead_id=(result->>'leadId')::uuid;
update referral_state set result=public.record_contact_attempt('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000038',lead_id,1,'Phone','Spoke with lead','4F fictional verification',null);
update referral_state set result=public.transition_lead('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000039',lead_id,2,'Contacted','4F fictional progression');
update referral_state set result=public.book_discovery_appointment('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000040',lead_id,3,'30000000-0000-0000-0000-000000000004',transaction_timestamp()+interval '4 days',30,'Phone',null,'4F fictional verification');
update referral_state set result=public.set_mortgage_lead_referral_partner('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000041',lead_id,4,partner_id);
update referral_state set result=public.convert_mortgage_lead_to_household(organisation_id=>'10000000-0000-0000-0000-000000000001',command_id=>'4f000000-0000-4000-8000-000000000042',lead_id=>lead_id,expected_version=>5,duplicate_decision=>'create-new',display_name=>'4F Direct household',owner_membership_id=>'30000000-0000-0000-0000-000000000004',referral_partner_id=>null);
update referral_state set household_id=(result->>'householdId')::uuid;
select pg_temp.referral_check((select d.referral_partner_id=s.partner_id and h.referral_partner_id is null from public.mortgage_lead_details d join public.mortgage_households h on h.organisation_id=d.organisation_id cross join referral_state s where d.lead_id=s.lead_id and h.id=s.household_id),'conversion permits explicit Direct none while preserving historical lead attribution');
select pg_temp.referral_check((select details->>'leadReferralPartnerId'=s.partner_id::text and details->'householdReferralPartnerId'='null'::jsonb from public.activity_events e,referral_state s where e.entity_id=s.household_id and e.event_type='household.referral_attribution_recorded'),'Direct conversion audit records lead attribution and null household attribution');

-- Existing links survive inactivation and remain readable.
update referral_state set result=public.transition_mortgage_referral_partner('10000000-0000-0000-0000-000000000001','4f000000-0000-4000-8000-000000000026',partner_id,5,'Inactive');
select pg_temp.referral_check((select h.referral_partner_id=s.partner_id and r.status='Inactive' from public.mortgage_households h join public.mortgage_referral_partners r on r.organisation_id=h.organisation_id and r.id=h.referral_partner_id cross join referral_state s where h.id=s.historical_household_id),'inactive historical household attribution remains linked and readable');
select pg_temp.referral_check((select count(*)>=5 from public.activity_events e,referral_state s where e.entity_type='mortgage.referral_partner' and e.entity_id=s.partner_id),'successful mutations append activity rather than rewriting history');
select pg_temp.referral_error((select format('update public.mortgage_referral_partners set name=%L where id=%L','Forbidden direct write',partner_id) from referral_state),'permission denied','direct referral mutation denied');
select pg_temp.referral_error((select format('delete from public.activity_events where entity_id=%L',partner_id) from referral_state),'permission denied|append-only','activity remains append-only');

reset role;
select pg_temp.referral_check((select failed=0 and passed=43 from referral_results),'planned referral assertion count');
select passed,failed,'hosted referral transaction will roll back' outcome from referral_results;
rollback;

select
 (select count(*) from public.mortgage_referral_partners where email_normalized like '%.4f@example.test' or name like '4F Type %' or name='4F Inactive History') referral_partners,
 (select count(*) from public.contacts where email_normalized like 'conversion.%.4f@example.test') contacts,
 (select count(*) from public.leads where source='4F verification') leads,
 (select count(*) from public.mortgage_households where display_name like '4F %') households,
 (select count(*) from public.operation_commands where command_id::text like '4f%') commands,
 (select count(*) from public.activity_events where details::text like '%4f000000-%' or summary like '4F %') activities;
