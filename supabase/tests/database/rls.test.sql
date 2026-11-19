begin;
select plan(60);

set local role anon;
select is((select count(*)::integer from public.contacts),0,'anonymous users cannot read contacts');
select is((select count(*)::integer from public.leads),0,'anonymous users cannot read leads');
select is((select count(*)::integer from public.mortgage_households),0,'anonymous users cannot read households');
select is((select count(*)::integer from public.campaigns),0,'anonymous users cannot read campaigns');

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',(select id from auth.users where email='alex.morgan@example.test'),'role','authenticated')::text,true);
select is((select count(*)::integer from public.organisations),2,'multi-organisation user sees both active organisations');
select is((select count(*)::integer from public.contacts),3,'multi-organisation user sees contacts from both memberships');
select is((select count(*)::integer from public.leads),2,'multi-organisation user sees leads from both memberships');
select is((select count(*)::integer from public.mortgage_households),2,'multi-organisation user sees households from both memberships');
select is((select count(*)::integer from public.campaigns),3,'campaign view permits campaign records');
select ok(private.has_capability('10000000-0000-0000-0000-000000000001','campaign.approve'),'capability is available in its assigned organisation');
select isnt(private.has_capability('10000000-0000-0000-0000-000000000002','campaign.approve'),true,'capability does not cross organisation boundaries');
select is((select count(*)::integer from public.organisation_memberships where user_id=(select auth.uid())),2,'active multi-organisation memberships are visible');

select throws_ok($$update public.campaigns set status='Approved' where id='90000000-0000-0000-0000-000000000001'$$,'42501',null,'browser clients cannot approve campaigns directly');
select throws_ok($$update public.campaign_versions set state='Frozen',frozen_at=now() where id='91000000-0000-0000-0000-000000000001'$$,'42501',null,'browser clients cannot freeze campaign versions directly');
select throws_ok($$update public.leads set lifecycle_status='Converted' where id='50000000-0000-0000-0000-000000000001'$$,'42501',null,'browser clients cannot transition leads directly');
select throws_ok($$update public.leads set owner_membership_id='30000000-0000-0000-0000-000000000001' where id='50000000-0000-0000-0000-000000000001'$$,'42501',null,'browser clients cannot change lead ownership directly');
select throws_ok($$update public.opportunities set lifecycle_status='Completed' where id='80000000-0000-0000-0000-000000000001'$$,'42501',null,'browser clients cannot transition opportunities directly');
select throws_ok($$insert into public.mortgage_lead_household_conversions(organisation_id,lead_id,household_id,converted_by_membership_id) values ('10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001')$$,'42501',null,'browser clients cannot create conversions directly');
select throws_ok($$update public.mortgage_households set status='Archived' where id='60000000-0000-0000-0000-000000000001'$$,'42501',null,'browser clients cannot archive households directly');
select throws_ok($$insert into public.tasks(organisation_id,lead_id,assigned_membership_id,created_by_membership_id,title,due_at,priority,status) values ('10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Bypass task',now(),'Normal','Open')$$,'42501',null,'browser clients cannot write incomplete workflows directly');
select throws_ok($$update public.activity_events set summary='Changed' where id='95000000-0000-0000-0000-000000000001'$$,'42501',null,'browser clients cannot rewrite activity history');
select throws_ok($$delete from public.consent_evidence where id='81000000-0000-0000-0000-000000000001'$$,'42501',null,'browser clients cannot delete consent history');
select throws_ok($$delete from public.suppression_history where id='82000000-0000-0000-0000-000000000001'$$,'42501',null,'browser clients cannot delete suppression history');
select throws_ok($$insert into public.campaign_approvals(organisation_id,campaign_id,campaign_version_id,reviewed_snapshot_id,final_snapshot_id,approving_membership_id,eligible_recipient_count,excluded_recipient_count,no_delivery_occurred) values ('10000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000003','91000000-0000-0000-0000-000000000003','92000000-0000-0000-0000-000000000002','92000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001',0,1,true)$$,'42501',null,'browser clients cannot create approval records directly');

select set_config('request.jwt.claims',json_build_object('sub',(select id from auth.users where email='inactive.user@example.test'),'role','authenticated')::text,true);
select is((select count(*)::integer from public.organisations),0,'inactive membership grants no organisation access');
select is((select count(*)::integer from public.contacts),0,'inactive membership grants no contact access');
select isnt(private.has_active_membership('10000000-0000-0000-0000-000000000001'),true,'inactive membership fails the membership helper');

select set_config('request.jwt.claims',json_build_object('sub',(select id from auth.users where email='dana.ellis@example.test'),'role','authenticated')::text,true);
select is((select count(*)::integer from public.contacts where organisation_id='10000000-0000-0000-0000-000000000001'),0,'user without contact.view cannot read contacts');
select is((select count(*)::integer from public.leads where organisation_id='10000000-0000-0000-0000-000000000001'),1,'lead.view permits organisation leads');
select is((select count(*)::integer from public.mortgage_households where organisation_id='10000000-0000-0000-0000-000000000001'),0,'user without household capability cannot read households');
select is((select count(*)::integer from public.campaigns where organisation_id='10000000-0000-0000-0000-000000000001'),0,'user without campaign.view cannot read campaigns');

select set_config('request.jwt.claims',json_build_object('sub',(select id from auth.users where email='priya.shah@example.test'),'role','authenticated')::text,true);
select is((select count(*)::integer from public.contacts where organisation_id='10000000-0000-0000-0000-000000000001'),2,'organisation-scoped contact capability permits contacts');
select is((select count(*)::integer from public.leads where organisation_id='10000000-0000-0000-0000-000000000001'),0,'user without lead.view in an organisation cannot read its leads');
select is((select count(*)::integer from public.mortgage_households where organisation_id='10000000-0000-0000-0000-000000000001'),0,'household capability remains isolated per organisation');
select is((select count(*)::integer from public.campaigns where organisation_id='10000000-0000-0000-0000-000000000001'),0,'campaign capability remains isolated per organisation');
select is((select count(*)::integer from public.leads where organisation_id='10000000-0000-0000-0000-000000000002'),1,'lead capability still applies in the assigned organisation');
select isnt(private.has_capability('10000000-0000-0000-0000-000000000001','lead.view'),true,'lead capability is absent in organisation A');
select ok(private.has_capability('10000000-0000-0000-0000-000000000002','lead.view'),'lead capability is present in organisation B');

reset role;
select throws_ok($$insert into public.leads(id,organisation_id,contact_id,owner_membership_id,source,lifecycle_status) values ('50000000-0000-0000-0000-000000000099','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000001','Test','New')$$,'23503',null,'cross-organisation foreign keys are rejected');
select throws_ok($$update public.activity_events set summary='Changed' where id='95000000-0000-0000-0000-000000000001'$$,'42501',null,'append-only activity rejects privileged updates');
select throws_ok($$update public.consent_evidence set source='Changed' where id='81000000-0000-0000-0000-000000000001'$$,'42501',null,'append-only consent rejects privileged updates');
select throws_ok($$delete from public.suppression_history where id='82000000-0000-0000-0000-000000000001'$$,'42501',null,'append-only suppression rejects privileged deletes');
select throws_ok($$update public.campaign_versions set body='Changed' where id='91000000-0000-0000-0000-000000000002'$$,'42501',null,'frozen campaign versions remain immutable');
select throws_ok($$update public.audience_snapshots set eligible_count=2 where id='92000000-0000-0000-0000-000000000001'$$,'42501',null,'audience snapshots remain immutable');
select throws_ok($$delete from public.campaign_approvals where id='94000000-0000-0000-0000-000000000001'$$,'42501',null,'approval records remain immutable');

select lives_ok($$insert into public.tasks(id,organisation_id,subject_type,subject_id,assigned_membership_id,created_by_membership_id,title,due_at,priority,status) values ('96000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','mortgage.household','60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Household review task',now(),'Low','Open')$$,'household-linked low-priority tasks are valid');
select lives_ok($$insert into public.mortgage_households(id,organisation_id,display_name,primary_contact_id,owner_membership_id,status) values ('60000000-0000-0000-0000-000000000099','10000000-0000-0000-0000-000000000001','Archived fictional household','40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','Archived')$$,'archived households are valid');
select lives_ok($$insert into public.opportunities(id,organisation_id,opportunity_type,lifecycle_status,trigger_date,subject_type,subject_id,owner_membership_id) values ('80000000-0000-0000-0000-000000000099','10000000-0000-0000-0000-000000000001','Annual review','Review booked','2026-12-15','mortgage.household','60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001')$$,'review-booked opportunities are valid');
select lives_ok($$insert into public.campaign_versions(id,organisation_id,campaign_id,version_number,state,purpose_key,audience_source_key,channel,subject,body,created_by_membership_id) values ('91000000-0000-0000-0000-000000000091','10000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001',91,'Draft','mortgage.annual-review-reminder','mortgage.annual-review-opportunities','Email','Test','Test','30000000-0000-0000-0000-000000000001')$$,'registered annual-review campaign keys are valid');
select lives_ok($$insert into public.campaign_versions(id,organisation_id,campaign_id,version_number,state,purpose_key,audience_source_key,channel,subject,body,created_by_membership_id) values ('91000000-0000-0000-0000-000000000092','10000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001',92,'Draft','mortgage.fixed-rate-expiry-reminder','mortgage.fixed-rate-expiry-opportunities','Email','Test','Test','30000000-0000-0000-0000-000000000001')$$,'registered fixed-rate campaign keys are valid');

select throws_ok($$insert into public.tasks(id,organisation_id,subject_type,subject_id,assigned_membership_id,created_by_membership_id,title,due_at,priority,status) values ('96000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','mortgage.household','60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Invalid priority',now(),'Urgent','Open')$$,'23514',null,'invalid task priority is rejected');
select throws_ok($$insert into public.mortgage_households(id,organisation_id,display_name,primary_contact_id,owner_membership_id,status) values ('60000000-0000-0000-0000-000000000098','10000000-0000-0000-0000-000000000001','Invalid household','40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','Deleted')$$,'23514',null,'invalid household status is rejected');
select throws_ok($$insert into public.opportunities(id,organisation_id,opportunity_type,lifecycle_status,trigger_date,subject_type,subject_id) values ('80000000-0000-0000-0000-000000000098','10000000-0000-0000-0000-000000000001','Annual review','In progress','2026-12-15','mortgage.household','60000000-0000-0000-0000-000000000001')$$,'23514',null,'invalid review lifecycle is rejected');
select throws_ok($$insert into public.campaign_versions(id,organisation_id,campaign_id,version_number,state,purpose_key,audience_source_key,channel,subject,body,created_by_membership_id) values ('91000000-0000-0000-0000-000000000093','10000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001',93,'Draft','mortgage.unknown','mortgage.annual-review-opportunities','Email','Test','Test','30000000-0000-0000-0000-000000000001')$$,'23514',null,'unregistered campaign purpose is rejected');
select throws_ok($$insert into public.campaign_versions(id,organisation_id,campaign_id,version_number,state,purpose_key,audience_source_key,channel,subject,body,created_by_membership_id) values ('91000000-0000-0000-0000-000000000094','10000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001',94,'Draft','mortgage.annual-review-reminder','mortgage.fixed-rate-expiry-opportunities','Email','Test','Test','30000000-0000-0000-0000-000000000001')$$,'23514',null,'mismatched campaign registry keys are rejected');
select throws_ok($$insert into public.mortgage_household_members(organisation_id,household_id,contact_id,relationship) values ('10000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','Friend')$$,'23514',null,'invalid household relationship is rejected');
select throws_ok($$insert into public.mortgage_minimal_loan_records(organisation_id,household_id,owner_membership_id,lender_name,loan_purpose,status,source,data_confidence) values ('10000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Example Mutual','Purchase','Active','Spreadsheet','Confirmed')$$,'23514',null,'invalid loan-record source is rejected');
select throws_ok($$insert into public.mortgage_referral_partners(organisation_id,name,partner_type,status) values ('10000000-0000-0000-0000-000000000001','Invalid fictional partner','Friend','Active')$$,'23514',null,'invalid referral partner type is rejected');

insert into public.leads(id,organisation_id,contact_id,owner_membership_id,source,lifecycle_status)
values ('50000000-0000-0000-0000-000000000098','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','Test setup','New');
select throws_ok($$insert into public.mortgage_lead_details(organisation_id,lead_id,loan_purpose,timeframe,preferred_contact_method) values ('10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000098','Purchase','Someday','Email')$$,'23514',null,'invalid mortgage timeframe is rejected');
select throws_ok($$insert into public.mortgage_lead_details(organisation_id,lead_id,loan_purpose,timeframe,preferred_contact_method) values ('10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000098','Payday loan','Researching','Email')$$,'23514',null,'invalid loan purpose is rejected');

select * from finish();
rollback;
