-- Broker Growth Desk Milestone 4D: guarded retention and review operations.

alter table public.opportunities
  add column if not exists version integer not null default 1 check (version > 0);

alter table public.opportunities drop constraint if exists opportunities_lifecycle_status_check;
alter table public.opportunities add constraint opportunities_lifecycle_status_check
  check (lifecycle_status in ('Upcoming','Due','Overdue','In progress','Review booked','Completed','Dismissed'));

alter table public.tasks add column if not exists household_id uuid;
alter table public.tasks drop constraint if exists tasks_check;
alter table public.tasks add constraint tasks_single_subject_check
  check (num_nonnulls(lead_id, opportunity_id, household_id) = 1);
alter table public.tasks add constraint tasks_organisation_id_household_id_fkey
  foreign key (organisation_id, household_id)
  references public.mortgage_households(organisation_id, id);

alter table public.operation_commands add column if not exists request_fingerprint text;

-- Workflow tables are read-only to authenticated clients. All writes below go
-- through guarded functions which own authorization, locking and audit.
revoke insert, update, delete on public.mortgage_minimal_loan_records from authenticated;
revoke insert, update, delete on public.mortgage_review_opportunities from authenticated;
revoke insert, update, delete on public.opportunities from authenticated;
revoke insert, update, delete on public.tasks from authenticated;

create or replace function private.begin_operation_command_checked(
  target_organisation_id uuid,
  target_command_id uuid,
  target_operation_type text,
  target_actor_membership_id uuid,
  target_request jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  existing public.operation_commands%rowtype;
  fingerprint text := md5(target_request::text);
begin
  if target_command_id is null then
    raise exception 'COMMAND_ID_REQUIRED' using errcode = '22023';
  end if;
  insert into public.operation_commands(
    organisation_id, command_id, operation_type, actor_user_id,
    actor_membership_id, request_fingerprint
  ) values (
    target_organisation_id, target_command_id, target_operation_type, auth.uid(),
    target_actor_membership_id, fingerprint
  ) on conflict (organisation_id, command_id) do nothing;
  if found then return null; end if;

  select * into existing from public.operation_commands c
  where c.organisation_id = target_organisation_id
    and c.command_id = target_command_id;
  if existing.actor_user_id <> auth.uid()
     or existing.operation_type <> target_operation_type
     or existing.request_fingerprint is distinct from fingerprint then
    raise exception 'COMMAND_ID_REUSE_CONFLICT' using errcode = '23505';
  end if;
  if existing.result is null then
    raise exception 'COMMAND_INCOMPLETE' using errcode = '40001';
  end if;
  return existing.result;
end
$$;

revoke all on function private.begin_operation_command_checked(uuid,uuid,text,uuid,jsonb)
  from public, anon, authenticated;

create or replace function private.mortgage_review_effective_status(
  trigger_kind text,
  trigger_on date,
  stored_status text,
  business_date date
) returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when stored_status in ('Review booked','Completed','Dismissed') then stored_status
    when trigger_on < business_date then 'Overdue'
    when trigger_kind = 'Annual review' and trigger_on <= business_date + 7 then 'Due'
    when trigger_kind = 'Fixed-rate expiry' and trigger_on <= business_date + 30 then 'Due'
    else 'Upcoming'
  end
$$;

revoke all on function private.mortgage_review_effective_status(text,date,text,date)
  from public, anon, authenticated;

create or replace function private.reconcile_mortgage_review_opportunities(
  target_organisation_id uuid,
  target_loan_record_id uuid,
  target_actor_membership_id uuid,
  target_reason text default 'Loan review schedule reconciled'
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  target_loan public.mortgage_minimal_loan_records%rowtype;
  target_household public.mortgage_households%rowtype;
  linked record;
  trigger_kind text;
  trigger_on date;
  business_date date := (transaction_timestamp() at time zone 'Australia/Sydney')::date;
  opportunity_id uuid;
  generated integer := 0;
  superseded integer := 0;
begin
  select * into target_loan from public.mortgage_minimal_loan_records l
  where l.organisation_id = target_organisation_id
    and l.id = target_loan_record_id
  for update;
  if not found then raise exception 'LOAN_RECORD_NOT_FOUND' using errcode = 'P0002'; end if;

  select * into target_household from public.mortgage_households h
  where h.organisation_id = target_organisation_id
    and h.id = target_loan.household_id
  for update;
  if not found then raise exception 'HOUSEHOLD_NOT_FOUND' using errcode = 'P0002'; end if;

  -- A current open opportunity whose business key no longer matches the loan is
  -- retained as history and explicitly dismissed, never rewritten in place.
  for linked in
    select r.opportunity_id, r.trigger_type, r.trigger_date,
      o.lifecycle_status, o.version
    from public.mortgage_review_opportunities r
    join public.opportunities o
      on o.organisation_id = r.organisation_id and o.id = r.opportunity_id
    where r.organisation_id = target_organisation_id
      and r.loan_record_id = target_loan_record_id
    for update of o
  loop
    trigger_on := case linked.trigger_type
      when 'Annual review' then target_loan.next_review_date
      else target_loan.fixed_rate_expiry_date end;
    if linked.trigger_date is distinct from trigger_on
       and linked.lifecycle_status in ('Upcoming','Due','Overdue') then
      update public.opportunities o set
        lifecycle_status = 'Dismissed',
        dismissal_reason = 'Superseded by loan trigger-date update',
        completed_at = null,
        updated_at = transaction_timestamp(),
        version = o.version + 1
      where o.organisation_id = target_organisation_id
        and o.id = linked.opportunity_id;
      insert into public.activity_events(
        organisation_id, entity_type, entity_id, event_type, summary,
        actor_membership_id, occurred_at, details
      ) values (
        target_organisation_id, 'mortgage.household', target_loan.household_id,
        'opportunity.superseded', 'Review opportunity superseded by a loan trigger-date update',
        target_actor_membership_id, transaction_timestamp(),
        jsonb_build_object(
          'householdId', target_loan.household_id,
          'loanRecordId', target_loan_record_id,
          'opportunityId', linked.opportunity_id,
          'triggerType', linked.trigger_type,
          'previousTriggerDate', linked.trigger_date,
          'newTriggerDate', trigger_on,
          'reason', 'Superseded by loan trigger-date update',
          'previousVersion', linked.version,
          'newVersion', linked.version + 1
        )
      );
      superseded := superseded + 1;
    end if;
  end loop;

  if target_loan.status <> 'Discharged'
     and target_household.status = 'Active' then
    for trigger_kind, trigger_on in
      select * from (values
        ('Annual review'::text, target_loan.next_review_date),
        ('Fixed-rate expiry'::text, target_loan.fixed_rate_expiry_date)
      ) v(kind, trigger_date)
      where trigger_date is not null
        and ((kind = 'Annual review' and trigger_date <= business_date + 30)
          or (kind = 'Fixed-rate expiry' and trigger_date <= business_date + 90))
    loop
      if not exists (
        select 1 from public.mortgage_review_opportunities r
        where r.organisation_id = target_organisation_id
          and r.loan_record_id = target_loan_record_id
          and r.trigger_type = trigger_kind
          and r.trigger_date = trigger_on
      ) then
        opportunity_id := gen_random_uuid();
        insert into public.opportunities(
          id, organisation_id, opportunity_type, lifecycle_status, trigger_date,
          subject_type, subject_id, owner_membership_id, created_at, updated_at, version
        ) values (
          opportunity_id, target_organisation_id, trigger_kind,
          private.mortgage_review_effective_status(trigger_kind, trigger_on, 'Upcoming', business_date),
          trigger_on, 'mortgage.household', target_loan.household_id, null,
          transaction_timestamp(), transaction_timestamp(), 1
        );
        insert into public.mortgage_review_opportunities(
          organisation_id, opportunity_id, household_id, loan_record_id,
          trigger_type, trigger_date
        ) values (
          target_organisation_id, opportunity_id, target_loan.household_id,
          target_loan_record_id, trigger_kind, trigger_on
        );
        insert into public.activity_events(
          organisation_id, entity_type, entity_id, event_type, summary,
          actor_membership_id, occurred_at, details
        ) values (
          target_organisation_id, 'mortgage.household', target_loan.household_id,
          'opportunity.generated', 'Review opportunity generated',
          target_actor_membership_id, transaction_timestamp(),
          jsonb_build_object(
            'householdId', target_loan.household_id,
            'loanRecordId', target_loan_record_id,
            'opportunityId', opportunity_id,
            'triggerType', trigger_kind,
            'triggerDate', trigger_on,
            'reason', target_reason,
            'ownerMembershipId', null,
            'version', 1
          )
        );
        generated := generated + 1;
      end if;
    end loop;
  end if;
  return jsonb_build_object('generated', generated, 'superseded', superseded);
end
$$;

revoke all on function private.reconcile_mortgage_review_opportunities(uuid,uuid,uuid,text)
  from public, anon, authenticated;

-- Conversion already inserts a minimal loan atomically. This trigger makes that
-- path and every future guarded loan-creation path use the same generator.
create or replace function private.reconcile_inserted_mortgage_loan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare actor_membership uuid;
begin
  actor_membership := private.current_membership_id(new.organisation_id);
  perform private.reconcile_mortgage_review_opportunities(
    new.organisation_id, new.id, actor_membership, 'Loan record created'
  );
  return new;
end
$$;

revoke all on function private.reconcile_inserted_mortgage_loan()
  from public, anon, authenticated;
drop trigger if exists reconcile_inserted_mortgage_loan on public.mortgage_minimal_loan_records;
create trigger reconcile_inserted_mortgage_loan
after insert on public.mortgage_minimal_loan_records
for each row execute function private.reconcile_inserted_mortgage_loan();

create or replace function public.add_mortgage_minimal_loan_record(
  organisation_id uuid,
  command_id uuid,
  household_id uuid,
  external_reference text,
  lender_name text,
  loan_purpose text,
  settlement_date date,
  fixed_rate_expiry_date date,
  last_review_date date,
  next_review_date date,
  loan_status text,
  source text,
  data_confidence text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_membership uuid;
  previous_result jsonb;
  target_household public.mortgage_households%rowtype;
  loan_id uuid := gen_random_uuid();
  result jsonb;
begin
  actor_membership := private.require_operation_actor(organisation_id, 'mortgage.loan-record.manage');
  previous_result := private.begin_operation_command_checked(
    organisation_id, command_id, 'mortgage.loan-create', actor_membership,
    jsonb_build_object('householdId', household_id, 'externalReference', external_reference,
      'lenderName', lender_name, 'loanPurpose', loan_purpose, 'settlementDate', settlement_date,
      'fixedRateExpiryDate', fixed_rate_expiry_date, 'lastReviewDate', last_review_date,
      'nextReviewDate', next_review_date, 'status', loan_status, 'source', source,
      'dataConfidence', data_confidence)
  );
  if previous_result is not null then return previous_result; end if;

  select * into target_household from public.mortgage_households h
  where h.organisation_id = organisation_id and h.id = household_id for update;
  if not found then raise exception 'HOUSEHOLD_NOT_FOUND' using errcode = 'P0002'; end if;
  if target_household.status <> 'Active' then raise exception 'ACTIVE_HOUSEHOLD_REQUIRED' using errcode = '22023'; end if;
  if not private.has_capability(organisation_id, 'mortgage.household.assign')
     and target_household.owner_membership_id <> actor_membership then
    raise exception 'HOUSEHOLD_OWNERSHIP_REQUIRED' using errcode = '42501';
  end if;
  if nullif(btrim(lender_name), '') is null
     or loan_purpose not in ('Purchase','Refinance','Investment purchase','Construction loan','Asset finance','Commercial finance','Other')
     or loan_status not in ('Active','Discharged','Unknown')
     or source not in ('Lead conversion','Manual entry','Imported fixture')
     or data_confidence not in ('Confirmed','Unverified') then
    raise exception 'VALID_MINIMAL_LOAN_REQUIRED' using errcode = '22023';
  end if;

  insert into public.mortgage_minimal_loan_records(
    id, organisation_id, household_id, owner_membership_id, external_reference,
    lender_name, loan_purpose, settlement_date, fixed_rate_expiry_date,
    last_review_date, next_review_date, status, source, data_confidence,
    created_at, updated_at, version
  ) values (
    loan_id, organisation_id, household_id, target_household.owner_membership_id,
    nullif(btrim(external_reference), ''), btrim(lender_name), loan_purpose,
    settlement_date, fixed_rate_expiry_date, last_review_date, next_review_date,
    loan_status, source, data_confidence, transaction_timestamp(), transaction_timestamp(), 1
  );
  insert into public.activity_events(
    organisation_id, entity_type, entity_id, event_type, summary,
    actor_membership_id, occurred_at, details
  ) values (
    organisation_id, 'mortgage.household', household_id, 'loan.created',
    'Retention-only loan record created', actor_membership, transaction_timestamp(),
    jsonb_build_object('householdId', household_id, 'loanRecordId', loan_id,
      'ownerMembershipId', target_household.owner_membership_id, 'version', 1)
  );
  result := jsonb_build_object('loanRecordId', loan_id, 'householdId', household_id, 'version', 1);
  return private.finish_operation_command(organisation_id, command_id, result);
end
$$;

create or replace function public.update_mortgage_loan_review_dates(
  organisation_id uuid,
  command_id uuid,
  loan_record_id uuid,
  expected_version integer,
  next_review_date date,
  fixed_rate_expiry_date date,
  last_review_date date
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_membership uuid;
  previous_result jsonb;
  target_loan public.mortgage_minimal_loan_records%rowtype;
  target_household public.mortgage_households%rowtype;
  reconciliation jsonb;
  result jsonb;
begin
  actor_membership := private.require_operation_actor(organisation_id, 'mortgage.loan-record.manage');
  previous_result := private.begin_operation_command_checked(
    organisation_id, command_id, 'mortgage.loan-review-dates-update', actor_membership,
    jsonb_build_object('loanRecordId', loan_record_id, 'expectedVersion', expected_version,
      'nextReviewDate', next_review_date, 'fixedRateExpiryDate', fixed_rate_expiry_date,
      'lastReviewDate', last_review_date)
  );
  if previous_result is not null then return previous_result; end if;

  select * into target_loan from public.mortgage_minimal_loan_records l
  where l.organisation_id = organisation_id and l.id = loan_record_id for update;
  if not found then raise exception 'LOAN_RECORD_NOT_FOUND' using errcode = 'P0002'; end if;
  if target_loan.version <> expected_version then raise exception 'STALE_LOAN_VERSION' using errcode = '40001'; end if;
  select * into target_household from public.mortgage_households h
  where h.organisation_id = organisation_id and h.id = target_loan.household_id for update;
  if not found then raise exception 'HOUSEHOLD_NOT_FOUND' using errcode = 'P0002'; end if;
  if not private.has_capability(organisation_id, 'mortgage.household.assign')
     and target_household.owner_membership_id <> actor_membership then
    raise exception 'HOUSEHOLD_OWNERSHIP_REQUIRED' using errcode = '42501';
  end if;
  if exists (
    select 1 from public.mortgage_review_opportunities r
    join public.opportunities o on o.organisation_id = r.organisation_id and o.id = r.opportunity_id
    where r.organisation_id = organisation_id and r.loan_record_id = loan_record_id
      and o.lifecycle_status = 'Review booked'
      and ((r.trigger_type = 'Annual review' and r.trigger_date is distinct from next_review_date)
        or (r.trigger_type = 'Fixed-rate expiry' and r.trigger_date is distinct from fixed_rate_expiry_date))
  ) then raise exception 'REVIEW_BOOKED_DATE_CHANGE_BLOCKED' using errcode = '55000'; end if;

  update public.mortgage_minimal_loan_records l set
    next_review_date = update_mortgage_loan_review_dates.next_review_date,
    fixed_rate_expiry_date = update_mortgage_loan_review_dates.fixed_rate_expiry_date,
    last_review_date = update_mortgage_loan_review_dates.last_review_date,
    updated_at = transaction_timestamp(), version = l.version + 1
  where l.organisation_id = organisation_id and l.id = loan_record_id;
  reconciliation := private.reconcile_mortgage_review_opportunities(
    organisation_id, loan_record_id, actor_membership, 'Loan trigger dates changed'
  );
  insert into public.activity_events(
    organisation_id, entity_type, entity_id, event_type, summary,
    actor_membership_id, occurred_at, details
  ) values (
    organisation_id, 'mortgage.household', target_loan.household_id,
    'loan.review_dates_changed', 'Loan review-trigger dates changed',
    actor_membership, transaction_timestamp(),
    jsonb_build_object('householdId', target_loan.household_id, 'loanRecordId', loan_record_id,
      'previous', jsonb_build_object('nextReviewDate', target_loan.next_review_date,
        'fixedRateExpiryDate', target_loan.fixed_rate_expiry_date,
        'lastReviewDate', target_loan.last_review_date, 'version', target_loan.version),
      'new', jsonb_build_object('nextReviewDate', next_review_date,
        'fixedRateExpiryDate', fixed_rate_expiry_date,
        'lastReviewDate', last_review_date, 'version', target_loan.version + 1),
      'reconciliation', reconciliation)
  );
  result := jsonb_build_object('loanRecordId', loan_record_id,
    'householdId', target_loan.household_id, 'version', target_loan.version + 1,
    'reconciliation', reconciliation);
  return private.finish_operation_command(organisation_id, command_id, result);
end
$$;

create or replace function public.claim_mortgage_review_opportunity(
  organisation_id uuid,
  command_id uuid,
  opportunity_id uuid,
  expected_version integer
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare actor_membership uuid; previous_result jsonb; target public.opportunities%rowtype; household_id uuid; result jsonb;
begin
  actor_membership := private.require_operation_actor(organisation_id, 'mortgage.review-opportunity.manage');
  previous_result := private.begin_operation_command_checked(organisation_id, command_id,
    'mortgage.review-opportunity-claim', actor_membership,
    jsonb_build_object('opportunityId', opportunity_id, 'expectedVersion', expected_version));
  if previous_result is not null then return previous_result; end if;
  select o.* into target
  from public.opportunities o join public.mortgage_review_opportunities r
    on r.organisation_id = o.organisation_id and r.opportunity_id = o.id
  where o.organisation_id = organisation_id and o.id = opportunity_id for update of o;
  if not found then raise exception 'REVIEW_OPPORTUNITY_NOT_FOUND' using errcode = 'P0002'; end if;
  select r.household_id into household_id from public.mortgage_review_opportunities r
  where r.organisation_id=organisation_id and r.opportunity_id=opportunity_id;
  if target.version <> expected_version then raise exception 'STALE_OPPORTUNITY_VERSION' using errcode = '40001'; end if;
  if target.owner_membership_id is not null then raise exception 'OPPORTUNITY_ALREADY_ASSIGNED' using errcode = '55000'; end if;
  if target.lifecycle_status in ('Completed','Dismissed') then raise exception 'OPEN_OPPORTUNITY_REQUIRED' using errcode = '55000'; end if;
  update public.opportunities o set owner_membership_id = actor_membership,
    updated_at = transaction_timestamp(), version = o.version + 1
  where o.organisation_id = organisation_id and o.id = opportunity_id;
  insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,actor_membership_id,occurred_at,details)
  values(organisation_id,'mortgage.household',household_id,'opportunity.claimed','Review opportunity claimed',actor_membership,transaction_timestamp(),
    jsonb_build_object('householdId',household_id,'opportunityId',opportunity_id,'previousOwnerMembershipId',null,'newOwnerMembershipId',actor_membership,'previousVersion',target.version,'newVersion',target.version+1));
  result := jsonb_build_object('opportunityId',opportunity_id,'householdId',household_id,'ownerMembershipId',actor_membership,'version',target.version+1);
  return private.finish_operation_command(organisation_id,command_id,result);
end
$$;

create or replace function public.assign_mortgage_review_opportunity(
  organisation_id uuid,
  command_id uuid,
  opportunity_id uuid,
  expected_version integer,
  target_membership_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare actor_membership uuid; previous_result jsonb; target public.opportunities%rowtype; household_id uuid; result jsonb;
begin
  actor_membership := private.require_operation_actor(organisation_id, 'mortgage.household.assign');
  previous_result := private.begin_operation_command_checked(organisation_id,command_id,
    'mortgage.review-opportunity-assign',actor_membership,
    jsonb_build_object('opportunityId',opportunity_id,'expectedVersion',expected_version,'targetMembershipId',target_membership_id));
  if previous_result is not null then return previous_result; end if;
  if not exists(select 1 from public.organisation_memberships m
    join public.mortgage_membership_profiles p on p.organisation_id=m.organisation_id and p.membership_id=m.id
    where m.organisation_id=organisation_id and m.id=target_membership_id and m.status='Active' and p.position='Broker') then
    raise exception 'ACTIVE_BROKER_ASSIGNEE_REQUIRED' using errcode='23503';
  end if;
  select o.* into target from public.opportunities o
  join public.mortgage_review_opportunities r on r.organisation_id=o.organisation_id and r.opportunity_id=o.id
  where o.organisation_id=organisation_id and o.id=opportunity_id for update of o;
  if not found then raise exception 'REVIEW_OPPORTUNITY_NOT_FOUND' using errcode='P0002'; end if;
  select r.household_id into household_id from public.mortgage_review_opportunities r
  where r.organisation_id=organisation_id and r.opportunity_id=opportunity_id;
  if target.version<>expected_version then raise exception 'STALE_OPPORTUNITY_VERSION' using errcode='40001'; end if;
  if target.lifecycle_status='Completed' then raise exception 'COMPLETED_OPPORTUNITY_TERMINAL' using errcode='55000'; end if;
  update public.opportunities o set owner_membership_id=target_membership_id,updated_at=transaction_timestamp(),version=o.version+1
  where o.organisation_id=organisation_id and o.id=opportunity_id;
  insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,actor_membership_id,occurred_at,details)
  values(organisation_id,'mortgage.household',household_id,'opportunity.assigned','Review opportunity assigned',actor_membership,transaction_timestamp(),
    jsonb_build_object('householdId',household_id,'opportunityId',opportunity_id,'previousOwnerMembershipId',target.owner_membership_id,'newOwnerMembershipId',target_membership_id,'previousVersion',target.version,'newVersion',target.version+1));
  result:=jsonb_build_object('opportunityId',opportunity_id,'householdId',household_id,'ownerMembershipId',target_membership_id,'version',target.version+1);
  return private.finish_operation_command(organisation_id,command_id,result);
end
$$;

create or replace function public.transition_mortgage_review_opportunity(
  organisation_id uuid,
  command_id uuid,
  opportunity_id uuid,
  expected_version integer,
  target_status text,
  dismissal_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_membership uuid; previous_result jsonb; target public.opportunities%rowtype;
  review_link public.mortgage_review_opportunities%rowtype; business_date date := (transaction_timestamp() at time zone 'Australia/Sydney')::date;
  next_status text; result jsonb;
begin
  actor_membership:=private.require_operation_actor(organisation_id,'mortgage.review-opportunity.manage');
  previous_result:=private.begin_operation_command_checked(organisation_id,command_id,
    'mortgage.review-opportunity-transition',actor_membership,
    jsonb_build_object('opportunityId',opportunity_id,'expectedVersion',expected_version,'targetStatus',target_status,'dismissalReason',dismissal_reason));
  if previous_result is not null then return previous_result; end if;
  select o.* into target from public.opportunities o
  join public.mortgage_review_opportunities r on r.organisation_id=o.organisation_id and r.opportunity_id=o.id
  where o.organisation_id=organisation_id and o.id=opportunity_id for update of o;
  if not found then raise exception 'REVIEW_OPPORTUNITY_NOT_FOUND' using errcode='P0002'; end if;
  select r.* into review_link from public.mortgage_review_opportunities r
  where r.organisation_id=organisation_id and r.opportunity_id=opportunity_id;
  if target.version<>expected_version then raise exception 'STALE_OPPORTUNITY_VERSION' using errcode='40001'; end if;
  if not private.has_capability(organisation_id,'mortgage.household.assign')
     and target.owner_membership_id is distinct from actor_membership then
    raise exception 'OPPORTUNITY_OWNERSHIP_REQUIRED' using errcode='42501';
  end if;
  if target.lifecycle_status='Completed' then raise exception 'COMPLETED_OPPORTUNITY_TERMINAL' using errcode='55000'; end if;
  if target_status='Reopen' then
    if target.lifecycle_status<>'Dismissed' then raise exception 'DISMISSED_OPPORTUNITY_REQUIRED' using errcode='55000'; end if;
    next_status:=private.mortgage_review_effective_status(review_link.trigger_type,review_link.trigger_date,'Upcoming',business_date);
  elsif target_status in ('Review booked','Completed','Dismissed') then
    if target.lifecycle_status='Dismissed' then raise exception 'REOPEN_DISMISSED_OPPORTUNITY_FIRST' using errcode='55000'; end if;
    next_status:=target_status;
  else raise exception 'VALID_OPPORTUNITY_TRANSITION_REQUIRED' using errcode='22023'; end if;
  if next_status='Dismissed' and nullif(btrim(dismissal_reason),'') is null then
    raise exception 'DISMISSAL_REASON_REQUIRED' using errcode='22023';
  end if;
  update public.opportunities o set lifecycle_status=next_status,
    dismissal_reason=case when next_status='Dismissed' then btrim(dismissal_reason) else null end,
    completed_at=case when next_status='Completed' then transaction_timestamp() else null end,
    updated_at=transaction_timestamp(),version=o.version+1
  where o.organisation_id=organisation_id and o.id=opportunity_id;
  insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,actor_membership_id,occurred_at,details)
  values(organisation_id,'mortgage.household',review_link.household_id,'opportunity.status_changed','Review opportunity status changed',actor_membership,transaction_timestamp(),
    jsonb_strip_nulls(jsonb_build_object('householdId',review_link.household_id,'loanRecordId',review_link.loan_record_id,'opportunityId',opportunity_id,
      'previousStatus',target.lifecycle_status,'newStatus',next_status,'reason',case when next_status='Dismissed' then btrim(dismissal_reason) end,
      'previousVersion',target.version,'newVersion',target.version+1)));
  result:=jsonb_build_object('opportunityId',opportunity_id,'householdId',review_link.household_id,'status',next_status,'version',target.version+1);
  return private.finish_operation_command(organisation_id,command_id,result);
end
$$;

create or replace function public.create_mortgage_household_task(
  organisation_id uuid,
  command_id uuid,
  household_id uuid,
  title text,
  due_at timestamptz,
  priority text,
  assigned_membership_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare actor_membership uuid; previous_result jsonb; target_household public.mortgage_households%rowtype; task_id uuid:=gen_random_uuid(); result jsonb;
begin
  actor_membership:=private.require_operation_actor(organisation_id,'task.create');
  if not private.has_capability(organisation_id,'mortgage.household.update') then raise exception 'CAPABILITY_REQUIRED:mortgage.household.update' using errcode='42501'; end if;
  previous_result:=private.begin_operation_command_checked(organisation_id,command_id,'mortgage.household-task-create',actor_membership,
    jsonb_build_object('householdId',household_id,'title',title,'dueAt',due_at,'priority',priority,'assignedMembershipId',assigned_membership_id));
  if previous_result is not null then return previous_result; end if;
  select * into target_household from public.mortgage_households h where h.organisation_id=organisation_id and h.id=household_id for update;
  if not found then raise exception 'HOUSEHOLD_NOT_FOUND' using errcode='P0002'; end if;
  if not private.has_capability(organisation_id,'mortgage.household.assign') and target_household.owner_membership_id<>actor_membership then
    raise exception 'HOUSEHOLD_OWNERSHIP_REQUIRED' using errcode='42501';
  end if;
  if nullif(btrim(title),'') is null or due_at is null or priority not in ('Normal','High') then raise exception 'VALID_TASK_REQUIRED' using errcode='22023'; end if;
  if not exists(select 1 from public.organisation_memberships m where m.organisation_id=organisation_id and m.id=assigned_membership_id and m.status='Active') then
    raise exception 'ACTIVE_TASK_ASSIGNEE_REQUIRED' using errcode='23503';
  end if;
  insert into public.tasks(id,organisation_id,household_id,assigned_membership_id,created_by_membership_id,title,due_at,priority,status,created_at)
  values(task_id,organisation_id,household_id,assigned_membership_id,actor_membership,btrim(title),due_at,priority,'Open',transaction_timestamp());
  insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,actor_membership_id,occurred_at,details)
  values(organisation_id,'mortgage.household',household_id,'task.created','Household follow-up task created',actor_membership,transaction_timestamp(),
    jsonb_build_object('householdId',household_id,'taskId',task_id,'assignedMembershipId',assigned_membership_id,'dueAt',due_at,'priority',priority));
  result:=jsonb_build_object('taskId',task_id,'householdId',household_id);
  return private.finish_operation_command(organisation_id,command_id,result);
end
$$;

create or replace function public.list_mortgage_household_review_opportunities(
  p_organisation_id uuid,
  p_household_id uuid
) returns table(
  opportunity_id uuid,
  loan_record_id uuid,
  trigger_type text,
  trigger_date date,
  effective_status text,
  owner_membership_id uuid,
  owner_name text,
  version integer,
  completed_at timestamptz,
  dismissal_reason text
)
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select private.require_operation_actor(p_organisation_id,'mortgage.review-opportunity.view') membership_id
  )
  select o.id, r.loan_record_id, r.trigger_type, r.trigger_date,
    private.mortgage_review_effective_status(r.trigger_type,r.trigger_date,o.lifecycle_status,
      (transaction_timestamp() at time zone 'Australia/Sydney')::date),
    o.owner_membership_id, m.display_name, o.version, o.completed_at, o.dismissal_reason
  from public.mortgage_review_opportunities r cross join actor
  join public.opportunities o on o.organisation_id=r.organisation_id and o.id=r.opportunity_id
  left join public.organisation_memberships m on m.organisation_id=o.organisation_id and m.id=o.owner_membership_id
  where r.organisation_id=p_organisation_id and r.household_id=p_household_id
  order by r.trigger_date, r.trigger_type, o.id
$$;

create or replace function public.read_mortgage_retention_today(
  p_organisation_id uuid,
  p_limit integer default 25
) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with actor as (
    select private.require_operation_actor(p_organisation_id,'mortgage.review-opportunity.view') membership_id
  ), settings as (
    select (transaction_timestamp() at time zone 'Australia/Sydney')::date business_date,
      greatest(1,least(coalesce(p_limit,25),100)) queue_limit
  ), rows as (
    select o.id opportunity_id,r.household_id,h.display_name household_name,r.trigger_type,r.trigger_date,
      private.mortgage_review_effective_status(r.trigger_type,r.trigger_date,o.lifecycle_status,s.business_date) effective_status,
      o.owner_membership_id,m.display_name owner_name,o.version,
      r.trigger_type='Annual review' and r.trigger_date<=s.business_date+7 annual_due,
      r.trigger_type='Fixed-rate expiry' and r.trigger_date<=s.business_date+90 fixed_approaching,
      o.owner_membership_id is null unassigned
    from public.mortgage_review_opportunities r
    join public.opportunities o on o.organisation_id=r.organisation_id and o.id=r.opportunity_id
    join public.mortgage_households h on h.organisation_id=r.organisation_id and h.id=r.household_id
    left join public.organisation_memberships m on m.organisation_id=o.organisation_id and m.id=o.owner_membership_id
    cross join settings s cross join actor
    where r.organisation_id=p_organisation_id and o.lifecycle_status not in ('Completed','Dismissed')
      and h.status='Active'
      and ((r.trigger_type='Annual review' and r.trigger_date<=s.business_date+30)
        or (r.trigger_type='Fixed-rate expiry' and r.trigger_date<=s.business_date+90))
  ), annual_rows as (
    select * from rows where annual_due order by trigger_date,opportunity_id limit (select queue_limit from settings)
  ), fixed_rows as (
    select * from rows where fixed_approaching order by trigger_date,opportunity_id limit (select queue_limit from settings)
  ), unassigned_rows as (
    select * from rows where unassigned order by trigger_date,opportunity_id limit (select queue_limit from settings)
  )
  select jsonb_build_object(
    'businessDate',(select business_date from settings),
    'annualDueTotal',(select count(*) from rows where annual_due),
    'fixedApproachingTotal',(select count(*) from rows where fixed_approaching),
    'unassignedTotal',(select count(*) from rows where unassigned),
    'annualDue',(select coalesce(jsonb_agg(jsonb_build_object('opportunityId',opportunity_id,'householdId',household_id,'householdName',household_name,'triggerType',trigger_type,'triggerDate',trigger_date,'effectiveStatus',effective_status,'ownerMembershipId',owner_membership_id,'ownerName',owner_name,'version',version) order by trigger_date,opportunity_id),'[]'::jsonb) from annual_rows),
    'fixedApproaching',(select coalesce(jsonb_agg(jsonb_build_object('opportunityId',opportunity_id,'householdId',household_id,'householdName',household_name,'triggerType',trigger_type,'triggerDate',trigger_date,'effectiveStatus',effective_status,'ownerMembershipId',owner_membership_id,'ownerName',owner_name,'version',version) order by trigger_date,opportunity_id),'[]'::jsonb) from fixed_rows),
    'unassigned',(select coalesce(jsonb_agg(jsonb_build_object('opportunityId',opportunity_id,'householdId',household_id,'householdName',household_name,'triggerType',trigger_type,'triggerDate',trigger_date,'effectiveStatus',effective_status,'ownerMembershipId',owner_membership_id,'ownerName',owner_name,'version',version) order by trigger_date,opportunity_id),'[]'::jsonb) from unassigned_rows)
  )
$$;

revoke all on function public.add_mortgage_minimal_loan_record(uuid,uuid,uuid,text,text,text,date,date,date,date,text,text,text) from public,anon;
grant execute on function public.add_mortgage_minimal_loan_record(uuid,uuid,uuid,text,text,text,date,date,date,date,text,text,text) to authenticated;
revoke all on function public.update_mortgage_loan_review_dates(uuid,uuid,uuid,integer,date,date,date) from public,anon;
grant execute on function public.update_mortgage_loan_review_dates(uuid,uuid,uuid,integer,date,date,date) to authenticated;
revoke all on function public.claim_mortgage_review_opportunity(uuid,uuid,uuid,integer) from public,anon;
grant execute on function public.claim_mortgage_review_opportunity(uuid,uuid,uuid,integer) to authenticated;
revoke all on function public.assign_mortgage_review_opportunity(uuid,uuid,uuid,integer,uuid) from public,anon;
grant execute on function public.assign_mortgage_review_opportunity(uuid,uuid,uuid,integer,uuid) to authenticated;
revoke all on function public.transition_mortgage_review_opportunity(uuid,uuid,uuid,integer,text,text) from public,anon;
grant execute on function public.transition_mortgage_review_opportunity(uuid,uuid,uuid,integer,text,text) to authenticated;
revoke all on function public.create_mortgage_household_task(uuid,uuid,uuid,text,timestamptz,text,uuid) from public,anon;
grant execute on function public.create_mortgage_household_task(uuid,uuid,uuid,text,timestamptz,text,uuid) to authenticated;
revoke all on function public.list_mortgage_household_review_opportunities(uuid,uuid) from public,anon;
grant execute on function public.list_mortgage_household_review_opportunities(uuid,uuid) to authenticated;
revoke all on function public.read_mortgage_retention_today(uuid,integer) from public,anon;
grant execute on function public.read_mortgage_retention_today(uuid,integer) to authenticated;
