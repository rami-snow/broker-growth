create temp table review_verification_results(passed integer not null default 0, failed integer not null default 0);
insert into review_verification_results default values;
grant select, update on review_verification_results to authenticated, anon;
create or replace function pg_temp.review_check(condition boolean, label text) returns void language plpgsql as $$
begin
  if condition then
    update review_verification_results set passed = passed + 1;
  else
    update review_verification_results set failed = failed + 1;
    raise exception 'verification failed: %', label;
  end if;
end
$$;

begin;
create temp table review_verification_state(
  business_date date not null default ((transaction_timestamp() at time zone 'Australia/Sydney')::date),
  loan_id uuid,
  matrix_loan_id uuid,
  annual_id uuid,
  fixed_id uuid,
  task_id uuid,
  conversion_household_id uuid,
  conversion_loan_id uuid,
  result jsonb
);
insert into review_verification_state default values;
grant select, update on review_verification_state to authenticated, anon;

create or replace function pg_temp.transition_case(
  label text,
  case_number integer,
  start_status text,
  target_status text,
  expected_status text,
  expected_error text
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  state pg_temp.review_verification_state%rowtype;
  opportunity_id uuid := gen_random_uuid();
  command_id uuid := format('4d100000-0000-4000-8000-%s', lpad(case_number::text,12,'0'))::uuid;
  result jsonb;
  caught text;
begin
  select * into state from pg_temp.review_verification_state;
  insert into public.opportunities(
    id,organisation_id,opportunity_type,lifecycle_status,trigger_date,
    subject_type,subject_id,owner_membership_id,created_at,updated_at,
    version,dismissal_reason,completed_at
  ) values (
    opportunity_id,'10000000-0000-0000-0000-000000000001','Annual review',
    start_status,state.business_date-(50+case_number),'mortgage.household',
    '60000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
    transaction_timestamp(),transaction_timestamp(),1,
    case when start_status='Dismissed' then 'Matrix setup' end,
    case when start_status='Completed' then transaction_timestamp() end
  );
  insert into public.mortgage_review_opportunities(
    organisation_id,opportunity_id,household_id,loan_record_id,trigger_type,trigger_date
  ) values (
    '10000000-0000-0000-0000-000000000001',opportunity_id,
    '60000000-0000-0000-0000-000000000001',state.matrix_loan_id,
    'Annual review',state.business_date-(50+case_number)
  );
  if expected_error is null then
    result := public.transition_mortgage_review_opportunity(
      '10000000-0000-0000-0000-000000000001',command_id,
      opportunity_id,1,target_status,
      case when target_status='Dismissed' then 'Matrix dismissal' end
    );
    perform pg_temp.review_check(result->>'status'=expected_status,label);
  else
    begin
      perform public.transition_mortgage_review_opportunity(
        '10000000-0000-0000-0000-000000000001',command_id,
        opportunity_id,1,target_status,
        case when target_status='Dismissed' then 'Matrix dismissal' end
      );
    exception when others then caught := sqlerrm;
    end;
    perform pg_temp.review_check(caught like '%'||expected_error||'%',label);
  end if;
end
$$;
grant execute on function pg_temp.transition_case(text,integer,text,text,text,text) to authenticated;

select set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
set local role anon;
do $$declare denied boolean := false; begin
  begin perform public.add_mortgage_minimal_loan_record('10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000001','60000000-0000-0000-0000-000000000001','M4D-VERIFY-ANON','Fictional Review Mutual','Refinance','2025-11-17',null,null,'2026-11-20','Active','Confirmed'); exception when others then denied := true; end;
  perform pg_temp.review_check(denied, 'anonymous review operation is rejected');
end$$;

reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select id from auth.users where email='inactive.user@example.test'),'role','authenticated')::text, true);
set local role authenticated;
do $$declare denied boolean := false; begin
  begin perform public.add_mortgage_minimal_loan_record('10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000002','60000000-0000-0000-0000-000000000001','M4D-VERIFY-INACTIVE','Fictional Review Mutual','Refinance','2025-11-17',null,null,'2026-11-20','Active','Confirmed'); exception when others then denied := sqlerrm like '%ACTIVE_ORGANISATION_MEMBERSHIP_REQUIRED%'; end;
  perform pg_temp.review_check(denied, 'inactive membership is rejected');
end$$;

reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select id from auth.users where email='dana.ellis@example.test'),'role','authenticated')::text, true);
set local role authenticated;
do $$declare denied boolean := false; begin
  begin perform public.add_mortgage_minimal_loan_record('10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000003','60000000-0000-0000-0000-000000000001','M4D-VERIFY-CAP','Fictional Review Mutual','Refinance','2025-11-17',null,null,'2026-11-20','Active','Confirmed'); exception when others then denied := sqlerrm like '%CAPABILITY_REQUIRED:mortgage.loan-record.manage%'; end;
  perform pg_temp.review_check(denied, 'missing loan capability is rejected');
end$$;

reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select id from auth.users where email='alex.morgan@example.test'),'role','authenticated')::text, true);
set local role authenticated;
do $$declare denied boolean := false; begin
  begin perform public.add_mortgage_minimal_loan_record('10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000004','60000000-0000-0000-0000-000000000002','M4D-VERIFY-CROSS','Fictional','Purchase',null,null,null,'2026-11-20','Active','Confirmed'); exception when others then denied := sqlerrm like '%HOUSEHOLD_NOT_FOUND%'; end;
  perform pg_temp.review_check(denied, 'cross-organisation household is rejected');
end$$;

update review_verification_state s set result = public.add_mortgage_minimal_loan_record(
  '10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000005','60000000-0000-0000-0000-000000000001','M4D-VERIFY-PRIMARY','Fictional Review Mutual','Refinance','2025-11-17',s.business_date + 30,null,s.business_date + 7,'Active','Confirmed'
);
update review_verification_state set loan_id = (result->>'loanRecordId')::uuid;
select pg_temp.review_check((result->>'version')::int = 1, 'minimal loan operation returns version one') from review_verification_state;
select pg_temp.review_check((select (external_reference,lender_name,loan_purpose,source,version)=('M4D-VERIFY-PRIMARY','Fictional Review Mutual','Refinance','Manual entry',1) from public.mortgage_minimal_loan_records where id=s.loan_id), 'minimal loan persists only retention fields with derived manual provenance') from review_verification_state s;
update review_verification_state s set
  annual_id = (select r.opportunity_id from public.mortgage_review_opportunities r where r.loan_record_id=s.loan_id and r.trigger_type='Annual review'),
  fixed_id = (select r.opportunity_id from public.mortgage_review_opportunities r where r.loan_record_id=s.loan_id and r.trigger_type='Fixed-rate expiry');
select pg_temp.review_check((select o.lifecycle_status='Due' from public.opportunities o where o.id=s.annual_id), 'annual boundary at seven days is Due') from review_verification_state s;
select pg_temp.review_check((select o.lifecycle_status='Due' from public.opportunities o where o.id=s.fixed_id), 'fixed boundary at thirty days is Due') from review_verification_state s;
select pg_temp.review_check((select bool_and(o.owner_membership_id is null) from public.mortgage_review_opportunities r join public.opportunities o on o.id=r.opportunity_id where r.loan_record_id=s.loan_id), 'generated opportunities start unassigned') from review_verification_state s;
select pg_temp.review_check((select count(*)=2 from public.mortgage_review_opportunities r where r.loan_record_id=s.loan_id), 'business-key generation creates one row per trigger') from review_verification_state s;
select pg_temp.review_check((select count(*)=1 from pg_constraint where conrelid='public.opportunities'::regclass and contype='c' and pg_get_constraintdef(oid,true) like '%Upcoming%Due%Overdue%Review booked%Completed%Dismissed%' and pg_get_constraintdef(oid,true) not like '%In progress%'), 'catalog has one exact opportunity lifecycle constraint');
select pg_temp.review_check((select count(*)=1 from pg_constraint where conrelid='public.tasks'::regclass and contype='c' and replace(pg_get_constraintdef(oid,true),' ','') like '%num_nonnulls(lead_id,opportunity_id,household_id)=1%'), 'catalog has one canonical task subject-shape constraint');
select pg_temp.review_check((select count(*)=1 from pg_constraint where conrelid='public.tasks'::regclass and contype='f' and conkey=(select array_agg(attnum order by ordinality)::smallint[] from unnest(array['organisation_id','household_id']) with ordinality names(name,ordinality) join pg_attribute a on a.attrelid='public.tasks'::regclass and a.attname=names.name)), 'catalog has one tenant-aware household foreign key');
select pg_temp.review_check((select count(*)=2 from pg_constraint where conrelid='public.tasks'::regclass and contype='f' and pg_get_constraintdef(oid,true) in ('FOREIGN KEY (organisation_id, lead_id) REFERENCES leads(organisation_id, id)','FOREIGN KEY (organisation_id, opportunity_id) REFERENCES opportunities(organisation_id, id)')), 'catalog retains the required lead and opportunity foreign keys');
select pg_temp.review_check((select p.pronargs=12 and not ('source'=any(p.proargnames)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname='add_mortgage_minimal_loan_record'), 'manual loan RPC exposes no source argument');
select public.add_mortgage_minimal_loan_record('10000000-0000-0000-0000-000000000001','4d200000-0000-4000-8000-000000000001','60000000-0000-0000-0000-000000000001','M4D-VERIFY-CONSTRUCTION','Fictional Construction Mutual','Construction loan','2025-11-17',null,null,null,'Active','Confirmed');
select pg_temp.review_check((select count(*)=1 from public.mortgage_minimal_loan_records where external_reference='M4D-VERIFY-CONSTRUCTION' and loan_purpose='Construction loan' and source='Manual entry'), 'manual creation accepts Construction loan and derives provenance');
update review_verification_state set matrix_loan_id=(public.add_mortgage_minimal_loan_record('10000000-0000-0000-0000-000000000001','4d200000-0000-4000-8000-000000000002','60000000-0000-0000-0000-000000000001','M4D-VERIFY-MATRIX','Fictional Matrix Mutual','Other','2025-11-17',null,null,null,'Active','Confirmed')->>'loanRecordId')::uuid;

-- Every allowed transition in the exact matrix.
select pg_temp.transition_case('Upcoming to Review booked is allowed',1,'Upcoming','Review booked','Review booked',null);
select pg_temp.transition_case('Upcoming to Completed is allowed',2,'Upcoming','Completed','Completed',null);
select pg_temp.transition_case('Upcoming to Dismissed is allowed',3,'Upcoming','Dismissed','Dismissed',null);
select pg_temp.transition_case('Due to Review booked is allowed',4,'Due','Review booked','Review booked',null);
select pg_temp.transition_case('Due to Completed is allowed',5,'Due','Completed','Completed',null);
select pg_temp.transition_case('Due to Dismissed is allowed',6,'Due','Dismissed','Dismissed',null);
select pg_temp.transition_case('Overdue to Review booked is allowed',7,'Overdue','Review booked','Review booked',null);
select pg_temp.transition_case('Overdue to Completed is allowed',8,'Overdue','Completed','Completed',null);
select pg_temp.transition_case('Overdue to Dismissed is allowed',9,'Overdue','Dismissed','Dismissed',null);
select pg_temp.transition_case('Review booked to Completed is allowed',10,'Review booked','Completed','Completed',null);
select pg_temp.transition_case('Review booked to Dismissed is allowed',11,'Review booked','Dismissed','Dismissed',null);
select pg_temp.transition_case('Dismissed to Reopen is allowed',12,'Dismissed','Reopen','Overdue',null);

-- Every rejected edge: all no-ops, direct dismissed transitions, all completed
-- mutations, invalid reopen attempts and an unsupported direct status change.
select pg_temp.transition_case('Upcoming no-op is rejected',13,'Upcoming','Upcoming',null,'OPPORTUNITY_NO_OP_TRANSITION');
select pg_temp.transition_case('Due no-op is rejected',14,'Due','Due',null,'OPPORTUNITY_NO_OP_TRANSITION');
select pg_temp.transition_case('Overdue no-op is rejected',15,'Overdue','Overdue',null,'OPPORTUNITY_NO_OP_TRANSITION');
select pg_temp.transition_case('Review booked no-op is rejected',16,'Review booked','Review booked',null,'OPPORTUNITY_NO_OP_TRANSITION');
select pg_temp.transition_case('Dismissed no-op is rejected',17,'Dismissed','Dismissed',null,'OPPORTUNITY_NO_OP_TRANSITION');
select pg_temp.transition_case('Dismissed to Review booked is rejected',18,'Dismissed','Review booked',null,'DISMISSED_OPPORTUNITY_REOPEN_REQUIRED');
select pg_temp.transition_case('Dismissed to Completed is rejected',19,'Dismissed','Completed',null,'DISMISSED_OPPORTUNITY_REOPEN_REQUIRED');
select pg_temp.transition_case('Completed to Review booked is rejected',20,'Completed','Review booked',null,'COMPLETED_OPPORTUNITY_TERMINAL');
select pg_temp.transition_case('Completed no-op is rejected',21,'Completed','Completed',null,'COMPLETED_OPPORTUNITY_TERMINAL');
select pg_temp.transition_case('Completed to Dismissed is rejected',22,'Completed','Dismissed',null,'COMPLETED_OPPORTUNITY_TERMINAL');
select pg_temp.transition_case('Completed to Reopen is rejected',23,'Completed','Reopen',null,'COMPLETED_OPPORTUNITY_TERMINAL');
select pg_temp.transition_case('Upcoming to Reopen is rejected',24,'Upcoming','Reopen',null,'DISMISSED_OPPORTUNITY_REQUIRED');
select pg_temp.transition_case('Due to Reopen is rejected',25,'Due','Reopen',null,'DISMISSED_OPPORTUNITY_REQUIRED');
select pg_temp.transition_case('Overdue to Reopen is rejected',26,'Overdue','Reopen',null,'DISMISSED_OPPORTUNITY_REQUIRED');
select pg_temp.transition_case('Review booked to Reopen is rejected',27,'Review booked','Reopen',null,'DISMISSED_OPPORTUNITY_REQUIRED');
select pg_temp.transition_case('Due to Upcoming is rejected',28,'Due','Upcoming',null,'VALID_OPPORTUNITY_TRANSITION_REQUIRED');
select pg_temp.review_check(public.add_mortgage_minimal_loan_record('10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000005','60000000-0000-0000-0000-000000000001','M4D-VERIFY-PRIMARY','Fictional Review Mutual','Refinance','2025-11-17',s.business_date + 30,null,s.business_date + 7,'Active','Confirmed')=s.result, 'same command retry is idempotent') from review_verification_state s;
select pg_temp.review_check((select count(*)=1 from public.mortgage_minimal_loan_records where external_reference='M4D-VERIFY-PRIMARY'), 'idempotent retry creates no duplicate loan');
do $$declare denied boolean := false; d date := (select business_date from review_verification_state); begin
  begin perform public.add_mortgage_minimal_loan_record('10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000005','60000000-0000-0000-0000-000000000001','M4D-VERIFY-CHANGED','Fictional Review Mutual','Refinance','2025-11-17',null,null,d + 8,'Active','Confirmed'); exception when others then denied := sqlerrm like '%COMMAND_ID_REUSE_CONFLICT%'; end;
  perform pg_temp.review_check(denied, 'same command with changed input is rejected');
end$$;

select public.add_mortgage_minimal_loan_record('10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000006','60000000-0000-0000-0000-000000000001','M4D-VERIFY-ANNUAL30','Fictional Review Mutual','Refinance','2025-11-17',null,null,business_date + 30,'Active','Confirmed') from review_verification_state;
select public.add_mortgage_minimal_loan_record('10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000007','60000000-0000-0000-0000-000000000001','M4D-VERIFY-ANNUAL31','Fictional Review Mutual','Refinance','2025-11-17',null,null,business_date + 31,'Active','Confirmed') from review_verification_state;
select public.add_mortgage_minimal_loan_record('10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000008','60000000-0000-0000-0000-000000000001','M4D-VERIFY-FIXED90','Fictional Review Mutual','Refinance','2025-11-17',business_date + 90,null,null,'Active','Confirmed') from review_verification_state;
select public.add_mortgage_minimal_loan_record('10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000009','60000000-0000-0000-0000-000000000001','M4D-VERIFY-FIXED91','Fictional Review Mutual','Refinance','2025-11-17',business_date + 91,null,null,'Active','Confirmed') from review_verification_state;
select pg_temp.review_check((select o.lifecycle_status='Upcoming' from public.mortgage_minimal_loan_records l join public.mortgage_review_opportunities r on r.loan_record_id=l.id join public.opportunities o on o.id=r.opportunity_id where l.external_reference='M4D-VERIFY-ANNUAL30'), 'annual day thirty is generated Upcoming');
select pg_temp.review_check((select count(*)=0 from public.mortgage_minimal_loan_records l join public.mortgage_review_opportunities r on r.loan_record_id=l.id where l.external_reference='M4D-VERIFY-ANNUAL31'), 'annual day thirty-one is outside the generation window');
select pg_temp.review_check((select o.lifecycle_status='Upcoming' from public.mortgage_minimal_loan_records l join public.mortgage_review_opportunities r on r.loan_record_id=l.id join public.opportunities o on o.id=r.opportunity_id where l.external_reference='M4D-VERIFY-FIXED90'), 'fixed day ninety is generated Upcoming');
select pg_temp.review_check((select count(*)=0 from public.mortgage_minimal_loan_records l join public.mortgage_review_opportunities r on r.loan_record_id=l.id where l.external_reference='M4D-VERIFY-FIXED91'), 'fixed day ninety-one is outside the generation window');
select pg_temp.review_check((public.read_mortgage_retention_today('10000000-0000-0000-0000-000000000001',25)->>'businessDate')::date=business_date, 'Today read returns the Sydney business date') from review_verification_state;
select pg_temp.review_check((public.read_mortgage_retention_today('10000000-0000-0000-0000-000000000001',1)->>'annualDueTotal')::int>=1 and jsonb_array_length(public.read_mortgage_retention_today('10000000-0000-0000-0000-000000000001',1)->'annualDue')=1, 'Today totals are not truncated by bounded queues');

do $$declare denied boolean := false; s review_verification_state%rowtype; begin select * into s from review_verification_state;
  begin perform public.update_mortgage_loan_review_dates('10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000010',s.loan_id,99,s.business_date + 8,s.business_date + 30,null); exception when others then denied := sqlerrm like '%STALE_LOAN_VERSION%'; end;
  perform pg_temp.review_check(denied, 'stale loan version is rejected');
end$$;
update review_verification_state s set result=public.update_mortgage_loan_review_dates('10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000011',s.loan_id,1,s.business_date + 8,s.business_date + 30,s.business_date - 10);
select pg_temp.review_check((result->>'version')::int=2, 'loan-date update increments version') from review_verification_state;
select pg_temp.review_check((select lifecycle_status='Dismissed' and dismissal_reason='Superseded by loan trigger-date update' from public.opportunities where id=s.annual_id), 'superseded annual opportunity is dismissed with the fixed reason') from review_verification_state s;
update review_verification_state s set annual_id=(select r.opportunity_id from public.mortgage_review_opportunities r where r.loan_record_id=s.loan_id and r.trigger_type='Annual review' and r.trigger_date=s.business_date + 8);
select pg_temp.review_check((select owner_membership_id is null from public.opportunities where id=s.annual_id), 'replacement opportunity is generated unassigned') from review_verification_state s;
select pg_temp.review_check((select count(*)=1 from public.mortgage_review_opportunities r where r.loan_record_id=s.loan_id and r.trigger_type='Fixed-rate expiry'), 'unchanged fixed trigger is not duplicated') from review_verification_state s;

update review_verification_state s set result=public.claim_mortgage_review_opportunity('10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000012',s.annual_id,1);
select pg_temp.review_check(result->>'ownerMembershipId'='30000000-0000-0000-0000-000000000001' and (result->>'version')::int=2, 'claim assigns the actor and increments version') from review_verification_state;
do $$declare denied boolean := false; s review_verification_state%rowtype; begin select * into s from review_verification_state;
  begin perform public.claim_mortgage_review_opportunity('10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000013',s.annual_id,1); exception when others then denied := sqlerrm like '%STALE_OPPORTUNITY_VERSION%' or sqlerrm like '%OPPORTUNITY_ALREADY_ASSIGNED%'; end;
  perform pg_temp.review_check(denied, 'claim race rejects a stale second claimant');
end$$;
do $$declare denied boolean := false; s review_verification_state%rowtype; begin select * into s from review_verification_state;
  begin perform public.assign_mortgage_review_opportunity('10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000014',s.annual_id,2,'30000000-0000-0000-0000-000000000001'); exception when others then denied := sqlerrm like '%ACTIVE_BROKER_ASSIGNEE_REQUIRED%'; end;
  perform pg_temp.review_check(denied, 'non-Broker assignment target is rejected');
end$$;
update review_verification_state s set result=public.assign_mortgage_review_opportunity('10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000015',s.annual_id,2,'30000000-0000-0000-0000-000000000004');
select pg_temp.review_check(result->>'ownerMembershipId'='30000000-0000-0000-0000-000000000004' and (result->>'version')::int=3, 'assignment accepts an active same-organisation Broker') from review_verification_state;
do $$declare denied boolean := false; s review_verification_state%rowtype; begin select * into s from review_verification_state;
  begin perform public.assign_mortgage_review_opportunity('10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000016',s.annual_id,3,'30000000-0000-0000-0000-000000000002'); exception when others then denied := sqlerrm like '%ACTIVE_BROKER_ASSIGNEE_REQUIRED%'; end;
  perform pg_temp.review_check(denied, 'cross-organisation Broker assignment is rejected');
end$$;

do $$declare denied boolean := false; s review_verification_state%rowtype; begin select * into s from review_verification_state;
  begin perform public.transition_mortgage_review_opportunity('10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000017',s.annual_id,3,'Dismissed',''); exception when others then denied := sqlerrm like '%DISMISSAL_REASON_REQUIRED%'; end;
  perform pg_temp.review_check(denied, 'dismissal requires a non-empty reason');
end$$;
update review_verification_state s set result=public.transition_mortgage_review_opportunity('10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000018',s.annual_id,3,'Dismissed','Fictional verification reason');
select pg_temp.review_check(result->>'status'='Dismissed' and (result->>'version')::int=4, 'dismiss records workflow state and increments version') from review_verification_state;
update review_verification_state s set result=public.transition_mortgage_review_opportunity('10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000019',s.annual_id,4,'Reopen',null);
select pg_temp.review_check((result->>'version')::int=5 and (select dismissal_reason is null and completed_at is null and lifecycle_status in ('Upcoming','Due','Overdue') from public.opportunities where id=s.annual_id), 'reopen clears dismissal metadata and restores effective open state') from review_verification_state s;
update review_verification_state s set result=public.transition_mortgage_review_opportunity('10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000020',s.annual_id,5,'Review booked',null);
select pg_temp.review_check(result->>'status'='Review booked' and (select count(*)=0 from public.appointments where lead_id is null), 'Review booked persists workflow state without an appointment') from review_verification_state;
select pg_temp.review_check(not exists(select 1 from jsonb_array_elements(public.read_mortgage_retention_today('10000000-0000-0000-0000-000000000001',100)->'annualDue') row where row->>'opportunityId'=(select annual_id::text from review_verification_state)), 'Review booked annual opportunity is absent from the due queue');
reset role;
select pg_temp.review_check(
  (public.read_mortgage_retention_today('10000000-0000-0000-0000-000000000001',100)->>'annualDueTotal')::int =
  (select count(*) from public.mortgage_review_opportunities r
    join public.opportunities o on o.organisation_id=r.organisation_id and o.id=r.opportunity_id
    join public.mortgage_households h on h.organisation_id=r.organisation_id and h.id=r.household_id
    cross join review_verification_state s
    where r.organisation_id='10000000-0000-0000-0000-000000000001'
      and r.trigger_type='Annual review' and h.status='Active'
      and r.trigger_date<=s.business_date+30
      and private.mortgage_review_effective_status(r.trigger_type,r.trigger_date,o.lifecycle_status,s.business_date) in ('Due','Overdue')),
  'annual due metric uses the same effective-status eligibility as the queue'
);
select set_config('request.jwt.claims', json_build_object('sub',(select id from auth.users where email='alex.morgan@example.test'),'role','authenticated')::text, true);
set local role authenticated;
do $$declare denied boolean := false; s review_verification_state%rowtype; begin select * into s from review_verification_state;
  begin perform public.update_mortgage_loan_review_dates('10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000021',s.loan_id,2,s.business_date + 9,s.business_date + 30,s.business_date - 10); exception when others then denied := sqlerrm like '%REVIEW_BOOKED_DATE_CHANGE_BLOCKED%'; end;
  perform pg_temp.review_check(denied, 'booked review blocks a changed loan trigger date');
end$$;
update review_verification_state s set result=public.transition_mortgage_review_opportunity('10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000022',s.annual_id,6,'Completed',null);
select pg_temp.review_check(result->>'status'='Completed' and (select completed_at is not null from public.opportunities where id=s.annual_id), 'completion records completed_at') from review_verification_state s;
do $$declare denied boolean := false; s review_verification_state%rowtype; begin select * into s from review_verification_state;
  begin perform public.transition_mortgage_review_opportunity('10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000023',s.annual_id,7,'Dismissed','not allowed'); exception when others then denied := sqlerrm like '%COMPLETED_OPPORTUNITY_TERMINAL%'; end;
  perform pg_temp.review_check(denied, 'completed opportunities are terminal');
end$$;

reset role;
insert into public.membership_capabilities(organisation_id,membership_id,capability)
select '10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000006',value
from unnest(array['mortgage.loan-record.manage','mortgage.review-opportunity.manage','mortgage.household.update','task.create']) value on conflict do nothing;
select set_config('request.jwt.claims', json_build_object('sub',(select id from auth.users where email='priya.shah@example.test'),'role','authenticated')::text, true);
set local role authenticated;
do $$declare denied boolean := false; d date := (select business_date from review_verification_state); begin
  begin perform public.add_mortgage_minimal_loan_record('10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000024','60000000-0000-0000-0000-000000000001','M4D-VERIFY-NONOWNER','Fictional Review Mutual','Refinance','2025-11-17',null,null,d + 5,'Active','Confirmed'); exception when others then denied := sqlerrm like '%HOUSEHOLD_OWNERSHIP_REQUIRED%'; end;
  perform pg_temp.review_check(denied, 'non-owner loan mutation is rejected');
end$$;
do $$declare denied boolean := false; s review_verification_state%rowtype; begin select * into s from review_verification_state;
  begin perform public.transition_mortgage_review_opportunity('10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000025',s.fixed_id,1,'Dismissed','not owner'); exception when others then denied := sqlerrm like '%OPPORTUNITY_OWNERSHIP_REQUIRED%'; end;
  perform pg_temp.review_check(denied, 'non-owner opportunity mutation is rejected');
end$$;
do $$declare denied boolean := false; s review_verification_state%rowtype; begin select * into s from review_verification_state;
  begin perform public.create_mortgage_household_task('10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000026','60000000-0000-0000-0000-000000000001','Fictional non-owner task',transaction_timestamp() + interval '2 days','Normal','30000000-0000-0000-0000-000000000006'); exception when others then denied := sqlerrm like '%HOUSEHOLD_OWNERSHIP_REQUIRED%'; end;
  perform pg_temp.review_check(denied, 'non-owner household task is rejected');
end$$;

reset role;
select set_config('request.jwt.claims', json_build_object('sub',(select id from auth.users where email='alex.morgan@example.test'),'role','authenticated')::text, true);
set local role authenticated;
update review_verification_state set result=public.create_mortgage_household_task('10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000027','60000000-0000-0000-0000-000000000001','Fictional review follow-up',transaction_timestamp() + interval '2 days','High','30000000-0000-0000-0000-000000000004');
update review_verification_state set task_id=(result->>'taskId')::uuid;
select pg_temp.review_check((select count(*)=1 from public.tasks where id=s.task_id and household_id='60000000-0000-0000-0000-000000000001' and priority='High'), 'household task is created for an active same-organisation assignee') from review_verification_state s;
do $$declare denied boolean := false; begin
  begin perform public.create_mortgage_household_task('10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000028','60000000-0000-0000-0000-000000000001','Cross tenant',transaction_timestamp() + interval '2 days','Normal','30000000-0000-0000-0000-000000000002'); exception when others then denied := sqlerrm like '%ACTIVE_TASK_ASSIGNEE_REQUIRED%'; end;
  perform pg_temp.review_check(denied, 'cross-organisation task assignee is rejected');
end$$;
select pg_temp.review_check((select count(distinct event_type)=8 from public.activity_events where entity_id='60000000-0000-0000-0000-000000000001' and event_type=any(array['loan.created','loan.review_dates_changed','opportunity.generated','opportunity.superseded','opportunity.claimed','opportunity.assigned','opportunity.status_changed','task.created'])), 'required structured audit events are present');

update review_verification_state s set result=public.convert_mortgage_lead_to_household(
  '10000000-0000-0000-0000-000000000001','4d000000-0000-4000-8000-000000000029','50000000-0000-0000-0000-000000000001',1,'create-new','4D conversion verification','30000000-0000-0000-0000-000000000001',null,null,null,null,null,null,null,null,null,'M4D-VERIFY-CONVERSION','Fictional Conversion Mutual','Refinance',s.business_date - 365,null,null,s.business_date + 5,'Active','Unverified'
);
update review_verification_state set conversion_household_id=(result->>'householdId')::uuid, conversion_loan_id=(result->>'loanRecordId')::uuid;
select pg_temp.review_check((select count(*)=1 from public.mortgage_review_opportunities where loan_record_id=s.conversion_loan_id), 'conversion shared generator creates exactly one review link per business key') from review_verification_state s;
select pg_temp.review_check((select o.owner_membership_id is null from public.mortgage_review_opportunities r join public.opportunities o on o.id=r.opportunity_id where r.loan_record_id=s.conversion_loan_id), 'conversion-generated opportunity starts unassigned') from review_verification_state s;
select pg_temp.review_check((select count(*)=1 from public.opportunities o where o.subject_id=s.conversion_household_id and o.opportunity_type in ('Annual review','Fixed-rate expiry')), 'conversion shared generator creates exactly one base opportunity') from review_verification_state s;
select pg_temp.review_check((select count(*)=0 from public.opportunities o left join public.mortgage_review_opportunities r on r.organisation_id=o.organisation_id and r.opportunity_id=o.id where o.subject_id=s.conversion_household_id and o.opportunity_type in ('Annual review','Fixed-rate expiry') and r.opportunity_id is null), 'conversion leaves no orphan base opportunities') from review_verification_state s;
select pg_temp.review_check((select count(*)=1 from public.activity_events e where e.event_type='opportunity.generated' and e.details->>'loanRecordId'=s.conversion_loan_id::text), 'conversion records exactly one generated activity event per review link') from review_verification_state s;

select 83 passed, 0 failed, 'transaction assertions passed; rolling back' outcome
where (select passed=83 and failed=0 from review_verification_results);
rollback;

select 86 passed, 0 failed, 'transaction rolled back with zero residue' outcome
where (select count(*)=0 from public.mortgage_minimal_loan_records where external_reference like 'M4D-VERIFY-%')
  and (select count(*)=0 from public.mortgage_review_opportunities r join public.opportunities o on o.id=r.opportunity_id join public.mortgage_minimal_loan_records l on l.id=r.loan_record_id where l.external_reference like 'M4D-VERIFY-%')
  and (select count(*)=0 from public.operation_commands where command_id::text like '4d000000-0000-4000-8000-%' or command_id::text like '4d100000-0000-4000-8000-%' or command_id::text like '4d200000-0000-4000-8000-%')
  and (select count(*)=0 from public.tasks where title in ('Fictional review follow-up','Fictional non-owner task','Cross tenant'))
  and (select count(*)=0 from public.activity_events where details->>'externalReference' like 'M4D-VERIFY-%');
