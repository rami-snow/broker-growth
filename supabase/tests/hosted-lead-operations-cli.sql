create temp table lead_verification_results(passed integer not null default 0,failed integer not null default 0);
insert into lead_verification_results default values;
grant select,update on lead_verification_results to authenticated,anon;
create or replace function pg_temp.lead_check(condition boolean,label text) returns void language plpgsql as $$begin if condition then update lead_verification_results set passed=passed+1;else update lead_verification_results set failed=failed+1;raise exception 'verification failed: %',label;end if;end$$;

begin;
select set_config('request.jwt.claims',json_build_object('role','anon')::text,true);
set local role anon;
do $$declare denied boolean:=false;begin begin perform public.create_mortgage_lead('10000000-0000-0000-0000-000000000001','4c470000-0000-4000-8000-000000000001','A','Lead','denied@example.test','0490000000','Test','Purchase','Immediately','Phone',null);exception when others then denied:=true;end;perform pg_temp.lead_check(denied,'anonymous denied');end$$;

reset role;
select set_config('request.jwt.claims',json_build_object('sub',(select id from auth.users where email='inactive.user@example.test'),'role','authenticated')::text,true);
set local role authenticated;
do $$declare denied boolean:=false;begin begin perform public.create_mortgage_lead('10000000-0000-0000-0000-000000000001','4c470000-0000-4000-8000-000000000002','A','Lead','denied@example.test','0490000000','Test','Purchase','Immediately','Phone',null);exception when others then denied:=true;end;perform pg_temp.lead_check(denied,'inactive denied');end$$;

reset role;
select set_config('request.jwt.claims',json_build_object('sub',(select id from auth.users where email='dana.ellis@example.test'),'role','authenticated')::text,true);
set local role authenticated;
do $$declare denied boolean:=false;begin begin perform public.create_mortgage_lead('10000000-0000-0000-0000-000000000001','4c470000-0000-4000-8000-000000000003','A','Lead','denied@example.test','0490000000','Test','Purchase','Immediately','Phone',null);exception when others then denied:=true;end;perform pg_temp.lead_check(denied,'missing create denied');end$$;

reset role;
select set_config('request.jwt.claims',json_build_object('sub',(select id from auth.users where email='alex.morgan@example.test'),'role','authenticated')::text,true);
set local role authenticated;
do $$declare denied boolean:=false;begin begin perform public.transition_lead('10000000-0000-0000-0000-000000000001','4c470000-0000-4000-8000-000000000004','50000000-0000-0000-0000-000000000002',1,'Contacted',null);exception when others then denied:=true;end;perform pg_temp.lead_check(denied,'cross tenant denied');end$$;

create temp table lead_verification_state as select public.create_mortgage_lead('10000000-0000-0000-0000-000000000001','4c470000-0000-4000-8000-000000000005','Fictional','Operation Check','milestone-4c-lead-suite@example.test','0490 470 101','Hosted verification','Purchase','Immediately','Phone',null) result;
alter table lead_verification_state add column lead_id uuid;alter table lead_verification_state add column contact_id uuid;update lead_verification_state set lead_id=(result->>'leadId')::uuid,contact_id=(result->>'contactId')::uuid;
select pg_temp.lead_check(result->>'leadId' is not null and result->>'contactId' is not null and (result->>'version')::int=1,'create result') from lead_verification_state;
select pg_temp.lead_check((select count(*)=1 from public.contacts c join lead_verification_state s on c.id=s.contact_id),'contact created');
select pg_temp.lead_check((select count(*)=1 from public.leads l join lead_verification_state s on l.id=s.lead_id),'lead created');
select pg_temp.lead_check((select count(*)=1 from public.mortgage_lead_details d join lead_verification_state s on d.lead_id=s.lead_id),'detail created');
select pg_temp.lead_check((select count(*)=3 from public.consent_evidence c join lead_verification_state s on c.contact_id=s.contact_id),'three consent rows');
select pg_temp.lead_check((select count(distinct status)=1 and min(status)='Not recorded' from public.consent_evidence c join lead_verification_state s on c.contact_id=s.contact_id),'consent not recorded');
select pg_temp.lead_check((select count(*)=1 from public.activity_events e join lead_verification_state s on e.entity_id=s.lead_id where event_type='lead.created'),'create activity');
select pg_temp.lead_check(public.create_mortgage_lead('10000000-0000-0000-0000-000000000001','4c470000-0000-4000-8000-000000000005','Fictional','Operation Check','milestone-4c-lead-suite@example.test','0490 470 101','Hosted verification','Purchase','Immediately','Phone',null)=result,'retry result') from lead_verification_state;
select pg_temp.lead_check((select count(*)=1 from public.leads l join lead_verification_state s on l.id=s.lead_id),'retry no duplicate');
do $$declare denied boolean:=false;s lead_verification_state%rowtype;begin select * into s from lead_verification_state;begin perform public.claim_lead('10000000-0000-0000-0000-000000000001','4c470000-0000-4000-8000-000000000005',s.lead_id,1);exception when others then denied:=true;end;perform pg_temp.lead_check(denied,'command reuse denied');end$$;

update lead_verification_state set result=public.claim_lead('10000000-0000-0000-0000-000000000001','4c470000-0000-4000-8000-000000000006',lead_id,1);
select pg_temp.lead_check(result->>'ownerMembershipId'='30000000-0000-0000-0000-000000000001','claim owner') from lead_verification_state;
update lead_verification_state set result=public.assign_lead('10000000-0000-0000-0000-000000000001','4c470000-0000-4000-8000-000000000007',lead_id,2,'30000000-0000-0000-0000-000000000004');
select pg_temp.lead_check(result->>'ownerMembershipId'='30000000-0000-0000-0000-000000000004','assign owner') from lead_verification_state;
do $$declare denied boolean:=false;s lead_verification_state%rowtype;begin select * into s from lead_verification_state;begin perform public.assign_lead('10000000-0000-0000-0000-000000000001','4c470000-0000-4000-8000-000000000008',s.lead_id,3,'30000000-0000-0000-0000-000000000002');exception when others then denied:=true;end;perform pg_temp.lead_check(denied,'cross org assignment denied');end$$;
do $$declare denied boolean:=false;s lead_verification_state%rowtype;begin select * into s from lead_verification_state;begin perform public.transition_lead('10000000-0000-0000-0000-000000000001','4c470000-0000-4000-8000-000000000009',s.lead_id,2,'Contacted',null);exception when others then denied:=true;end;perform pg_temp.lead_check(denied,'stale denied');end$$;

reset role;insert into public.membership_capabilities values('10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000006','lead.update',now()) on conflict do nothing;
select set_config('request.jwt.claims',json_build_object('sub',(select id from auth.users where email='priya.shah@example.test'),'role','authenticated')::text,true);set local role authenticated;
do $$declare denied boolean:=false;s lead_verification_state%rowtype;begin select * into s from lead_verification_state;begin perform public.transition_lead('10000000-0000-0000-0000-000000000001','4c470000-0000-4000-8000-000000000010',s.lead_id,3,'Contacted',null);exception when others then denied:=true;end;perform pg_temp.lead_check(denied,'non owner denied');end$$;

reset role;select set_config('request.jwt.claims',json_build_object('sub',(select id from auth.users where email='dana.ellis@example.test'),'role','authenticated')::text,true);set local role authenticated;
update lead_verification_state set result=public.record_contact_attempt('10000000-0000-0000-0000-000000000001','4c470000-0000-4000-8000-000000000011',lead_id,3,'Phone','Left message','Fictional hosted verification','2026-11-19T01:00:00Z');
select pg_temp.lead_check(result->>'status'='Contact attempted','contact status') from lead_verification_state;
select pg_temp.lead_check((select count(*)=1 from public.activity_events e join lead_verification_state s on e.entity_id=s.lead_id where event_type='contact.attempted' and details->>'channel'='Phone' and details->>'outcome'='Left message'),'contact structured');
select pg_temp.lead_check((select count(*)=1 from public.activity_events e join lead_verification_state s on e.entity_id=s.lead_id where event_type='lead.next_action_changed'),'next action audit');
update lead_verification_state set result=public.transition_lead('10000000-0000-0000-0000-000000000001','4c470000-0000-4000-8000-000000000012',lead_id,4,'Contacted','Controlled');
select pg_temp.lead_check(result->>'status'='Contacted','transition status') from lead_verification_state;
update lead_verification_state set result=public.add_lead_note('10000000-0000-0000-0000-000000000001','4c470000-0000-4000-8000-000000000013',lead_id,5,'Fictional verification note');
select pg_temp.lead_check((select details->>'note'='Fictional verification note' from public.activity_events where id=((select result->>'activityEventId' from lead_verification_state))::uuid),'note content');

reset role;select set_config('request.jwt.claims',json_build_object('sub',(select id from auth.users where email='alex.morgan@example.test'),'role','authenticated')::text,true);set local role authenticated;
update lead_verification_state set result=public.create_lead_task('10000000-0000-0000-0000-000000000001','4c470000-0000-4000-8000-000000000014',lead_id,5,'30000000-0000-0000-0000-000000000004','Fictional operation follow-up','2026-11-20T01:00:00Z','Normal');
select pg_temp.lead_check((select count(*)=1 from public.tasks where id=((select result->>'taskId' from lead_verification_state))::uuid),'task exists');
select pg_temp.lead_check((select count(*)=1 from public.activity_events e join lead_verification_state s on e.entity_id=s.lead_id where event_type='task.created' and details->>'taskId'=s.result->>'taskId'),'task activity');
select pg_temp.lead_check(public.create_lead_task('10000000-0000-0000-0000-000000000001','4c470000-0000-4000-8000-000000000014',lead_id,5,'30000000-0000-0000-0000-000000000004','Fictional operation follow-up','2026-11-20T01:00:00Z','Normal')=result,'task retry') from lead_verification_state;
update lead_verification_state set result=public.book_discovery_appointment('10000000-0000-0000-0000-000000000001','4c470000-0000-4000-8000-000000000015',lead_id,5,'30000000-0000-0000-0000-000000000004','2026-11-21T01:00:00Z',45,'Phone',null,'Fictional discovery');
select pg_temp.lead_check(result->>'appointmentId' is not null,'appointment id') from lead_verification_state;
select pg_temp.lead_check((select count(*)=1 from public.appointments where id=((select result->>'appointmentId' from lead_verification_state))::uuid),'appointment exists');
select pg_temp.lead_check((select lifecycle_status='Discovery booked' from public.leads l join lead_verification_state s on l.id=s.lead_id),'discovery status');
select pg_temp.lead_check((select count(*)=1 from public.activity_events e join lead_verification_state s on e.entity_id=s.lead_id where event_type='appointment.created'),'appointment activity');
select pg_temp.lead_check((select count(*)>=1 from public.activity_events e join lead_verification_state s on e.entity_id=s.lead_id where event_type='lead.status_changed'),'transition activity');
update lead_verification_state set result=public.transition_lead('10000000-0000-0000-0000-000000000001','4c470000-0000-4000-8000-000000000016',lead_id,6,'Closed',null);
select pg_temp.lead_check((result->>'version')::int=7,'close version') from lead_verification_state;
update lead_verification_state set result=public.transition_lead('10000000-0000-0000-0000-000000000001','4c470000-0000-4000-8000-000000000017',lead_id,7,'Nurture','Reopen');
select pg_temp.lead_check(result->>'status'='Nurture','reopen status') from lead_verification_state;
select pg_temp.lead_check((result->>'version')::int=8,'reopen version') from lead_verification_state;
do $$declare denied boolean:=false;s lead_verification_state%rowtype;begin select * into s from lead_verification_state;begin perform public.transition_lead('10000000-0000-0000-0000-000000000001','4c470000-0000-4000-8000-000000000018',s.lead_id,8,'Converted',null);exception when others then denied:=true;end;perform pg_temp.lead_check(denied,'converted generic denied');end$$;
do $$declare denied boolean:=false;s lead_verification_state%rowtype;begin select * into s from lead_verification_state;begin update public.leads set lifecycle_status='Converted' where id=s.lead_id;exception when others then denied:=true;end;perform pg_temp.lead_check(denied,'direct lead denied');end$$;
do $$declare denied boolean:=false;s lead_verification_state%rowtype;begin select * into s from lead_verification_state;begin insert into public.tasks(organisation_id,lead_id,assigned_membership_id,created_by_membership_id,title,due_at,priority,status)values('10000000-0000-0000-0000-000000000001',s.lead_id,'30000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','Bypass',now(),'Normal','Open');exception when others then denied:=true;end;perform pg_temp.lead_check(denied,'direct task denied');end$$;
do $$declare denied boolean:=false;begin begin update public.activity_events set summary='Rewritten' where summary='Fictional verification note';exception when others then denied:=true;end;perform pg_temp.lead_check(denied,'activity update denied');end$$;
do $$declare denied boolean:=false;begin begin perform * from public.operation_commands limit 1;exception when others then denied:=true;end;perform pg_temp.lead_check(denied,'commands denied');end$$;
select pg_temp.lead_check((select passed=40 and failed=0 from lead_verification_results),'transaction assertion plan');
select 41 passed,0 failed,'transaction will roll back' outcome;
rollback;
