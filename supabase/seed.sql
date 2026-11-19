-- Deterministic, clearly fictional development data. Auth users are provisioned
-- separately through the hosted Auth API; no passwords or secret keys belong here.

insert into public.user_profiles(user_id,display_name)
select id, display_name
from auth.users
join (values
  ('alex.morgan@example.test','Alex Morgan'),
  ('priya.shah@example.test','Priya Shah'),
  ('dana.ellis@example.test','Dana Ellis'),
  ('inactive.user@example.test','Inactive User')
) as fictional_users(email,display_name)
  on auth.users.email=fictional_users.email;

insert into public.organisations(id,name,short_name,vertical_key,status,region) values
('10000000-0000-0000-0000-000000000001','Harbourlight Mortgage Co.','HM','mortgage','Active','NSW'),
('10000000-0000-0000-0000-000000000002','Ranges Home Finance','RF','mortgage','Active','VIC');

insert into public.organisation_memberships(id,organisation_id,user_id,display_name,status) values
('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',(select id from auth.users where email='alex.morgan@example.test'),'Alex Morgan','Active'),
('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002',(select id from auth.users where email='alex.morgan@example.test'),'Alex Morgan','Active'),
('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002',(select id from auth.users where email='priya.shah@example.test'),'Priya Shah','Active'),
('30000000-0000-0000-0000-000000000004','10000000-0000-0000-0000-000000000001',(select id from auth.users where email='dana.ellis@example.test'),'Dana Ellis','Active'),
('30000000-0000-0000-0000-000000000005','10000000-0000-0000-0000-000000000001',(select id from auth.users where email='inactive.user@example.test'),'Inactive User','Inactive'),
('30000000-0000-0000-0000-000000000006','10000000-0000-0000-0000-000000000001',(select id from auth.users where email='priya.shah@example.test'),'Priya Shah','Active');

insert into public.mortgage_membership_profiles values
('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Brokerage administrator'),
('10000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','Broker'),
('10000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000003','Brokerage administrator'),
('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004','Broker'),
('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000005','Support person'),
('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000006','Support person');

insert into public.membership_capabilities(organisation_id,membership_id,capability)
select '10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',capability from unnest(array[
'organisation.switch','contact.view','contact.update','lead.view','lead.create','lead.update','lead.assign','lead.claim','task.create','task.update','appointment.create','opportunity.view','opportunity.manage','report.view','settings.view','campaign.view','campaign.create','campaign.edit','campaign.submit','campaign.approve','campaign.cancel','consent.view','consent.record-external-change','mortgage.household.view','mortgage.household.create','mortgage.household.update','mortgage.household.assign','mortgage.loan-record.manage','mortgage.review-opportunity.view','mortgage.review-opportunity.manage','mortgage.referral.view','mortgage.referral.manage']) capability;
insert into public.membership_capabilities values
('10000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','lead.view',now()),
('10000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','contact.view',now()),
('10000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','mortgage.household.view',now()),
('10000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000003','lead.view',now()),
('10000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000003','contact.view',now()),
('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000006','contact.view',now()),
('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004','lead.view',now()),
('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004','lead.update',now());

insert into public.contacts(id,organisation_id,given_name,family_name,email,email_normalized,phone,phone_normalized,preferred_contact_method,status) values
('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Ruby','March','ruby.march@example.test','ruby.march@example.test','0490 100 001','0490100001','Email','Active'),
('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Amelia','Cove','amelia.cove@example.test','amelia.cove@example.test','0490 100 002','0490100002','Email','Active'),
('40000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000002','Nora','Wells','nora.wells@example.test','nora.wells@example.test','0490 100 003','0490100003','Phone','Active');

insert into public.mortgage_referral_partners(id,organisation_id,name,organisation_name,partner_type,email,status,owner_membership_id) values
('41000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Casey Rowan','Bright Path Buyers Agency','Buyer’s agent','casey.rowan@example.test','Active','30000000-0000-0000-0000-000000000004');

insert into public.leads(id,organisation_id,contact_id,owner_membership_id,source,lifecycle_status,next_action_at) values
('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004','Website enquiry','Discovery booked','2026-11-17T09:00:00Z'),
('50000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000002','Client referral','New','2026-11-16T23:00:00Z');
insert into public.mortgage_lead_details values
('10000000-0000-0000-0000-000000000001','50000000-0000-0000-0000-000000000001','Refinance','1–3 months','Email','41000000-0000-0000-0000-000000000001'),
('10000000-0000-0000-0000-000000000002','50000000-0000-0000-0000-000000000002','Purchase','Researching','Phone',null);

insert into public.mortgage_households(id,organisation_id,display_name,primary_contact_id,owner_membership_id,referral_partner_id,status) values
('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','March household','40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004','41000000-0000-0000-0000-000000000001','Active'),
('60000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Wells household','40000000-0000-0000-0000-000000000003','30000000-0000-0000-0000-000000000002',null,'Active');
insert into public.mortgage_household_members(id,organisation_id,household_id,contact_id,relationship,is_primary) values
('61000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Primary applicant',true),
('61000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000003','Primary applicant',true);

insert into public.mortgage_minimal_loan_records(id,organisation_id,household_id,owner_membership_id,external_reference,lender_name,loan_purpose,settlement_date,fixed_rate_expiry_date,next_review_date,status,source,data_confidence) values
('70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004','LOCAL-RET-001','Example Mutual','Refinance','2024-11-16','2027-02-15','2026-11-30','Active','Imported fixture','Confirmed'),
('70000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002','LOCAL-RET-002','Fictional Bank','Purchase','2025-05-10',null,'2026-12-01','Active','Imported fixture','Unverified');

insert into public.opportunities(id,organisation_id,opportunity_type,lifecycle_status,trigger_date,subject_type,subject_id,owner_membership_id) values
('80000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Annual review','Due','2026-11-30','mortgage.household','60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000004'),
('80000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','Annual review','Upcoming','2026-12-01','mortgage.household','60000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000002');
insert into public.mortgage_review_opportunities values
('10000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','60000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','Annual review','2026-11-30'),
('10000000-0000-0000-0000-000000000002','80000000-0000-0000-0000-000000000002','60000000-0000-0000-0000-000000000002','70000000-0000-0000-0000-000000000002','Annual review','2026-12-01');

insert into public.consent_evidence(id,organisation_id,contact_id,channel,status,source,effective_at,recorded_at,provenance) values
('81000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','Email','Opted out','Local CRM import','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z','Imported fixture'),
('81000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002','40000000-0000-0000-0000-000000000003','Email','Recorded','Local CRM import','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z','Imported fixture');
insert into public.suppression_history(id,organisation_id,contact_id,scope,status,source,reason,effective_at,recorded_at,actor_membership_id) values
('82000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','Contact','Active','Local CRM import','Temporary hold','2026-10-01T00:00:00Z','2026-10-01T00:00:00Z','30000000-0000-0000-0000-000000000001'),
('82000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','Contact','Lifted','Local CRM import','Hold lifted externally','2026-10-15T00:00:00Z','2026-10-15T00:00:00Z','30000000-0000-0000-0000-000000000001');

insert into public.campaigns(id,organisation_id,name,owner_membership_id,status) values
('90000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Local annual review draft','30000000-0000-0000-0000-000000000001','Draft'),
('90000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Local annual review ready','30000000-0000-0000-0000-000000000001','Ready for review'),
('90000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','Local annual review approved','30000000-0000-0000-0000-000000000001','Approved');
insert into public.campaign_versions(id,organisation_id,campaign_id,version_number,state,purpose_key,audience_source_key,channel,subject,body,merge_field_keys,created_by_membership_id,frozen_at) values
('91000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001',1,'Draft','mortgage.annual-review-reminder','mortgage.annual-review-opportunities','Email','A fictional review invitation','Hello {{contact.firstName}}. [Unsubscribe instructions]',array['contact.firstName'],'30000000-0000-0000-0000-000000000001',null),
('91000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000002',1,'Frozen','mortgage.annual-review-reminder','mortgage.annual-review-opportunities','Email','A fictional review invitation','Hello {{contact.firstName}}. [Unsubscribe instructions]',array['contact.firstName'],'30000000-0000-0000-0000-000000000001','2026-11-16T00:00:00Z'),
('91000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000003',1,'Frozen','mortgage.annual-review-reminder','mortgage.annual-review-opportunities','Email','A fictional review invitation','Hello {{contact.firstName}}. [Unsubscribe instructions]',array['contact.firstName'],'30000000-0000-0000-0000-000000000001','2026-11-16T00:00:00Z');
update public.campaigns set current_version_id=case id when '90000000-0000-0000-0000-000000000001' then '91000000-0000-0000-0000-000000000001'::uuid when '90000000-0000-0000-0000-000000000002' then '91000000-0000-0000-0000-000000000002'::uuid else '91000000-0000-0000-0000-000000000003'::uuid end,
submitted_version_id=case when status='Draft' then null when status='Ready for review' then '91000000-0000-0000-0000-000000000002'::uuid else '91000000-0000-0000-0000-000000000003'::uuid end;
insert into public.audience_snapshots(id,organisation_id,campaign_id,campaign_version_id,stage,evaluated_at,eligible_count,excluded_count) values
('92000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000002','91000000-0000-0000-0000-000000000002','Submission','2026-11-16T00:00:00Z',0,1),
('92000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000003','91000000-0000-0000-0000-000000000003','Approval','2026-11-16T00:00:00Z',0,1);
insert into public.audience_recipients(id,organisation_id,audience_snapshot_id,candidate_key,contact_id,subject_id,subject_display_name,context_label,eligible,masked_destination,consent_status,suppression_status,resolved_merge_values) values
('93000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000001','annual-review-local','40000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','March household','Annual review · 2026-11-30',false,'ru•••@example.test','Opted out','None','{"contact.firstName":"Ruby"}'),
('93000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','92000000-0000-0000-0000-000000000002','annual-review-local','40000000-0000-0000-0000-000000000001','80000000-0000-0000-0000-000000000001','March household','Annual review · 2026-11-30',false,'ru•••@example.test','Opted out','None','{"contact.firstName":"Ruby"}');
insert into public.recipient_eligibility_reasons(id,organisation_id,audience_recipient_id,reason_order,reason_code,display_reason,is_primary) values
('93500000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000001',1,'consent_opted_out','Email consent is opted out',true),
('93500000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','93000000-0000-0000-0000-000000000002',1,'consent_opted_out','Email consent is opted out',true);
insert into public.campaign_approvals(id,organisation_id,campaign_id,campaign_version_id,reviewed_snapshot_id,final_snapshot_id,approving_membership_id,approved_at,eligible_recipient_count,excluded_recipient_count,no_delivery_occurred) values
('94000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000003','91000000-0000-0000-0000-000000000003','92000000-0000-0000-0000-000000000002','92000000-0000-0000-0000-000000000002','30000000-0000-0000-0000-000000000001','2026-11-16T00:00:00Z',0,1,true);

insert into public.activity_events(id,organisation_id,entity_type,entity_id,event_type,summary,actor_membership_id,occurred_at) values
('95000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','lead','50000000-0000-0000-0000-000000000001','lead.created','Lead recorded from fictional seed','30000000-0000-0000-0000-000000000001','2026-11-16T00:00:00Z');
