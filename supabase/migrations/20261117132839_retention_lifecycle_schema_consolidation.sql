-- Broker Growth Desk Milestone 4D.1: retention lifecycle and schema consolidation.

-- Fail closed for any value that is not either the final lifecycle or the one
-- explicitly supported legacy value. The hosted preflight found no legacy rows.
do $$
declare unexpected integer;
begin
  select count(*) into unexpected
  from public.opportunities
  where lifecycle_status not in (
    'Upcoming','Due','Overdue','In progress','Review booked','Completed','Dismissed'
  );
  if unexpected <> 0 then
    raise exception 'UNEXPECTED_OPPORTUNITY_LIFECYCLE_ROWS:%', unexpected
      using errcode = '23514';
  end if;
end
$$;

update public.opportunities
set lifecycle_status = 'Review booked', updated_at = transaction_timestamp()
where lifecycle_status = 'In progress';

alter table public.opportunities
  drop constraint if exists opportunities_lifecycle_status_check,
  drop constraint if exists opportunities_lifecycle_status_allowed,
  add constraint opportunities_lifecycle_status_allowed check (
    lifecycle_status in ('Upcoming','Due','Overdue','Review booked','Completed','Dismissed')
  );

-- Replace the two 4C/4D copies atomically. Legacy generated subject columns may
-- remain for read compatibility, but no longer own duplicate target constraints.
alter table public.tasks
  drop constraint if exists tasks_one_subject_check,
  drop constraint if exists tasks_single_subject_check,
  drop constraint if exists tasks_household_fkey,
  drop constraint if exists tasks_organisation_id_household_id_fkey,
  drop constraint if exists tasks_mortgage_household_fkey,
  drop constraint if exists tasks_mortgage_review_opportunity_fkey,
  add constraint tasks_subject_shape_check
    check (num_nonnulls(lead_id, opportunity_id, household_id) = 1),
  add constraint tasks_household_tenant_fkey
    foreign key (organisation_id, household_id)
    references public.mortgage_households(organisation_id, id);

-- Caller provenance is not part of this public operation. Manual creation is
-- always recorded as Manual entry by the database.
drop function public.add_mortgage_minimal_loan_record(
  uuid,uuid,uuid,text,text,text,date,date,date,date,text,text,text
);

create function public.add_mortgage_minimal_loan_record(
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
      'nextReviewDate', next_review_date, 'status', loan_status,
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
    loan_status, 'Manual entry', data_confidence,
    transaction_timestamp(), transaction_timestamp(), 1
  );
  insert into public.activity_events(
    organisation_id, entity_type, entity_id, event_type, summary,
    actor_membership_id, occurred_at, details
  ) values (
    organisation_id, 'mortgage.household', household_id, 'loan.created',
    'Retention-only loan record created', actor_membership, transaction_timestamp(),
    jsonb_build_object('householdId', household_id, 'loanRecordId', loan_id,
      'ownerMembershipId', target_household.owner_membership_id,
      'source', 'Manual entry', 'version', 1)
  );
  result := jsonb_build_object('loanRecordId', loan_id, 'householdId', household_id, 'version', 1);
  return private.finish_operation_command(organisation_id, command_id, result);
end
$$;

revoke all on function public.add_mortgage_minimal_loan_record(
  uuid,uuid,uuid,text,text,text,date,date,date,date,text,text
) from public, anon;
grant execute on function public.add_mortgage_minimal_loan_record(
  uuid,uuid,uuid,text,text,text,date,date,date,date,text,text
) to authenticated;

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
  review_link public.mortgage_review_opportunities%rowtype;
  business_date date := (transaction_timestamp() at time zone 'Australia/Sydney')::date;
  next_status text; result jsonb;
begin
  actor_membership := private.require_operation_actor(organisation_id,'mortgage.review-opportunity.manage');
  previous_result := private.begin_operation_command_checked(
    organisation_id,command_id,'mortgage.review-opportunity-transition',actor_membership,
    jsonb_build_object('opportunityId',opportunity_id,'expectedVersion',expected_version,
      'targetStatus',target_status,'dismissalReason',dismissal_reason)
  );
  if previous_result is not null then return previous_result; end if;

  select o.* into target from public.opportunities o
  join public.mortgage_review_opportunities r
    on r.organisation_id=o.organisation_id and r.opportunity_id=o.id
  where o.organisation_id=organisation_id and o.id=opportunity_id for update of o;
  if not found then raise exception 'REVIEW_OPPORTUNITY_NOT_FOUND' using errcode='P0002'; end if;
  select r.* into review_link from public.mortgage_review_opportunities r
  where r.organisation_id=organisation_id and r.opportunity_id=opportunity_id;
  if target.version<>expected_version then raise exception 'STALE_OPPORTUNITY_VERSION' using errcode='40001'; end if;
  if not private.has_capability(organisation_id,'mortgage.household.assign')
     and target.owner_membership_id is distinct from actor_membership then
    raise exception 'OPPORTUNITY_OWNERSHIP_REQUIRED' using errcode='42501';
  end if;
  if target.lifecycle_status='Completed' then
    raise exception 'COMPLETED_OPPORTUNITY_TERMINAL' using errcode='55000';
  end if;
  if target_status=target.lifecycle_status then
    raise exception 'OPPORTUNITY_NO_OP_TRANSITION' using errcode='55000';
  end if;

  if target.lifecycle_status='Dismissed' then
    if target_status<>'Reopen' then
      raise exception 'DISMISSED_OPPORTUNITY_REOPEN_REQUIRED' using errcode='55000';
    end if;
    next_status := private.mortgage_review_effective_status(
      review_link.trigger_type,review_link.trigger_date,'Upcoming',business_date
    );
  elsif target_status='Reopen' then
    raise exception 'DISMISSED_OPPORTUNITY_REQUIRED' using errcode='55000';
  elsif target.lifecycle_status in ('Upcoming','Due','Overdue')
        and target_status in ('Review booked','Completed','Dismissed') then
    next_status := target_status;
  elsif target.lifecycle_status='Review booked'
        and target_status in ('Completed','Dismissed') then
    next_status := target_status;
  else
    raise exception 'VALID_OPPORTUNITY_TRANSITION_REQUIRED' using errcode='22023';
  end if;

  if next_status='Dismissed' and nullif(btrim(dismissal_reason),'') is null then
    raise exception 'DISMISSAL_REASON_REQUIRED' using errcode='22023';
  end if;
  update public.opportunities o set
    lifecycle_status=next_status,
    dismissal_reason=case when next_status='Dismissed' then btrim(dismissal_reason) else null end,
    completed_at=case when next_status='Completed' then transaction_timestamp() else null end,
    updated_at=transaction_timestamp(),version=o.version+1
  where o.organisation_id=organisation_id and o.id=opportunity_id;
  insert into public.activity_events(
    organisation_id,entity_type,entity_id,event_type,summary,
    actor_membership_id,occurred_at,details
  ) values (
    organisation_id,'mortgage.household',review_link.household_id,
    'opportunity.status_changed','Review opportunity status changed',
    actor_membership,transaction_timestamp(),
    jsonb_strip_nulls(jsonb_build_object(
      'householdId',review_link.household_id,'loanRecordId',review_link.loan_record_id,
      'opportunityId',opportunity_id,'previousStatus',target.lifecycle_status,
      'newStatus',next_status,
      'reason',case when next_status='Dismissed' then btrim(dismissal_reason) end,
      'previousVersion',target.version,'newVersion',target.version+1
    ))
  );
  result:=jsonb_build_object('opportunityId',opportunity_id,
    'householdId',review_link.household_id,'status',next_status,'version',target.version+1);
  return private.finish_operation_command(organisation_id,command_id,result);
end
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

-- Complete forward-only replacement: the conversion inserts the loan and the
-- Milestone 4D after-insert reconciler is the sole opportunity generator.
create or replace function public.convert_mortgage_lead_to_household(
  organisation_id uuid,
  command_id uuid,
  lead_id uuid,
  expected_version integer,
  duplicate_decision text,
  display_name text,
  owner_membership_id uuid,
  referral_partner_id uuid default null,
  existing_household_id uuid default null,
  joint_contact_id uuid default null,
  joint_first_name text default null,
  joint_last_name text default null,
  joint_email text default null,
  joint_phone text default null,
  joint_preferred_contact_method text default null,
  joint_relationship text default null,
  loan_external_reference text default null,
  loan_lender_name text default null,
  loan_purpose text default null,
  loan_settlement_date date default null,
  loan_fixed_rate_expiry_date date default null,
  loan_last_review_date date default null,
  loan_next_review_date date default null,
  loan_status text default null,
  loan_data_confidence text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_membership uuid;
  previous_result jsonb;
  target_lead public.leads%rowtype;
  target_household public.mortgage_households%rowtype;
  target_contact public.contacts%rowtype;
  household_id uuid;
  household_owner_id uuid;
  primary_member_id uuid;
  joint_member_id uuid;
  joint_id uuid;
  loan_id uuid;
  conversion_id uuid := gen_random_uuid();
  converted_at timestamptz := clock_timestamp();
  new_version integer;
  duplicate_reasons jsonb := '[]'::jsonb;
  result jsonb;
begin
  actor_membership := private.require_operation_actor(organisation_id, 'lead.update');
  if not private.has_capability(organisation_id, 'mortgage.household.create') then
    raise exception 'CAPABILITY_REQUIRED:mortgage.household.create' using errcode = '42501';
  end if;
  if not private.has_capability(organisation_id, 'contact.view') then
    raise exception 'CAPABILITY_REQUIRED:contact.view' using errcode = '42501';
  end if;
  if not private.has_capability(organisation_id, 'mortgage.household.view') then
    raise exception 'CAPABILITY_REQUIRED:mortgage.household.view' using errcode = '42501';
  end if;

  previous_result := private.begin_operation_command(
    organisation_id, command_id, 'mortgage.lead-convert', actor_membership
  );
  if previous_result is not null then return previous_result; end if;

  target_lead := private.require_lead_access(
    organisation_id, lead_id, expected_version, actor_membership, true
  );
  if target_lead.lifecycle_status <> 'Discovery booked' then
    raise exception 'DISCOVERY_BOOKED_LEAD_REQUIRED' using errcode = '22023';
  end if;
  if target_lead.contact_id is null then
    raise exception 'LEAD_CONTACT_REQUIRED' using errcode = '23503';
  end if;
  if exists (
    select 1 from public.mortgage_lead_household_conversions c
    where c.organisation_id = organisation_id and c.lead_id = lead_id
  ) then
    raise exception 'LEAD_ALREADY_CONVERTED' using errcode = '23505';
  end if;

  select * into target_contact from public.contacts c
  where c.organisation_id = organisation_id and c.id = target_lead.contact_id;
  if not found then raise exception 'LEAD_CONTACT_REQUIRED' using errcode = '23503'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'householdId', d.household_id,
    'contactId', d.contact_id,
    'reasons', d.reasons
  ) order by d.household_id, d.contact_id), '[]'::jsonb)
  into duplicate_reasons
  from (
    select hm.household_id, c.id as contact_id,
      array_remove(array[
        case when target_contact.email_normalized is not null
               and c.email_normalized = target_contact.email_normalized then 'exact_email' end,
        case when target_contact.phone_normalized is not null
               and c.phone_normalized = target_contact.phone_normalized then 'exact_phone' end,
        case when lower(btrim(c.given_name) || ' ' || btrim(c.family_name)) =
                  lower(btrim(target_contact.given_name) || ' ' || btrim(target_contact.family_name))
             then 'normalized_full_name' end
      ], null) as reasons
    from public.contacts c
    join public.mortgage_household_members hm
      on hm.organisation_id = c.organisation_id and hm.contact_id = c.id
    where c.organisation_id = organisation_id
      and c.id <> target_contact.id
      and (
        (target_contact.email_normalized is not null and c.email_normalized = target_contact.email_normalized)
        or (target_contact.phone_normalized is not null and c.phone_normalized = target_contact.phone_normalized)
        or lower(btrim(c.given_name) || ' ' || btrim(c.family_name)) =
           lower(btrim(target_contact.given_name) || ' ' || btrim(target_contact.family_name))
      )
  ) d;

  if duplicate_decision = 'create-new' then
    if nullif(btrim(display_name), '') is null then
      raise exception 'HOUSEHOLD_DISPLAY_NAME_REQUIRED' using errcode = '22023';
    end if;
    perform 1 from public.organisation_memberships m
    where m.organisation_id = organisation_id and m.id = owner_membership_id and m.status = 'Active';
    if not found then raise exception 'ACTIVE_OWNER_REQUIRED' using errcode = '23503'; end if;
    if not private.has_capability(organisation_id, 'mortgage.household.assign')
       and owner_membership_id <> actor_membership then
      raise exception 'HOUSEHOLD_OWNER_MUST_BE_CURRENT_ACTOR' using errcode = '42501';
    end if;
    if referral_partner_id is not null and not exists (
      select 1 from public.mortgage_referral_partners r
      where r.organisation_id = organisation_id and r.id = referral_partner_id
    ) then raise exception 'REFERRAL_NOT_FOUND' using errcode = '23503'; end if;

    household_id := gen_random_uuid();
    household_owner_id := owner_membership_id;
    insert into public.mortgage_households(
      id, organisation_id, display_name, primary_contact_id, owner_membership_id,
      referral_partner_id, status, source_lead_id, created_at, updated_at, version
    ) values (
      household_id, organisation_id, btrim(display_name), target_lead.contact_id,
      household_owner_id, referral_partner_id, 'Active', lead_id, converted_at, converted_at, 1
    );
    insert into public.mortgage_household_members(
      organisation_id, household_id, contact_id, relationship, is_primary
    ) values (organisation_id, household_id, target_lead.contact_id, 'Primary applicant', true)
    returning id into primary_member_id;
    insert into public.activity_events(
      organisation_id, entity_type, entity_id, event_type, summary,
      actor_membership_id, occurred_at, details
    ) values (
      organisation_id, 'mortgage.household', household_id, 'household.created',
      'Client household created from lead conversion', actor_membership, converted_at,
      jsonb_build_object('householdId', household_id, 'sourceLeadId', lead_id,
        'primaryContactId', target_lead.contact_id, 'ownerMembershipId', household_owner_id,
        'householdMemberId', primary_member_id)
    );
  elsif duplicate_decision = 'add-existing' then
    if existing_household_id is null then
      raise exception 'EXISTING_HOUSEHOLD_REQUIRED' using errcode = '22023';
    end if;
    if not private.has_capability(organisation_id, 'mortgage.household.update') then
      raise exception 'CAPABILITY_REQUIRED:mortgage.household.update' using errcode = '42501';
    end if;
    select * into target_household from public.mortgage_households h
    where h.organisation_id = organisation_id and h.id = existing_household_id
    for update;
    if not found then raise exception 'HOUSEHOLD_NOT_FOUND' using errcode = 'P0002'; end if;
    if not private.has_capability(organisation_id, 'mortgage.household.assign')
       and target_household.owner_membership_id <> actor_membership then
      raise exception 'HOUSEHOLD_OWNERSHIP_REQUIRED' using errcode = '42501';
    end if;
    if not exists (
      select 1 from jsonb_array_elements(duplicate_reasons) match
      where (match->>'householdId')::uuid = target_household.id
    ) then
      raise exception 'EXISTING_HOUSEHOLD_NOT_DUPLICATE_MATCH' using errcode = '22023';
    end if;
    household_id := target_household.id;
    household_owner_id := target_household.owner_membership_id;
    insert into public.mortgage_household_members(
      organisation_id, household_id, contact_id, relationship, is_primary
    ) values (organisation_id, household_id, target_lead.contact_id, 'Other', false)
    on conflict on constraint mortgage_household_members_organisation_id_household_id_con_key do nothing
    returning id into primary_member_id;
    if primary_member_id is not null then
      insert into public.activity_events(
        organisation_id, entity_type, entity_id, event_type, summary,
        actor_membership_id, occurred_at, details
      ) values (
        organisation_id, 'mortgage.household', household_id, 'household.member_added',
        'Lead contact added to existing client household', actor_membership, converted_at,
        jsonb_build_object('householdId', household_id, 'householdMemberId', primary_member_id,
          'contactId', target_lead.contact_id, 'relationship', 'Other', 'sourceLeadId', lead_id)
      );
    end if;
  else
    raise exception 'DUPLICATE_DECISION_REQUIRED' using errcode = '22023';
  end if;

  if joint_contact_id is not null or nullif(btrim(joint_first_name), '') is not null then
    if joint_relationship not in ('Joint applicant','Guarantor','Other') then
      raise exception 'VALID_JOINT_RELATIONSHIP_REQUIRED' using errcode = '22023';
    end if;
    if joint_contact_id is not null then
      select c.id into joint_id from public.contacts c
      where c.organisation_id = organisation_id and c.id = joint_contact_id;
      if not found then raise exception 'JOINT_CONTACT_NOT_FOUND' using errcode = 'P0002'; end if;
    else
      if nullif(btrim(joint_last_name), '') is null
         or joint_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
         or length(regexp_replace(joint_phone, '[^0-9]', '', 'g')) < 8
         or joint_preferred_contact_method not in ('Phone','Email','SMS') then
        raise exception 'VALID_JOINT_CONTACT_REQUIRED' using errcode = '22023';
      end if;
      if exists (
        select 1 from public.contacts c where c.organisation_id = organisation_id
          and (c.email_normalized = lower(btrim(joint_email))
            or c.phone_normalized = regexp_replace(joint_phone, '[^0-9]', '', 'g'))
      ) then raise exception 'JOINT_CONTACT_DUPLICATE_REQUIRES_SELECTION' using errcode = '23505'; end if;
      joint_id := gen_random_uuid();
      insert into public.contacts(
        id, organisation_id, given_name, family_name, email, email_normalized,
        phone, phone_normalized, preferred_contact_method, status, created_at, updated_at
      ) values (
        joint_id, organisation_id, btrim(joint_first_name), btrim(joint_last_name),
        lower(btrim(joint_email)), lower(btrim(joint_email)), btrim(joint_phone),
        regexp_replace(joint_phone, '[^0-9]', '', 'g'), joint_preferred_contact_method,
        'Active', converted_at, converted_at
      );
      insert into public.consent_evidence(
        organisation_id, contact_id, channel, status, source, effective_at,
        recorded_at, actor_membership_id, external_action_confirmed, provenance
      )
      select organisation_id, joint_id, channel, 'Not recorded', 'Lead conversion',
        converted_at, converted_at, actor_membership, false, 'Lead conversion'
      from unnest(array['Email','SMS','Phone']) channel;
    end if;
    insert into public.mortgage_household_members(
      organisation_id, household_id, contact_id, relationship, is_primary
    ) values (organisation_id, household_id, joint_id, joint_relationship, false)
    on conflict on constraint mortgage_household_members_organisation_id_household_id_con_key do nothing
    returning id into joint_member_id;
    if joint_member_id is not null then
      insert into public.activity_events(
        organisation_id, entity_type, entity_id, event_type, summary,
        actor_membership_id, occurred_at, details
      ) values (
        organisation_id, 'mortgage.household', household_id, 'household.member_added',
        'Joint client added to client household', actor_membership, converted_at,
        jsonb_build_object('householdId', household_id, 'householdMemberId', joint_member_id,
          'contactId', joint_id, 'relationship', joint_relationship, 'sourceLeadId', lead_id)
      );
    end if;
  end if;

  if nullif(btrim(loan_lender_name), '') is not null then
    if not private.has_capability(organisation_id, 'mortgage.loan-record.manage') then
      raise exception 'CAPABILITY_REQUIRED:mortgage.loan-record.manage' using errcode = '42501';
    end if;
    if loan_purpose not in ('Purchase','Refinance','Investment purchase','Construction loan','Asset finance','Commercial finance','Other')
       or loan_status not in ('Active','Discharged','Unknown')
       or loan_data_confidence not in ('Confirmed','Unverified') then
      raise exception 'VALID_MINIMAL_LOAN_REQUIRED' using errcode = '22023';
    end if;
    loan_id := gen_random_uuid();
    insert into public.mortgage_minimal_loan_records(
      id, organisation_id, household_id, owner_membership_id, external_reference,
      lender_name, loan_purpose, settlement_date, fixed_rate_expiry_date,
      last_review_date, next_review_date, status, source, data_confidence,
      created_at, updated_at, version
    ) values (
      loan_id, organisation_id, household_id, household_owner_id,
      nullif(btrim(loan_external_reference), ''), btrim(loan_lender_name), loan_purpose,
      loan_settlement_date, loan_fixed_rate_expiry_date, loan_last_review_date,
      loan_next_review_date, loan_status, 'Lead conversion', loan_data_confidence,
      converted_at, converted_at, 1
    );
    insert into public.activity_events(
      organisation_id, entity_type, entity_id, event_type, summary,
      actor_membership_id, occurred_at, details
    ) values (
      organisation_id, 'mortgage.household', household_id, 'loan.created',
      'Retention-only loan record created during conversion', actor_membership, converted_at,
      jsonb_build_object('householdId', household_id, 'loanRecordId', loan_id,
        'ownerMembershipId', household_owner_id, 'sourceLeadId', lead_id)
    );
  end if;

  insert into public.mortgage_lead_household_conversions(
    id, organisation_id, lead_id, household_id, converted_by_membership_id, converted_at
  ) values (conversion_id, organisation_id, lead_id, household_id, actor_membership, converted_at);

  new_version := expected_version + 1;
  update public.leads l set lifecycle_status = 'Converted', updated_at = converted_at,
    version = new_version
  where l.organisation_id = organisation_id and l.id = lead_id;

  insert into public.activity_events(
    organisation_id, entity_type, entity_id, event_type, summary,
    actor_membership_id, occurred_at, details
  ) values
    (organisation_id, 'mortgage.household', household_id, 'conversion.duplicate_reviewed',
      'Duplicate review completed during lead conversion', actor_membership, converted_at,
      jsonb_build_object('leadId', lead_id, 'householdId', household_id,
        'decision', duplicate_decision, 'matches', duplicate_reasons)),
    (organisation_id, 'lead', lead_id, 'lead.converted',
      'Lead converted to a client household', actor_membership, converted_at,
      jsonb_build_object('householdId', household_id, 'conversionId', conversion_id,
        'oldStatus', 'Discovery booked', 'newStatus', 'Converted', 'version', new_version)),
    (organisation_id, 'mortgage.household', household_id, 'household.conversion_completed',
      'Lead conversion completed', actor_membership, converted_at,
      jsonb_strip_nulls(jsonb_build_object('leadId', lead_id, 'householdId', household_id,
        'conversionId', conversion_id, 'primaryContactId', target_lead.contact_id,
        'loanRecordId', loan_id, 'jointContactId', joint_id)));

  result := jsonb_strip_nulls(jsonb_build_object(
    'leadId', lead_id, 'householdId', household_id, 'conversionId', conversion_id,
    'contactId', target_lead.contact_id, 'jointContactId', joint_id,
    'loanRecordId', loan_id, 'version', new_version
  ));
  return private.finish_operation_command(organisation_id, command_id, result);
end
$$;
