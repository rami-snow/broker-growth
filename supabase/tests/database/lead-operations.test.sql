begin;
select plan(22);

set local role anon;
select throws_ok(
  $$select public.create_mortgage_lead('10000000-0000-0000-0000-000000000001','a0000000-0000-4000-8000-000000000001','A','Lead','a@example.test','0490000000','Test','Purchase','Immediately','Phone',null)$$,
  '42501', null, 'anonymous users cannot invoke lead creation'
);

set local role authenticated;
select set_config('request.jwt.claims',json_build_object('sub',(select id from auth.users where email='inactive.user@example.test'),'role','authenticated')::text,true);
select throws_ok(
  $$select public.create_mortgage_lead('10000000-0000-0000-0000-000000000001','a0000000-0000-4000-8000-000000000002','A','Lead','a@example.test','0490000000','Test','Purchase','Immediately','Phone',null)$$,
  '42501', null, 'inactive membership cannot invoke lead creation'
);

select set_config('request.jwt.claims',json_build_object('sub',(select id from auth.users where email='alex.morgan@example.test'),'role','authenticated')::text,true);
create temporary table operation_result as
select public.create_mortgage_lead(
  '10000000-0000-0000-0000-000000000001','a0000000-0000-4000-8000-000000000010',
  'Fictional','Prospect','fictional.prospect@example.test','0490 999 010','Website enquiry',
  'Purchase','Immediately','Phone',null
) result;

select is((select count(*)::integer from public.contacts where email='fictional.prospect@example.test'),1,'lead creation creates one contact');
select is((select count(*)::integer from public.leads where id=((select result->>'leadId' from operation_result))::uuid),1,'lead creation creates one lead');
select is((select count(*)::integer from public.mortgage_lead_details where lead_id=((select result->>'leadId' from operation_result))::uuid),1,'lead creation creates mortgage details');
select is((select count(*)::integer from public.consent_evidence where contact_id=((select result->>'contactId' from operation_result))::uuid and status='Not recorded'),3,'lead creation records explicit not-recorded evidence for all channels');
select is((select count(*)::integer from public.activity_events where entity_id=((select result->>'leadId' from operation_result))::uuid and event_type='lead.created'),1,'lead creation appends one activity event');

select is(
  public.create_mortgage_lead('10000000-0000-0000-0000-000000000001','a0000000-0000-4000-8000-000000000010','Fictional','Prospect','fictional.prospect@example.test','0490 999 010','Website enquiry','Purchase','Immediately','Phone',null),
  (select result from operation_result),
  'a duplicate command returns the original result'
);
select is((select count(*)::integer from public.leads where id=((select result->>'leadId' from operation_result))::uuid),1,'a duplicate command does not duplicate the lead');

select lives_ok(format(
  $$select public.claim_lead('10000000-0000-0000-0000-000000000001','a0000000-0000-4000-8000-000000000011','%s',1)$$,
  (select result->>'leadId' from operation_result)
), 'claim succeeds for an active unassigned lead');
select is((select version from public.leads where id=((select result->>'leadId' from operation_result))::uuid),2,'claim increments the lead version');
select throws_ok(format(
  $$select public.transition_lead('10000000-0000-0000-0000-000000000001','a0000000-0000-4000-8000-000000000012','%s',1,'Contacted',null)$$,
  (select result->>'leadId' from operation_result)
), '40001', null, 'stale versions fail safely');
select throws_ok(format(
  $$select public.assign_lead('10000000-0000-0000-0000-000000000001','a0000000-0000-4000-8000-000000000013','%s',2,'30000000-0000-0000-0000-000000000002')$$,
  (select result->>'leadId' from operation_result)
), '23503', null, 'cross-organisation assignment is rejected');

select lives_ok(format(
  $$select public.record_contact_attempt('10000000-0000-0000-0000-000000000001','a0000000-0000-4000-8000-000000000014','%s',2,'Phone','Left message','External voicemail','2026-11-18T01:00:00Z')$$,
  (select result->>'leadId' from operation_result)
), 'structured contact attempt succeeds');
select is((select count(*)::integer from public.activity_events where entity_id=((select result->>'leadId' from operation_result))::uuid and event_type='contact.attempted' and details->>'channel'='Phone' and details->>'outcome'='Left message'),1,'contact activity stores structured channel and outcome');
select is((select count(*)::integer from public.activity_events where entity_id=((select result->>'leadId' from operation_result))::uuid and event_type='lead.next_action_changed'),1,'contact operation records next-action activity separately');

select lives_ok(format(
  $$select public.transition_lead('10000000-0000-0000-0000-000000000001','a0000000-0000-4000-8000-000000000015','%s',3,'Contacted',null)$$,
  (select result->>'leadId' from operation_result)
), 'allowed lead transition succeeds');
select lives_ok(format(
  $$select public.create_lead_task('10000000-0000-0000-0000-000000000001','a0000000-0000-4000-8000-000000000016','%s',4,'30000000-0000-0000-0000-000000000001','Fictional follow-up','2026-11-19T01:00:00Z','Normal')$$,
  (select result->>'leadId' from operation_result)
), 'lead task and activity are created atomically');
select lives_ok(format(
  $$select public.book_discovery_appointment('10000000-0000-0000-0000-000000000001','a0000000-0000-4000-8000-000000000017','%s',4,'30000000-0000-0000-0000-000000000001','2026-11-20T01:00:00Z',45,'Phone',null,'')$$,
  (select result->>'leadId' from operation_result)
), 'discovery booking and status transition succeed atomically');
select is((select lifecycle_status from public.leads where id=((select result->>'leadId' from operation_result))::uuid),'Discovery booked','discovery booking updates lead status');
select is((select count(*)::integer from public.appointments where lead_id=((select result->>'leadId' from operation_result))::uuid),1,'discovery booking creates one appointment');

select throws_ok($$select * from public.operation_commands$$,'42501',null,'authenticated users cannot read the idempotency ledger directly');

select * from finish();
rollback;
