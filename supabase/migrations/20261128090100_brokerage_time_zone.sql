-- Milestone 4F.3 (b): brokerage time zone, defaulting to Australia/Sydney.
-- Business dates for retention reviews now use the brokerage's zone instead of a hard-coded one.

alter table public.organisations add column time_zone text not null default 'Australia/Sydney';

create or replace function private.validate_organisation_time_zone() returns trigger
language plpgsql set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names z where z.name = new.time_zone) then
    raise exception 'VALID_TIME_ZONE_REQUIRED' using errcode = '22023';
  end if;
  return new;
end
$$;
revoke all on function private.validate_organisation_time_zone() from public, anon, authenticated;
create trigger validate_organisation_time_zone before insert or update of time_zone on public.organisations
  for each row execute function private.validate_organisation_time_zone();

-- The brokerage's current calendar date. Used by every retention business-date calculation.
create or replace function private.organisation_business_date(target_organisation_id uuid) returns date
language sql stable security definer set search_path = '' as $$
  select (transaction_timestamp() at time zone coalesce(
    (select o.time_zone from public.organisations o where o.id = target_organisation_id), 'Australia/Sydney'))::date
$$;
revoke all on function private.organisation_business_date(uuid) from public, anon, authenticated;

-- Read the active brokerage's zone for server-side input parsing and display. Membership-scoped by RLS on organisations.
create or replace function public.organisation_time_zone(p_organisation_id uuid) returns text
language sql stable security invoker set search_path = '' as $$
  select o.time_zone from public.organisations o where o.id = p_organisation_id
$$;
revoke all on function public.organisation_time_zone(uuid) from public, anon;
grant execute on function public.organisation_time_zone(uuid) to authenticated;

-- The functions below are the latest definitions, unchanged except for the business-date expression.

-- private.reconcile_mortgage_review_opportunities: latest definition from 20261117053604_persistent_retention_review_operations.sql
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
  business_date date := private.organisation_business_date(target_organisation_id);
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

-- public.list_mortgage_household_review_opportunities: latest definition from 20261117053604_persistent_retention_review_operations.sql
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
      private.organisation_business_date(p_organisation_id)),
    o.owner_membership_id, m.display_name, o.version, o.completed_at, o.dismissal_reason
  from public.mortgage_review_opportunities r cross join actor
  join public.opportunities o on o.organisation_id=r.organisation_id and o.id=r.opportunity_id
  left join public.organisation_memberships m on m.organisation_id=o.organisation_id and m.id=o.owner_membership_id
  where r.organisation_id=p_organisation_id and r.household_id=p_household_id
  order by r.trigger_date, r.trigger_type, o.id
$$;

-- public.read_mortgage_retention_today: latest definition from 20261117132839_retention_lifecycle_schema_consolidation.sql
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
    select private.organisation_business_date(p_organisation_id) business_date,
      greatest(1,least(coalesce(p_limit,25),100)) queue_limit
  ), classified as (
    select o.id opportunity_id,r.household_id,h.display_name household_name,
      r.trigger_type,r.trigger_date,
      private.mortgage_review_effective_status(
        r.trigger_type,r.trigger_date,o.lifecycle_status,s.business_date
      ) effective_status,
      o.owner_membership_id,m.display_name owner_name,o.version
    from public.mortgage_review_opportunities r
    join public.opportunities o
      on o.organisation_id=r.organisation_id and o.id=r.opportunity_id
    join public.mortgage_households h
      on h.organisation_id=r.organisation_id and h.id=r.household_id
    left join public.organisation_memberships m
      on m.organisation_id=o.organisation_id and m.id=o.owner_membership_id
    cross join settings s cross join actor
    where r.organisation_id=p_organisation_id
      and h.status='Active'
      and ((r.trigger_type='Annual review' and r.trigger_date<=s.business_date+30)
        or (r.trigger_type='Fixed-rate expiry' and r.trigger_date<=s.business_date+90))
  ), rows as (
    select *,
      trigger_type='Annual review' and effective_status in ('Due','Overdue') annual_due,
      trigger_type='Fixed-rate expiry'
        and effective_status in ('Upcoming','Due','Overdue') fixed_approaching,
      owner_membership_id is null
        and effective_status in ('Upcoming','Due','Overdue') unassigned
    from classified
  ), annual_rows as (
    select * from rows where annual_due
    order by trigger_date,opportunity_id limit (select queue_limit from settings)
  ), fixed_rows as (
    select * from rows where fixed_approaching
    order by trigger_date,opportunity_id limit (select queue_limit from settings)
  ), unassigned_rows as (
    select * from rows where unassigned
    order by trigger_date,opportunity_id limit (select queue_limit from settings)
  )
  select jsonb_build_object(
    'businessDate',(select business_date from settings),
    'annualDueTotal',(select count(*) from rows where annual_due),
    'fixedApproachingTotal',(select count(*) from rows where fixed_approaching),
    'unassignedTotal',(select count(*) from rows where unassigned),
    'annualDue',(select coalesce(jsonb_agg(jsonb_build_object(
      'opportunityId',opportunity_id,'householdId',household_id,
      'householdName',household_name,'triggerType',trigger_type,
      'triggerDate',trigger_date,'effectiveStatus',effective_status,
      'ownerMembershipId',owner_membership_id,'ownerName',owner_name,'version',version
    ) order by trigger_date,opportunity_id),'[]'::jsonb) from annual_rows),
    'fixedApproaching',(select coalesce(jsonb_agg(jsonb_build_object(
      'opportunityId',opportunity_id,'householdId',household_id,
      'householdName',household_name,'triggerType',trigger_type,
      'triggerDate',trigger_date,'effectiveStatus',effective_status,
      'ownerMembershipId',owner_membership_id,'ownerName',owner_name,'version',version
    ) order by trigger_date,opportunity_id),'[]'::jsonb) from fixed_rows),
    'unassigned',(select coalesce(jsonb_agg(jsonb_build_object(
      'opportunityId',opportunity_id,'householdId',household_id,
      'householdName',household_name,'triggerType',trigger_type,
      'triggerDate',trigger_date,'effectiveStatus',effective_status,
      'ownerMembershipId',owner_membership_id,'ownerName',owner_name,'version',version
    ) order by trigger_date,opportunity_id),'[]'::jsonb) from unassigned_rows)
  )
$$;

-- public.transition_mortgage_review_opportunity: latest definition from 20261118073521_harden_client_book_authorization_and_query_boundaries.sql
create or replace function public.transition_mortgage_review_opportunity(
  organisation_id uuid,command_id uuid,opportunity_id uuid,expected_version integer,
  target_status text,dismissal_reason text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
  actor_membership uuid; previous_result jsonb; target public.opportunities%rowtype;
  review_link public.mortgage_review_opportunities%rowtype; household public.mortgage_households%rowtype;
  business_date date:=private.organisation_business_date(organisation_id);
  next_status text; result jsonb;
begin
  actor_membership:=private.require_operation_actor(organisation_id,'mortgage.review-opportunity.manage');
  previous_result:=private.begin_operation_command_checked(organisation_id,command_id,
    'mortgage.review-opportunity-transition',actor_membership,
    jsonb_build_object('opportunityId',opportunity_id,'expectedVersion',expected_version,
      'targetStatus',target_status,'dismissalReason',dismissal_reason));
  if previous_result is not null then return previous_result; end if;
  select o.* into target from public.opportunities o
  join public.mortgage_review_opportunities r
    on r.organisation_id=o.organisation_id and r.opportunity_id=o.id
  where o.organisation_id=organisation_id and o.id=opportunity_id for update of o;
  if not found then raise exception 'REVIEW_OPPORTUNITY_NOT_FOUND' using errcode='P0002'; end if;
  select r.* into review_link from public.mortgage_review_opportunities r
  where r.organisation_id=organisation_id and r.opportunity_id=opportunity_id;
  select h.* into household from public.mortgage_households h
  where h.organisation_id=organisation_id and h.id=review_link.household_id for update;
  if not found then raise exception 'HOUSEHOLD_NOT_FOUND' using errcode='P0002'; end if;
  if target.version<>expected_version then raise exception 'STALE_OPPORTUNITY_VERSION' using errcode='40001'; end if;
  if not private.has_capability(organisation_id,'mortgage.household.assign')
     and target.owner_membership_id is distinct from actor_membership then
    raise exception 'OPPORTUNITY_OWNERSHIP_REQUIRED' using errcode='42501'; end if;
  if target.lifecycle_status='Completed' then
    raise exception 'COMPLETED_OPPORTUNITY_TERMINAL' using errcode='55000'; end if;
  if target_status=target.lifecycle_status then
    raise exception 'OPPORTUNITY_NO_OP_TRANSITION' using errcode='55000'; end if;

  if target.lifecycle_status='Dismissed' then
    if target_status<>'Reopen' then
      raise exception 'DISMISSED_OPPORTUNITY_REOPEN_REQUIRED' using errcode='55000'; end if;
    if household.status<>'Active' then raise exception 'ACTIVE_HOUSEHOLD_REQUIRED' using errcode='55000'; end if;
    next_status:=private.mortgage_review_effective_status(
      review_link.trigger_type,review_link.trigger_date,'Upcoming',business_date);
  elsif target_status='Reopen' then
    raise exception 'DISMISSED_OPPORTUNITY_REQUIRED' using errcode='55000';
  elsif target.lifecycle_status in ('Upcoming','Due','Overdue')
        and target_status in ('Review booked','Completed','Dismissed') then
    next_status:=target_status;
  elsif target.lifecycle_status='Review booked'
        and target_status in ('Completed','Dismissed') then
    next_status:=target_status;
  else raise exception 'VALID_OPPORTUNITY_TRANSITION_REQUIRED' using errcode='22023'; end if;
  if next_status='Review booked' and household.status<>'Active' then
    raise exception 'ACTIVE_HOUSEHOLD_REQUIRED' using errcode='55000'; end if;
  if next_status='Dismissed' and nullif(btrim(dismissal_reason),'') is null then
    raise exception 'DISMISSAL_REASON_REQUIRED' using errcode='22023'; end if;
  update public.opportunities o set lifecycle_status=next_status,
    dismissal_reason=case when next_status='Dismissed' then btrim(dismissal_reason) else null end,
    completed_at=case when next_status='Completed' then transaction_timestamp() else null end,
    updated_at=transaction_timestamp(),version=o.version+1
  where o.organisation_id=organisation_id and o.id=opportunity_id;
  insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,actor_membership_id,occurred_at,details)
  values(organisation_id,'mortgage.household',review_link.household_id,'opportunity.status_changed','Review opportunity status changed',actor_membership,transaction_timestamp(),
    jsonb_strip_nulls(jsonb_build_object('householdId',review_link.household_id,
      'loanRecordId',review_link.loan_record_id,'opportunityId',opportunity_id,
      'previousStatus',target.lifecycle_status,'newStatus',next_status,
      'reason',case when next_status='Dismissed' then btrim(dismissal_reason) end,
      'previousVersion',target.version,'newVersion',target.version+1)));
  result:=jsonb_build_object('opportunityId',opportunity_id,
    'householdId',review_link.household_id,'status',next_status,'version',target.version+1);
  return private.finish_operation_command(organisation_id,command_id,result);
end
$$;
