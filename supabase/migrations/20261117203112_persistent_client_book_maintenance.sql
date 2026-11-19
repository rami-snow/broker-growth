-- Broker Growth Desk Milestone 4E: persistent Client Book maintenance.

-- Mutable shared records now expose explicit optimistic-concurrency versions.
alter table public.contacts
  add column version integer not null default 1 check (version > 0);
alter table public.tasks
  add column version integer not null default 1 check (version > 0),
  add column updated_at timestamptz not null default now();

-- Archived is a retained, readable lifecycle state. Legacy Inactive remains
-- readable but is not produced by the operations in this milestone.
alter table public.mortgage_households
  drop constraint if exists mortgage_households_status_check,
  drop constraint if exists mortgage_households_status_allowed,
  add constraint mortgage_households_status_allowed
    check (status in ('Active','Inactive','Archived'));

-- Exact email/phone duplicates are invalid inside one tenant. Fail closed if
-- pre-existing hosted data would make the new invariant unsafe.
do $$
begin
  if exists (
    select 1 from public.contacts
    where nullif(email_normalized,'') is not null
    group by organisation_id,email_normalized having count(*) > 1
  ) then raise exception 'PREEXISTING_DUPLICATE_NORMALIZED_EMAIL'; end if;
  if exists (
    select 1 from public.contacts
    where nullif(phone_normalized,'') is not null
    group by organisation_id,phone_normalized having count(*) > 1
  ) then raise exception 'PREEXISTING_DUPLICATE_NORMALIZED_PHONE'; end if;
end
$$;

create unique index contacts_tenant_email_unique
  on public.contacts(organisation_id,email_normalized)
  where nullif(email_normalized,'') is not null;
create unique index contacts_tenant_phone_unique
  on public.contacts(organisation_id,phone_normalized)
  where nullif(phone_normalized,'') is not null;

-- task.update is shared-platform capability vocabulary. Existing development
-- actors who can create tasks receive the transition capability explicitly.
insert into public.membership_capabilities(organisation_id,membership_id,capability)
select organisation_id,membership_id,'task.update'
from public.membership_capabilities where capability='task.create'
on conflict do nothing;

-- Direct browser writes remain denied. Every mutation below is a narrowly
-- guarded SECURITY DEFINER endpoint with an empty search_path.
revoke insert,update,delete on public.contacts,public.mortgage_households,
  public.mortgage_household_members,public.mortgage_minimal_loan_records,
  public.tasks from authenticated;

create or replace function private.normalise_contact_email(value text)
returns text language sql immutable set search_path='' as $$
  select nullif(lower(btrim(value)),'')
$$;
create or replace function private.normalise_contact_phone(value text)
returns text language sql immutable set search_path='' as $$
  select nullif(regexp_replace(coalesce(value,''),'[^0-9]','','g'),'')
$$;
create or replace function private.normalise_contact_name(given_name text,family_name text)
returns text language sql immutable set search_path='' as $$
  select lower(btrim(coalesce(given_name,''))||' '||btrim(coalesce(family_name,'')))
$$;
revoke all on function private.normalise_contact_email(text),
  private.normalise_contact_phone(text),private.normalise_contact_name(text,text)
  from public,anon,authenticated;

create or replace function private.require_active_broker(
  target_organisation_id uuid,target_membership_id uuid
) returns void language plpgsql stable security definer set search_path='' as $$
begin
  if not exists(
    select 1 from public.organisation_memberships m
    join public.mortgage_membership_profiles p
      on p.organisation_id=m.organisation_id and p.membership_id=m.id
    where m.organisation_id=target_organisation_id and m.id=target_membership_id
      and m.status='Active' and p.position='Broker'
  ) then raise exception 'ACTIVE_BROKER_OWNER_REQUIRED' using errcode='23503'; end if;
end
$$;
revoke all on function private.require_active_broker(uuid,uuid) from public,anon,authenticated;

create or replace function private.require_active_referral_partner(
  target_organisation_id uuid,target_referral_partner_id uuid
) returns void language plpgsql stable security definer set search_path='' as $$
begin
  if target_referral_partner_id is not null and not exists(
    select 1 from public.mortgage_referral_partners r
    where r.organisation_id=target_organisation_id
      and r.id=target_referral_partner_id and r.status='Active'
  ) then raise exception 'ACTIVE_REFERRAL_PARTNER_REQUIRED' using errcode='23503'; end if;
end
$$;
revoke all on function private.require_active_referral_partner(uuid,uuid) from public,anon,authenticated;

create or replace function private.require_household_maintenance_access(
  target_organisation_id uuid,target_household_id uuid,
  target_actor_membership_id uuid,require_active boolean default true
) returns public.mortgage_households
language plpgsql security definer set search_path='' as $$
declare target public.mortgage_households%rowtype;
begin
  select * into target from public.mortgage_households h
  where h.organisation_id=target_organisation_id and h.id=target_household_id
  for update;
  if not found then raise exception 'HOUSEHOLD_NOT_FOUND' using errcode='P0002'; end if;
  if require_active and target.status<>'Active' then
    raise exception 'ACTIVE_HOUSEHOLD_REQUIRED' using errcode='55000';
  end if;
  if not private.has_capability(target_organisation_id,'mortgage.household.assign')
     and target.owner_membership_id<>target_actor_membership_id then
    raise exception 'HOUSEHOLD_OWNERSHIP_REQUIRED' using errcode='42501';
  end if;
  return target;
end
$$;
revoke all on function private.require_household_maintenance_access(uuid,uuid,uuid,boolean)
  from public,anon,authenticated;

create or replace function private.record_new_contact_no_consent(
  target_organisation_id uuid,target_contact_id uuid,target_actor_membership_id uuid,
  target_source text
) returns void language plpgsql security definer set search_path='' as $$
begin
  insert into public.consent_evidence(
    organisation_id,contact_id,channel,status,source,effective_at,recorded_at,
    actor_membership_id,evidence_note,external_action_confirmed,provenance
  ) select target_organisation_id,target_contact_id,channel,'Not recorded',target_source,
      transaction_timestamp(),transaction_timestamp(),target_actor_membership_id,
      'No consent inferred during manual contact creation',false,
      'System default - no consent inferred'
    from unnest(array['Email','SMS','Phone']) channel;
end
$$;
revoke all on function private.record_new_contact_no_consent(uuid,uuid,uuid,text)
  from public,anon,authenticated;

create or replace function private.create_manual_contact(
  target_organisation_id uuid,target_actor_membership_id uuid,
  first_name text,last_name text,email text,phone text,
  preferred_contact_method text,name_match_acknowledged boolean,
  evidence_source text
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  contact_id uuid:=gen_random_uuid(); normal_email text:=private.normalise_contact_email(email);
  normal_phone text:=private.normalise_contact_phone(phone);
  normal_name text:=private.normalise_contact_name(first_name,last_name);
  collision uuid; name_match uuid;
begin
  if nullif(btrim(first_name),'') is null or nullif(btrim(last_name),'') is null
     or preferred_contact_method not in ('Phone','Email','SMS')
     or (normal_email is null and normal_phone is null)
     or (normal_email is not null and normal_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
     or (normal_phone is not null and length(normal_phone)<8) then
    raise exception 'VALID_CONTACT_REQUIRED' using errcode='22023';
  end if;
  select c.id into collision from public.contacts c
  where c.organisation_id=target_organisation_id
    and ((normal_email is not null and c.email_normalized=normal_email)
      or (normal_phone is not null and c.phone_normalized=normal_phone))
  order by c.id limit 1;
  if collision is not null then
    raise exception 'EXACT_CONTACT_MATCH_REQUIRES_EXISTING:%',collision using errcode='23505';
  end if;
  select c.id into name_match from public.contacts c
  where c.organisation_id=target_organisation_id
    and private.normalise_contact_name(c.given_name,c.family_name)=normal_name
  order by c.id limit 1;
  if name_match is not null and not coalesce(name_match_acknowledged,false) then
    raise exception 'NAME_MATCH_ACKNOWLEDGEMENT_REQUIRED:%',name_match using errcode='22023';
  end if;
  begin
    insert into public.contacts(id,organisation_id,given_name,family_name,email,email_normalized,
      phone,phone_normalized,preferred_contact_method,status,created_at,updated_at,version)
    values(contact_id,target_organisation_id,btrim(first_name),btrim(last_name),normal_email,normal_email,
      nullif(btrim(phone),''),normal_phone,preferred_contact_method,'Active',
      transaction_timestamp(),transaction_timestamp(),1);
  exception when unique_violation then
    raise exception 'CONTACT_DETAIL_COLLISION' using errcode='23505';
  end;
  perform private.record_new_contact_no_consent(target_organisation_id,contact_id,
    target_actor_membership_id,evidence_source);
  return contact_id;
end
$$;
revoke all on function private.create_manual_contact(uuid,uuid,text,text,text,text,text,boolean,text)
  from public,anon,authenticated;

create or replace function public.preview_mortgage_manual_contact_duplicates(
  p_organisation_id uuid,p_given_name text,p_family_name text,p_email text,p_phone text
) returns table(
  contact_id uuid,contact_name text,email text,phone text,reasons text[],households jsonb
) language sql stable security definer set search_path='' as $$
  with actor as (
    select private.require_operation_actor(p_organisation_id,'mortgage.household.create') id
  ), input as (
    select private.normalise_contact_email(p_email) email,
      private.normalise_contact_phone(p_phone) phone,
      private.normalise_contact_name(p_given_name,p_family_name) full_name
  ), matched as (
    select c.*,
      array_remove(array[
        case when i.email is not null and c.email_normalized=i.email then 'exact_email' end,
        case when i.phone is not null and c.phone_normalized=i.phone then 'exact_phone' end,
        case when i.full_name<>' ' and private.normalise_contact_name(c.given_name,c.family_name)=i.full_name
          then 'normalized_full_name' end
      ],null)::text[] reasons
    from public.contacts c cross join input i cross join actor
    where c.organisation_id=p_organisation_id and (
      (i.email is not null and c.email_normalized=i.email)
      or (i.phone is not null and c.phone_normalized=i.phone)
      or (i.full_name<>' ' and private.normalise_contact_name(c.given_name,c.family_name)=i.full_name)
    )
  )
  select m.id,btrim(m.given_name)||' '||btrim(m.family_name),m.email,m.phone,m.reasons,
    coalesce((select jsonb_agg(jsonb_build_object(
      'householdId',h.id,'householdName',h.display_name,'householdStatus',h.status,
      'relationship',hm.relationship,'isPrimary',hm.is_primary
    ) order by h.display_name,h.id)
    from public.mortgage_household_members hm
    join public.mortgage_households h
      on h.organisation_id=hm.organisation_id and h.id=hm.household_id
    where hm.organisation_id=p_organisation_id and hm.contact_id=m.id),'[]'::jsonb)
  from matched m order by m.given_name,m.family_name,m.id
$$;
revoke all on function public.preview_mortgage_manual_contact_duplicates(uuid,text,text,text,text)
  from public,anon;
grant execute on function public.preview_mortgage_manual_contact_duplicates(uuid,text,text,text,text)
  to authenticated;

create or replace function public.create_mortgage_household_manual(
  organisation_id uuid,command_id uuid,display_name text,owner_membership_id uuid,
  referral_partner_id uuid,primary_existing_contact_id uuid,
  primary_first_name text,primary_last_name text,primary_email text,primary_phone text,
  primary_preferred_contact_method text,primary_name_match_acknowledged boolean,
  joint_mode text,joint_existing_contact_id uuid,joint_first_name text,joint_last_name text,
  joint_email text,joint_phone text,joint_preferred_contact_method text,
  joint_relationship text,joint_name_match_acknowledged boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
  actor_membership uuid; previous_result jsonb; household_id uuid:=gen_random_uuid();
  primary_contact_id uuid; joint_contact_id uuid; result jsonb;
begin
  actor_membership:=private.require_operation_actor(organisation_id,'mortgage.household.create');
  previous_result:=private.begin_operation_command_checked(organisation_id,command_id,
    'mortgage.household-manual-create',actor_membership,jsonb_build_object(
      'displayName',btrim(display_name),'ownerMembershipId',owner_membership_id,
      'referralPartnerId',referral_partner_id,'primaryExistingContactId',primary_existing_contact_id,
      'primaryFirstName',btrim(primary_first_name),'primaryLastName',btrim(primary_last_name),
      'primaryEmail',private.normalise_contact_email(primary_email),
      'primaryPhone',private.normalise_contact_phone(primary_phone),
      'primaryPreferredContactMethod',primary_preferred_contact_method,
      'primaryNameMatchAcknowledged',coalesce(primary_name_match_acknowledged,false),
      'jointMode',coalesce(joint_mode,'none'),'jointExistingContactId',joint_existing_contact_id,
      'jointFirstName',btrim(joint_first_name),'jointLastName',btrim(joint_last_name),
      'jointEmail',private.normalise_contact_email(joint_email),
      'jointPhone',private.normalise_contact_phone(joint_phone),
      'jointPreferredContactMethod',joint_preferred_contact_method,
      'jointRelationship',joint_relationship,
      'jointNameMatchAcknowledged',coalesce(joint_name_match_acknowledged,false)));
  if previous_result is not null then return previous_result; end if;
  if nullif(btrim(display_name),'') is null then
    raise exception 'HOUSEHOLD_DISPLAY_NAME_REQUIRED' using errcode='22023'; end if;
  perform private.require_active_broker(organisation_id,owner_membership_id);
  perform private.require_active_referral_partner(organisation_id,referral_partner_id);

  if primary_existing_contact_id is not null then
    select c.id into primary_contact_id from public.contacts c
    where c.organisation_id=organisation_id and c.id=primary_existing_contact_id
      and c.status='Active' for share;
    if primary_contact_id is null then raise exception 'ACTIVE_PRIMARY_CONTACT_REQUIRED' using errcode='23503'; end if;
  else
    primary_contact_id:=private.create_manual_contact(organisation_id,actor_membership,
      primary_first_name,primary_last_name,primary_email,primary_phone,
      primary_preferred_contact_method,primary_name_match_acknowledged,'Manual household creation');
  end if;

  if coalesce(joint_mode,'none')='existing' then
    select c.id into joint_contact_id from public.contacts c
    where c.organisation_id=organisation_id and c.id=joint_existing_contact_id
      and c.status='Active' for share;
    if joint_contact_id is null then raise exception 'ACTIVE_JOINT_CONTACT_REQUIRED' using errcode='23503'; end if;
  elsif joint_mode='new' then
    joint_contact_id:=private.create_manual_contact(organisation_id,actor_membership,
      joint_first_name,joint_last_name,joint_email,joint_phone,
      joint_preferred_contact_method,joint_name_match_acknowledged,'Manual household creation');
  elsif coalesce(joint_mode,'none')<>'none' then
    raise exception 'VALID_JOINT_CONTACT_MODE_REQUIRED' using errcode='22023';
  end if;
  if joint_contact_id is not null and joint_contact_id=primary_contact_id then
    raise exception 'DISTINCT_HOUSEHOLD_CONTACTS_REQUIRED' using errcode='23505'; end if;
  if joint_contact_id is not null and joint_relationship not in ('Joint applicant','Guarantor','Other') then
    raise exception 'VALID_HOUSEHOLD_RELATIONSHIP_REQUIRED' using errcode='22023'; end if;

  insert into public.mortgage_households(id,organisation_id,display_name,primary_contact_id,
    owner_membership_id,referral_partner_id,status,created_at,updated_at,version)
  values(household_id,organisation_id,btrim(display_name),primary_contact_id,
    owner_membership_id,referral_partner_id,'Active',transaction_timestamp(),transaction_timestamp(),1);
  insert into public.mortgage_household_members(organisation_id,household_id,contact_id,relationship,is_primary)
  values(organisation_id,household_id,primary_contact_id,'Primary applicant',true);
  if joint_contact_id is not null then
    insert into public.mortgage_household_members(organisation_id,household_id,contact_id,relationship,is_primary)
    values(organisation_id,household_id,joint_contact_id,joint_relationship,false);
  end if;
  insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,
    actor_membership_id,occurred_at,details)
  values(organisation_id,'mortgage.household',household_id,'household.created',
    'Client household created manually',actor_membership,transaction_timestamp(),
    jsonb_strip_nulls(jsonb_build_object('householdId',household_id,
      'primaryContactId',primary_contact_id,'jointContactId',joint_contact_id,
      'ownerMembershipId',owner_membership_id,'referralPartnerId',referral_partner_id,
      'version',1)));
  result:=jsonb_build_object('householdId',household_id,'primaryContactId',primary_contact_id,
    'jointContactId',joint_contact_id,'version',1);
  return private.finish_operation_command(organisation_id,command_id,result);
end
$$;

create or replace function public.update_mortgage_household_details(
  organisation_id uuid,command_id uuid,household_id uuid,expected_version integer,
  display_name text,referral_partner_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor_membership uuid; previous_result jsonb; target public.mortgage_households%rowtype; result jsonb;
begin
  actor_membership:=private.require_operation_actor(organisation_id,'mortgage.household.update');
  previous_result:=private.begin_operation_command_checked(organisation_id,command_id,
    'mortgage.household-details-update',actor_membership,jsonb_build_object(
      'householdId',household_id,'expectedVersion',expected_version,
      'displayName',btrim(display_name),'referralPartnerId',referral_partner_id));
  if previous_result is not null then return previous_result; end if;
  target:=private.require_household_maintenance_access(organisation_id,household_id,actor_membership,true);
  if target.version<>expected_version then raise exception 'STALE_HOUSEHOLD_VERSION' using errcode='40001'; end if;
  if nullif(btrim(display_name),'') is null then raise exception 'HOUSEHOLD_DISPLAY_NAME_REQUIRED' using errcode='22023'; end if;
  perform private.require_active_referral_partner(organisation_id,referral_partner_id);
  update public.mortgage_households h set display_name=btrim(update_mortgage_household_details.display_name),
    referral_partner_id=update_mortgage_household_details.referral_partner_id,
    updated_at=transaction_timestamp(),version=h.version+1
  where h.organisation_id=organisation_id and h.id=household_id;
  insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,
    actor_membership_id,occurred_at,details)
  values(organisation_id,'mortgage.household',household_id,'household.details_changed',
    'Household details changed',actor_membership,transaction_timestamp(),
    jsonb_build_object('previousDisplayName',target.display_name,'newDisplayName',btrim(display_name),
      'previousReferralPartnerId',target.referral_partner_id,'newReferralPartnerId',referral_partner_id,
      'previousVersion',target.version,'newVersion',target.version+1));
  result:=jsonb_build_object('householdId',household_id,'version',target.version+1);
  return private.finish_operation_command(organisation_id,command_id,result);
end
$$;

create or replace function public.assign_mortgage_household_owner(
  organisation_id uuid,command_id uuid,household_id uuid,expected_version integer,
  target_membership_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor_membership uuid; previous_result jsonb; target public.mortgage_households%rowtype;
  loan_count integer; opportunity_assignments jsonb; task_assignments jsonb; result jsonb;
begin
  actor_membership:=private.require_operation_actor(organisation_id,'mortgage.household.assign');
  previous_result:=private.begin_operation_command_checked(organisation_id,command_id,
    'mortgage.household-owner-assign',actor_membership,jsonb_build_object(
      'householdId',household_id,'expectedVersion',expected_version,'targetMembershipId',target_membership_id));
  if previous_result is not null then return previous_result; end if;
  target:=private.require_household_maintenance_access(organisation_id,household_id,actor_membership,true);
  if target.version<>expected_version then raise exception 'STALE_HOUSEHOLD_VERSION' using errcode='40001'; end if;
  if target.owner_membership_id=target_membership_id then raise exception 'HOUSEHOLD_OWNER_NO_OP' using errcode='55000'; end if;
  perform private.require_active_broker(organisation_id,target_membership_id);
  update public.mortgage_households h set owner_membership_id=target_membership_id,
    updated_at=transaction_timestamp(),version=h.version+1
  where h.organisation_id=organisation_id and h.id=household_id;
  update public.mortgage_minimal_loan_records l set owner_membership_id=target_membership_id,
    updated_at=transaction_timestamp(),version=l.version+1
  where l.organisation_id=organisation_id and l.household_id=household_id;
  get diagnostics loan_count=row_count;
  select coalesce(jsonb_agg(jsonb_build_object('opportunityId',o.id,
    'ownerMembershipId',o.owner_membership_id) order by o.id),'[]'::jsonb)
    into opportunity_assignments from public.opportunities o
    where o.organisation_id=organisation_id and o.subject_type='mortgage.household' and o.subject_id=household_id;
  select coalesce(jsonb_agg(jsonb_build_object('taskId',t.id,
    'assignedMembershipId',t.assigned_membership_id) order by t.id),'[]'::jsonb)
    into task_assignments from public.tasks t
    where t.organisation_id=organisation_id and t.household_id=household_id;
  insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,
    actor_membership_id,occurred_at,details)
  values(organisation_id,'mortgage.household',household_id,'household.owner_assigned',
    'Household owner assigned',actor_membership,transaction_timestamp(),jsonb_build_object(
      'previousOwnerMembershipId',target.owner_membership_id,'newOwnerMembershipId',target_membership_id,
      'loanOwnersUpdated',loan_count,'opportunityAssignmentsUnchanged',opportunity_assignments,
      'taskAssignmentsUnchanged',task_assignments,'previousVersion',target.version,'newVersion',target.version+1));
  result:=jsonb_build_object('householdId',household_id,'ownerMembershipId',target_membership_id,
    'loanOwnersUpdated',loan_count,'version',target.version+1);
  return private.finish_operation_command(organisation_id,command_id,result);
end
$$;

create or replace function public.update_mortgage_primary_contact(
  organisation_id uuid,command_id uuid,household_id uuid,expected_household_version integer,
  expected_contact_version integer,email text,phone text,preferred_contact_method text
) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor_membership uuid; previous_result jsonb; household public.mortgage_households%rowtype;
  target public.contacts%rowtype; normal_email text:=private.normalise_contact_email(email);
  normal_phone text:=private.normalise_contact_phone(phone); collision uuid; result jsonb;
begin
  actor_membership:=private.require_operation_actor(organisation_id,'contact.update');
  if not private.has_capability(organisation_id,'mortgage.household.update') then
    raise exception 'CAPABILITY_REQUIRED:mortgage.household.update' using errcode='42501'; end if;
  previous_result:=private.begin_operation_command_checked(organisation_id,command_id,
    'mortgage.primary-contact-update',actor_membership,jsonb_build_object(
      'householdId',household_id,'expectedHouseholdVersion',expected_household_version,
      'expectedContactVersion',expected_contact_version,'email',normal_email,'phone',normal_phone,
      'preferredContactMethod',preferred_contact_method));
  if previous_result is not null then return previous_result; end if;
  household:=private.require_household_maintenance_access(organisation_id,household_id,actor_membership,true);
  if household.version<>expected_household_version then raise exception 'STALE_HOUSEHOLD_VERSION' using errcode='40001'; end if;
  select * into target from public.contacts c
  where c.organisation_id=organisation_id and c.id=household.primary_contact_id for update;
  if target.version<>expected_contact_version then raise exception 'STALE_CONTACT_VERSION' using errcode='40001'; end if;
  if preferred_contact_method not in ('Phone','Email','SMS')
     or (normal_email is null and normal_phone is null)
     or (normal_email is not null and normal_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$')
     or (normal_phone is not null and length(normal_phone)<8) then
    raise exception 'VALID_CONTACT_REQUIRED' using errcode='22023'; end if;
  select c.id into collision from public.contacts c
  where c.organisation_id=organisation_id and c.id<>target.id
    and ((normal_email is not null and c.email_normalized=normal_email)
      or (normal_phone is not null and c.phone_normalized=normal_phone))
  order by c.id limit 1;
  if collision is not null then raise exception 'CONTACT_DETAIL_COLLISION:%',collision using errcode='23505'; end if;
  begin
    update public.contacts c set email=normal_email,email_normalized=normal_email,
      phone=nullif(btrim(update_mortgage_primary_contact.phone),''),phone_normalized=normal_phone,
      preferred_contact_method=update_mortgage_primary_contact.preferred_contact_method,
      updated_at=transaction_timestamp(),version=c.version+1
    where c.organisation_id=organisation_id and c.id=target.id;
  exception when unique_violation then raise exception 'CONTACT_DETAIL_COLLISION' using errcode='23505'; end;
  insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,
    actor_membership_id,occurred_at,details)
  values(organisation_id,'mortgage.household',household_id,'contact.details_changed',
    'Primary contact details changed',actor_membership,transaction_timestamp(),jsonb_build_object(
      'contactId',target.id,'previousEmail',target.email,'newEmail',normal_email,
      'previousPhone',target.phone,'newPhone',nullif(btrim(phone),''),
      'previousPreferredContactMethod',target.preferred_contact_method,
      'newPreferredContactMethod',preferred_contact_method,
      'consentEvidenceChanged',false,'previousVersion',target.version,'newVersion',target.version+1));
  result:=jsonb_build_object('householdId',household_id,'contactId',target.id,
    'contactVersion',target.version+1,'householdVersion',household.version);
  return private.finish_operation_command(organisation_id,command_id,result);
end
$$;

create or replace function public.add_mortgage_household_member(
  organisation_id uuid,command_id uuid,household_id uuid,expected_household_version integer,
  member_mode text,existing_contact_id uuid,first_name text,last_name text,email text,phone text,
  preferred_contact_method text,relationship text,name_match_acknowledged boolean
) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor_membership uuid; previous_result jsonb; household public.mortgage_households%rowtype;
  contact_id uuid; result jsonb;
begin
  actor_membership:=private.require_operation_actor(organisation_id,'mortgage.household.update');
  previous_result:=private.begin_operation_command_checked(organisation_id,command_id,
    'mortgage.household-member-add',actor_membership,jsonb_build_object(
      'householdId',household_id,'expectedHouseholdVersion',expected_household_version,
      'memberMode',member_mode,'existingContactId',existing_contact_id,
      'firstName',btrim(first_name),'lastName',btrim(last_name),
      'email',private.normalise_contact_email(email),'phone',private.normalise_contact_phone(phone),
      'preferredContactMethod',preferred_contact_method,'relationship',relationship,
      'nameMatchAcknowledged',coalesce(name_match_acknowledged,false)));
  if previous_result is not null then return previous_result; end if;
  household:=private.require_household_maintenance_access(organisation_id,household_id,actor_membership,true);
  if household.version<>expected_household_version then raise exception 'STALE_HOUSEHOLD_VERSION' using errcode='40001'; end if;
  if relationship not in ('Joint applicant','Guarantor','Other') then
    raise exception 'VALID_HOUSEHOLD_RELATIONSHIP_REQUIRED' using errcode='22023'; end if;
  if member_mode='existing' then
    select c.id into contact_id from public.contacts c where c.organisation_id=organisation_id
      and c.id=existing_contact_id and c.status='Active' for share;
    if contact_id is null then raise exception 'ACTIVE_HOUSEHOLD_CONTACT_REQUIRED' using errcode='23503'; end if;
  elsif member_mode='new' then
    contact_id:=private.create_manual_contact(organisation_id,actor_membership,
      first_name,last_name,email,phone,preferred_contact_method,name_match_acknowledged,
      'Manual household member creation');
  else raise exception 'VALID_MEMBER_MODE_REQUIRED' using errcode='22023'; end if;
  if exists(select 1 from public.mortgage_household_members hm
    where hm.organisation_id=organisation_id and hm.household_id=household_id and hm.contact_id=contact_id) then
    raise exception 'CONTACT_ALREADY_HOUSEHOLD_MEMBER' using errcode='23505'; end if;
  insert into public.mortgage_household_members(organisation_id,household_id,contact_id,relationship,is_primary)
  values(organisation_id,household_id,contact_id,relationship,false);
  update public.mortgage_households h set updated_at=transaction_timestamp(),version=h.version+1
  where h.organisation_id=organisation_id and h.id=household_id;
  insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,
    actor_membership_id,occurred_at,details)
  values(organisation_id,'mortgage.household',household_id,'household.member_added',
    'Household member added',actor_membership,transaction_timestamp(),jsonb_build_object(
      'contactId',contact_id,'relationship',relationship,'isPrimary',false,
      'previousVersion',household.version,'newVersion',household.version+1));
  result:=jsonb_build_object('householdId',household_id,'contactId',contact_id,
    'version',household.version+1);
  return private.finish_operation_command(organisation_id,command_id,result);
end
$$;

create or replace function public.transition_mortgage_household_status(
  organisation_id uuid,command_id uuid,household_id uuid,expected_version integer,
  target_status text
) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor_membership uuid; previous_result jsonb; target public.mortgage_households%rowtype; result jsonb;
begin
  actor_membership:=private.require_operation_actor(organisation_id,'mortgage.household.update');
  previous_result:=private.begin_operation_command_checked(organisation_id,command_id,
    'mortgage.household-status-transition',actor_membership,jsonb_build_object(
      'householdId',household_id,'expectedVersion',expected_version,'targetStatus',target_status));
  if previous_result is not null then return previous_result; end if;
  target:=private.require_household_maintenance_access(organisation_id,household_id,actor_membership,false);
  if target.version<>expected_version then raise exception 'STALE_HOUSEHOLD_VERSION' using errcode='40001'; end if;
  if target.status=target_status then raise exception 'HOUSEHOLD_STATUS_NO_OP' using errcode='55000'; end if;
  if target.status='Active' and target_status='Archived' then
    if exists(select 1 from public.mortgage_review_opportunities r
      join public.opportunities o on o.organisation_id=r.organisation_id and o.id=r.opportunity_id
      where r.organisation_id=organisation_id and r.household_id=household_id
        and o.lifecycle_status in ('Upcoming','Due','Overdue','Review booked')) then
      raise exception 'HOUSEHOLD_ARCHIVE_OPEN_OPPORTUNITIES' using errcode='55000'; end if;
    if exists(select 1 from public.tasks t where t.organisation_id=organisation_id
      and t.household_id=household_id and t.status='Open') then
      raise exception 'HOUSEHOLD_ARCHIVE_OPEN_TASKS' using errcode='55000'; end if;
  elsif not (target.status='Archived' and target_status='Active') then
    raise exception 'VALID_HOUSEHOLD_STATUS_TRANSITION_REQUIRED' using errcode='22023';
  end if;
  update public.mortgage_households h set status=target_status,updated_at=transaction_timestamp(),version=h.version+1
  where h.organisation_id=organisation_id and h.id=household_id;
  insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,
    actor_membership_id,occurred_at,details)
  values(organisation_id,'mortgage.household',household_id,
    case when target_status='Archived' then 'household.archived' else 'household.reactivated' end,
    case when target_status='Archived' then 'Household archived' else 'Household reactivated' end,
    actor_membership,transaction_timestamp(),jsonb_build_object('previousStatus',target.status,
      'newStatus',target_status,'previousVersion',target.version,'newVersion',target.version+1));
  result:=jsonb_build_object('householdId',household_id,'status',target_status,'version',target.version+1);
  return private.finish_operation_command(organisation_id,command_id,result);
end
$$;

create or replace function public.transition_mortgage_household_task(
  organisation_id uuid,command_id uuid,task_id uuid,expected_version integer,target_status text
) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor_membership uuid; previous_result jsonb; target public.tasks%rowtype; result jsonb;
begin
  actor_membership:=private.require_operation_actor(organisation_id,'task.update');
  previous_result:=private.begin_operation_command_checked(organisation_id,command_id,
    'mortgage.household-task-transition',actor_membership,jsonb_build_object(
      'taskId',task_id,'expectedVersion',expected_version,'targetStatus',target_status));
  if previous_result is not null then return previous_result; end if;
  select * into target from public.tasks t where t.organisation_id=organisation_id
    and t.id=task_id and t.household_id is not null for update;
  if not found then raise exception 'HOUSEHOLD_TASK_NOT_FOUND' using errcode='P0002'; end if;
  if target.version<>expected_version then raise exception 'STALE_TASK_VERSION' using errcode='40001'; end if;
  if target.assigned_membership_id<>actor_membership
     and not private.has_capability(organisation_id,'mortgage.household.assign') then
    raise exception 'TASK_ASSIGNEE_OR_ADMIN_REQUIRED' using errcode='42501'; end if;
  if target.status=target_status then raise exception 'TASK_STATUS_NO_OP' using errcode='55000'; end if;
  if target.status<>'Open' then raise exception 'TASK_TERMINAL' using errcode='55000'; end if;
  if target_status not in ('Completed','Cancelled') then raise exception 'VALID_TASK_TRANSITION_REQUIRED' using errcode='22023'; end if;
  update public.tasks t set status=target_status,updated_at=transaction_timestamp(),version=t.version+1
  where t.organisation_id=organisation_id and t.id=task_id;
  insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,
    actor_membership_id,occurred_at,details)
  values(organisation_id,'mortgage.household',target.household_id,'task.status_changed',
    'Household task status changed',actor_membership,transaction_timestamp(),jsonb_build_object(
      'taskId',task_id,'previousStatus',target.status,'newStatus',target_status,
      'assignedMembershipId',target.assigned_membership_id,
      'previousVersion',target.version,'newVersion',target.version+1));
  result:=jsonb_build_object('taskId',task_id,'householdId',target.household_id,
    'status',target_status,'version',target.version+1);
  return private.finish_operation_command(organisation_id,command_id,result);
end
$$;

-- Existing household-task creation now returns and stores version 1 and rejects
-- archived/inactive households.
create or replace function public.create_mortgage_household_task(
  organisation_id uuid,command_id uuid,household_id uuid,title text,due_at timestamptz,
  priority text,assigned_membership_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor_membership uuid; previous_result jsonb; target_household public.mortgage_households%rowtype;
  task_id uuid:=gen_random_uuid(); result jsonb;
begin
  actor_membership:=private.require_operation_actor(organisation_id,'task.create');
  if not private.has_capability(organisation_id,'mortgage.household.update') then
    raise exception 'CAPABILITY_REQUIRED:mortgage.household.update' using errcode='42501'; end if;
  previous_result:=private.begin_operation_command_checked(organisation_id,command_id,
    'mortgage.household-task-create',actor_membership,jsonb_build_object('householdId',household_id,
      'title',btrim(title),'dueAt',due_at,'priority',priority,'assignedMembershipId',assigned_membership_id));
  if previous_result is not null then return previous_result; end if;
  target_household:=private.require_household_maintenance_access(organisation_id,household_id,actor_membership,true);
  if nullif(btrim(title),'') is null or due_at is null or priority not in ('Normal','High') then
    raise exception 'VALID_TASK_REQUIRED' using errcode='22023'; end if;
  if not exists(select 1 from public.organisation_memberships m where m.organisation_id=organisation_id
    and m.id=assigned_membership_id and m.status='Active') then
    raise exception 'ACTIVE_TASK_ASSIGNEE_REQUIRED' using errcode='23503'; end if;
  insert into public.tasks(id,organisation_id,household_id,assigned_membership_id,
    created_by_membership_id,title,due_at,priority,status,created_at,updated_at,version)
  values(task_id,organisation_id,household_id,assigned_membership_id,actor_membership,
    btrim(title),due_at,priority,'Open',transaction_timestamp(),transaction_timestamp(),1);
  insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,
    actor_membership_id,occurred_at,details)
  values(organisation_id,'mortgage.household',household_id,'task.created',
    'Household follow-up task created',actor_membership,transaction_timestamp(),
    jsonb_build_object('householdId',household_id,'taskId',task_id,
      'assignedMembershipId',assigned_membership_id,'dueAt',due_at,'priority',priority,'version',1));
  result:=jsonb_build_object('taskId',task_id,'householdId',household_id,'version',1);
  return private.finish_operation_command(organisation_id,command_id,result);
end
$$;

-- Defense in depth: child creation/update is rejected after archival even if a
-- future privileged path forgets to perform the ordinary operation check.
create or replace function private.reject_archived_household_child_mutation()
returns trigger language plpgsql security definer set search_path='' as $$
declare target_household_id uuid;
begin
  target_household_id:=new.household_id;
  if exists(select 1 from public.mortgage_households h
    where h.organisation_id=new.organisation_id and h.id=target_household_id and h.status='Archived') then
    raise exception 'ARCHIVED_HOUSEHOLD_MUTATION_REJECTED' using errcode='55000';
  end if;
  return new;
end
$$;
revoke all on function private.reject_archived_household_child_mutation() from public,anon,authenticated;
drop trigger if exists reject_archived_household_loan_mutation on public.mortgage_minimal_loan_records;
create trigger reject_archived_household_loan_mutation before insert or update
  on public.mortgage_minimal_loan_records for each row
  execute function private.reject_archived_household_child_mutation();
drop trigger if exists reject_archived_household_member_mutation on public.mortgage_household_members;
create trigger reject_archived_household_member_mutation before insert or update
  on public.mortgage_household_members for each row
  execute function private.reject_archived_household_child_mutation();
drop trigger if exists reject_archived_household_task_creation on public.tasks;
create trigger reject_archived_household_task_creation before insert
  on public.tasks for each row when (new.household_id is not null)
  execute function private.reject_archived_household_child_mutation();

revoke all on function public.create_mortgage_household_manual(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,text,boolean,text,uuid,text,text,text,text,text,text,boolean) from public,anon;
grant execute on function public.create_mortgage_household_manual(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,text,boolean,text,uuid,text,text,text,text,text,text,boolean) to authenticated;
revoke all on function public.update_mortgage_household_details(uuid,uuid,uuid,integer,text,uuid) from public,anon;
grant execute on function public.update_mortgage_household_details(uuid,uuid,uuid,integer,text,uuid) to authenticated;
revoke all on function public.assign_mortgage_household_owner(uuid,uuid,uuid,integer,uuid) from public,anon;
grant execute on function public.assign_mortgage_household_owner(uuid,uuid,uuid,integer,uuid) to authenticated;
revoke all on function public.update_mortgage_primary_contact(uuid,uuid,uuid,integer,integer,text,text,text) from public,anon;
grant execute on function public.update_mortgage_primary_contact(uuid,uuid,uuid,integer,integer,text,text,text) to authenticated;
revoke all on function public.add_mortgage_household_member(uuid,uuid,uuid,integer,text,uuid,text,text,text,text,text,text,boolean) from public,anon;
grant execute on function public.add_mortgage_household_member(uuid,uuid,uuid,integer,text,uuid,text,text,text,text,text,text,boolean) to authenticated;
revoke all on function public.transition_mortgage_household_status(uuid,uuid,uuid,integer,text) from public,anon;
grant execute on function public.transition_mortgage_household_status(uuid,uuid,uuid,integer,text) to authenticated;
revoke all on function public.transition_mortgage_household_task(uuid,uuid,uuid,integer,text) from public,anon;
grant execute on function public.transition_mortgage_household_task(uuid,uuid,uuid,integer,text) to authenticated;
revoke all on function public.create_mortgage_household_task(uuid,uuid,uuid,text,timestamptz,text,uuid) from public,anon;
grant execute on function public.create_mortgage_household_task(uuid,uuid,uuid,text,timestamptz,text,uuid) to authenticated;
