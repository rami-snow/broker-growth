-- Broker Growth Desk Milestone 4C: persistent Client Book and atomic lead conversion.

alter table public.tasks drop constraint tasks_target_shape;
alter table public.tasks add column household_id uuid;
alter table public.tasks add constraint tasks_one_subject_check
  check (num_nonnulls(lead_id, opportunity_id, household_id) = 1);
alter table public.tasks add constraint tasks_household_fkey
  foreign key (organisation_id, household_id)
  references public.mortgage_households(organisation_id, id);

create index tasks_household_due_idx
  on public.tasks (organisation_id, household_id, due_at)
  where household_id is not null;
create index household_members_contact_idx
  on public.mortgage_household_members (organisation_id, contact_id, household_id);
create index household_list_recent_idx
  on public.mortgage_households (organisation_id, created_at desc, id);
create index household_list_name_idx
  on public.mortgage_households (organisation_id, lower(display_name), id);
create index contacts_name_normalized_idx
  on public.contacts (organisation_id, lower(btrim(given_name) || ' ' || btrim(family_name)));
create index conversions_household_idx
  on public.mortgage_lead_household_conversions (organisation_id, household_id);
create index activity_household_idx
  on public.activity_events (organisation_id, entity_id, occurred_at desc)
  where entity_type = 'mortgage.household';
create index review_household_trigger_idx
  on public.mortgage_review_opportunities (organisation_id, household_id, trigger_date);

-- Client Book mutation is operation-only. Reads continue through capability RLS.
revoke insert, update on public.mortgage_households,
  public.mortgage_household_members,
  public.mortgage_minimal_loan_records,
  public.mortgage_review_opportunities,
  public.mortgage_lead_household_conversions
from authenticated;

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
  joint_id uuid;
  loan_id uuid;
  opportunity_id uuid;
  conversion_id uuid := gen_random_uuid();
  converted_at timestamptz := clock_timestamp();
  new_version integer;
  duplicate_reasons jsonb := '[]'::jsonb;
  trigger_kind text;
  trigger_on date;
  lifecycle text;
  result jsonb;
begin
  actor_membership := private.require_operation_actor(organisation_id, 'lead.update');
  if not private.has_capability(organisation_id, 'mortgage.household.create') then
    raise exception 'CAPABILITY_REQUIRED:mortgage.household.create' using errcode = '42501';
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

  perform 1 from public.organisation_memberships m
  where m.organisation_id = organisation_id and m.id = owner_membership_id and m.status = 'Active';
  if not found then raise exception 'ACTIVE_OWNER_REQUIRED' using errcode = '23503'; end if;
  if not private.has_capability(organisation_id, 'lead.assign')
     and owner_membership_id <> actor_membership then
    raise exception 'OWNER_MUST_BE_CURRENT_ACTOR' using errcode = '42501';
  end if;
  if referral_partner_id is not null and not exists (
    select 1 from public.mortgage_referral_partners r
    where r.organisation_id = organisation_id and r.id = referral_partner_id
  ) then raise exception 'REFERRAL_NOT_FOUND' using errcode = '23503'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'householdId', d.household_id,
    'contactId', d.contact_id,
    'reasons', d.reasons
  ) order by d.household_id), '[]'::jsonb)
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
      and (c.email_normalized = target_contact.email_normalized
        or c.phone_normalized = target_contact.phone_normalized
        or lower(btrim(c.given_name) || ' ' || btrim(c.family_name)) =
           lower(btrim(target_contact.given_name) || ' ' || btrim(target_contact.family_name)))
  ) d;

  if duplicate_decision = 'create-new' then
    if nullif(btrim(display_name), '') is null then
      raise exception 'HOUSEHOLD_DISPLAY_NAME_REQUIRED' using errcode = '22023';
    end if;
    household_id := gen_random_uuid();
    insert into public.mortgage_households(
      id, organisation_id, display_name, primary_contact_id, owner_membership_id,
      referral_partner_id, status, created_at, updated_at, version
    ) values (
      household_id, organisation_id, btrim(display_name), target_lead.contact_id,
      owner_membership_id, referral_partner_id, 'Active', converted_at, converted_at, 1
    );
    insert into public.mortgage_household_members(
      organisation_id, household_id, contact_id, relationship, is_primary
    ) values (organisation_id, household_id, target_lead.contact_id, 'Primary applicant', true);
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
    household_id := target_household.id;
    insert into public.mortgage_household_members(
      organisation_id, household_id, contact_id, relationship, is_primary
    ) values (organisation_id, household_id, target_lead.contact_id, 'Other', false)
    on conflict (organisation_id, household_id, contact_id) do nothing;
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
      insert into public.contacts(id, organisation_id, given_name, family_name, email,
        email_normalized, phone, phone_normalized, preferred_contact_method, status,
        created_at, updated_at)
      values(joint_id, organisation_id, btrim(joint_first_name), btrim(joint_last_name),
        lower(btrim(joint_email)), lower(btrim(joint_email)), btrim(joint_phone),
        regexp_replace(joint_phone, '[^0-9]', '', 'g'), joint_preferred_contact_method,
        'Active', converted_at, converted_at);
      insert into public.consent_evidence(organisation_id, contact_id, channel, status,
        source, effective_at, recorded_at, actor_membership_id,
        external_action_confirmed, provenance)
      select organisation_id, joint_id, channel, 'Not recorded', 'Lead conversion',
        converted_at, converted_at, actor_membership, false, 'Lead conversion'
      from unnest(array['Email','SMS','Phone']) channel;
    end if;
    insert into public.mortgage_household_members(
      organisation_id, household_id, contact_id, relationship, is_primary
    ) values (organisation_id, household_id, joint_id, joint_relationship, false)
    on conflict (organisation_id, household_id, contact_id) do nothing;
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
      loan_id, organisation_id, household_id, owner_membership_id,
      nullif(btrim(loan_external_reference), ''), btrim(loan_lender_name), loan_purpose,
      loan_settlement_date, loan_fixed_rate_expiry_date, loan_last_review_date,
      loan_next_review_date, loan_status, 'Lead conversion', loan_data_confidence,
      converted_at, converted_at, 1
    );

    for trigger_kind, trigger_on in
      select * from (values
        ('Annual review'::text, loan_next_review_date),
        ('Fixed-rate expiry'::text, loan_fixed_rate_expiry_date)
      ) v(kind, trigger_date)
      where trigger_date is not null
        and ((kind = 'Annual review' and trigger_date <= current_date + 30)
          or (kind = 'Fixed-rate expiry' and trigger_date <= current_date + 90))
    loop
      lifecycle := case when trigger_on < current_date then 'Overdue'
        when trigger_kind = 'Annual review' and trigger_on <= current_date + 7 then 'Due'
        when trigger_kind = 'Fixed-rate expiry' and trigger_on <= current_date + 30 then 'Due'
        else 'Upcoming' end;
      opportunity_id := gen_random_uuid();
      insert into public.opportunities(id, organisation_id, opportunity_type,
        lifecycle_status, trigger_date, subject_type, subject_id, owner_membership_id,
        created_at, updated_at)
      values(opportunity_id, organisation_id, trigger_kind, lifecycle, trigger_on,
        'mortgage.household', household_id, owner_membership_id, converted_at, converted_at)
      on conflict do nothing;
      insert into public.mortgage_review_opportunities(
        organisation_id, opportunity_id, household_id, loan_record_id,
        trigger_type, trigger_date
      ) values (organisation_id, opportunity_id, household_id, loan_id,
        trigger_kind, trigger_on)
      on conflict (organisation_id, loan_record_id, trigger_type, trigger_date) do nothing;
    end loop;
  end if;

  insert into public.mortgage_lead_household_conversions(
    id, organisation_id, lead_id, household_id, converted_by_membership_id, converted_at
  ) values (conversion_id, organisation_id, lead_id, household_id, actor_membership, converted_at);

  new_version := expected_version + 1;
  update public.leads l set lifecycle_status = 'Converted', updated_at = converted_at,
    version = new_version
  where l.organisation_id = organisation_id and l.id = lead_id;

  insert into public.activity_events(organisation_id, entity_type, entity_id,
    event_type, summary, actor_membership_id, occurred_at, details)
  values
    (organisation_id, 'lead', lead_id, 'lead.converted',
      'Lead converted to a client household', actor_membership, converted_at,
      jsonb_build_object('householdId', household_id, 'conversionId', conversion_id,
        'oldStatus', 'Discovery booked', 'newStatus', 'Converted', 'version', new_version)),
    (organisation_id, 'mortgage.household', household_id, 'conversion.duplicate_reviewed',
      'Duplicate review completed during lead conversion', actor_membership, converted_at,
      jsonb_build_object('leadId', lead_id, 'decision', duplicate_decision,
        'matches', duplicate_reasons)),
    (organisation_id, 'mortgage.household', household_id, 'household.conversion_completed',
      'Lead conversion completed', actor_membership, converted_at,
      jsonb_strip_nulls(jsonb_build_object('leadId', lead_id, 'conversionId', conversion_id,
        'loanRecordId', loan_id, 'jointContactId', joint_id)));

  result := jsonb_strip_nulls(jsonb_build_object(
    'leadId', lead_id, 'householdId', household_id, 'conversionId', conversion_id,
    'contactId', target_lead.contact_id, 'jointContactId', joint_id,
    'loanRecordId', loan_id, 'version', new_version
  ));
  return private.finish_operation_command(organisation_id, command_id, result);
end
$$;

revoke all on function public.convert_mortgage_lead_to_household(
  uuid,uuid,uuid,integer,text,text,uuid,uuid,uuid,uuid,text,text,text,text,text,text,
  text,text,text,date,date,date,date,text,text
) from public, anon;
grant execute on function public.convert_mortgage_lead_to_household(
  uuid,uuid,uuid,integer,text,text,uuid,uuid,uuid,uuid,text,text,text,text,text,text,
  text,text,text,date,date,date,date,text,text
) to authenticated;
