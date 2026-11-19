-- Broker Growth Desk Milestone 4E.1: Client Book authorization and query boundaries.

-- Duplicate discovery exposes contact PII and household associations, so both
-- household creation and contact visibility are required even for zero rows.
create or replace function public.preview_mortgage_manual_contact_duplicates(
  p_organisation_id uuid,p_given_name text,p_family_name text,p_email text,p_phone text
) returns table(
  contact_id uuid,contact_name text,email text,phone text,reasons text[],households jsonb
) language plpgsql stable security definer set search_path='' as $$
#variable_conflict use_column
begin
  perform private.require_operation_actor(p_organisation_id,'mortgage.household.create');
  if not private.has_capability(p_organisation_id,'contact.view') then
    raise exception 'CAPABILITY_REQUIRED:contact.view' using errcode='42501';
  end if;
  return query
  with input as (
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
      ],null)::text[] match_reasons
    from public.contacts c cross join input i
    where c.organisation_id=p_organisation_id and (
      (i.email is not null and c.email_normalized=i.email)
      or (i.phone is not null and c.phone_normalized=i.phone)
      or (i.full_name<>' ' and private.normalise_contact_name(c.given_name,c.family_name)=i.full_name)
    )
  )
  select m.id,btrim(m.given_name)||' '||btrim(m.family_name),m.email,m.phone,m.match_reasons,
    coalesce((select jsonb_agg(jsonb_build_object(
      'householdId',h.id,'householdName',h.display_name,'householdStatus',h.status,
      'relationship',hm.relationship,'isPrimary',hm.is_primary
    ) order by h.display_name,h.id)
    from public.mortgage_household_members hm
    join public.mortgage_households h
      on h.organisation_id=hm.organisation_id and h.id=hm.household_id
    where hm.organisation_id=p_organisation_id and hm.contact_id=m.id),'[]'::jsonb)
  from matched m order by m.given_name,m.family_name,m.id;
end
$$;

-- Interactive lookup is deliberately capped and distinct from uncapped
-- duplicate review. SECURITY INVOKER keeps the contacts RLS policy in force.
create or replace function public.search_mortgage_contact_options(
  p_organisation_id uuid,p_search_term text,p_exclude_household_id uuid default null
) returns table(contact_id uuid,contact_name text,email text,phone text)
language plpgsql stable security invoker set search_path='' as $$
declare
  normalized_term text:=lower(regexp_replace(btrim(coalesce(p_search_term,'')),'[[:space:]]+',' ','g'));
  phone_term text:=regexp_replace(coalesce(p_search_term,''),'[^0-9]','','g');
begin
  if auth.uid() is null then raise exception 'AUTHENTICATION_REQUIRED' using errcode='42501'; end if;
  if not exists(
    select 1 from public.organisation_memberships m
    where m.organisation_id=p_organisation_id and m.user_id=auth.uid() and m.status='Active'
  ) then raise exception 'ACTIVE_ORGANISATION_MEMBERSHIP_REQUIRED' using errcode='42501'; end if;
  if not exists(
    select 1 from public.organisation_memberships m
    join public.membership_capabilities c
      on c.organisation_id=m.organisation_id and c.membership_id=m.id
    where m.organisation_id=p_organisation_id and m.user_id=auth.uid()
      and m.status='Active' and c.capability='contact.view'
  ) then raise exception 'CAPABILITY_REQUIRED:contact.view' using errcode='42501'; end if;
  if length(regexp_replace(normalized_term,'[[:space:]]','','g'))<2 then
    raise exception 'MEANINGFUL_CONTACT_SEARCH_REQUIRED' using errcode='22023'; end if;

  return query
  select c.id,btrim(c.given_name)||' '||btrim(c.family_name),c.email,c.phone
  from public.contacts c
  where c.organisation_id=p_organisation_id and c.status='Active'
    and (
      strpos(lower(btrim(c.given_name)||' '||btrim(c.family_name)),normalized_term)>0
      or strpos(coalesce(c.email_normalized,''),normalized_term)>0
      or (length(phone_term)>=2 and strpos(coalesce(c.phone_normalized,''),phone_term)>0)
    )
    and (p_exclude_household_id is null or not exists(
      select 1 from public.mortgage_household_members hm
      where hm.organisation_id=p_organisation_id
        and hm.household_id=p_exclude_household_id and hm.contact_id=c.id
    ))
  order by lower(c.given_name),lower(c.family_name),c.id
  limit 25;
end
$$;

-- Do not disclose matching contact identifiers through validation errors when
-- an actor is permitted to create a new contact but cannot view existing PII.
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
    raise exception 'EXACT_CONTACT_MATCH_REQUIRES_EXISTING' using errcode='23505';
  end if;
  select c.id into name_match from public.contacts c
  where c.organisation_id=target_organisation_id
    and private.normalise_contact_name(c.given_name,c.family_name)=normal_name
  order by c.id limit 1;
  if name_match is not null and not coalesce(name_match_acknowledged,false) then
    raise exception 'NAME_MATCH_ACKNOWLEDGEMENT_REQUIRED' using errcode='22023';
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
  if not private.has_capability(organisation_id,'mortgage.household.assign')
     and owner_membership_id<>actor_membership then
    raise exception 'HOUSEHOLD_OWNER_SELF_ASSIGNMENT_REQUIRED' using errcode='42501';
  end if;
  perform private.require_active_referral_partner(organisation_id,referral_partner_id);

  if primary_existing_contact_id is not null then
    if not private.has_capability(organisation_id,'contact.view') then
      raise exception 'CAPABILITY_REQUIRED:contact.view' using errcode='42501'; end if;
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
    if not private.has_capability(organisation_id,'contact.view') then
      raise exception 'CAPABILITY_REQUIRED:contact.view' using errcode='42501'; end if;
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
    if not private.has_capability(organisation_id,'contact.view') then
      raise exception 'CAPABILITY_REQUIRED:contact.view' using errcode='42501'; end if;
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

create or replace function public.claim_mortgage_review_opportunity(
  organisation_id uuid,command_id uuid,opportunity_id uuid,expected_version integer
) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor_membership uuid; previous_result jsonb; target public.opportunities%rowtype;
  review_link public.mortgage_review_opportunities%rowtype; household public.mortgage_households%rowtype; result jsonb;
begin
  actor_membership:=private.require_operation_actor(organisation_id,'mortgage.review-opportunity.manage');
  previous_result:=private.begin_operation_command_checked(organisation_id,command_id,
    'mortgage.review-opportunity-claim',actor_membership,
    jsonb_build_object('opportunityId',opportunity_id,'expectedVersion',expected_version));
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
  if not found or household.status<>'Active' then raise exception 'ACTIVE_HOUSEHOLD_REQUIRED' using errcode='55000'; end if;
  if target.version<>expected_version then raise exception 'STALE_OPPORTUNITY_VERSION' using errcode='40001'; end if;
  if target.owner_membership_id is not null then raise exception 'OPPORTUNITY_ALREADY_ASSIGNED' using errcode='55000'; end if;
  if target.lifecycle_status in ('Completed','Dismissed') then raise exception 'OPEN_OPPORTUNITY_REQUIRED' using errcode='55000'; end if;
  update public.opportunities o set owner_membership_id=actor_membership,
    updated_at=transaction_timestamp(),version=o.version+1
  where o.organisation_id=organisation_id and o.id=opportunity_id;
  insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,actor_membership_id,occurred_at,details)
  values(organisation_id,'mortgage.household',review_link.household_id,'opportunity.claimed','Review opportunity claimed',actor_membership,transaction_timestamp(),
    jsonb_build_object('householdId',review_link.household_id,'opportunityId',opportunity_id,'previousOwnerMembershipId',null,'newOwnerMembershipId',actor_membership,'previousVersion',target.version,'newVersion',target.version+1));
  result:=jsonb_build_object('opportunityId',opportunity_id,'householdId',review_link.household_id,'ownerMembershipId',actor_membership,'version',target.version+1);
  return private.finish_operation_command(organisation_id,command_id,result);
end
$$;

create or replace function public.assign_mortgage_review_opportunity(
  organisation_id uuid,command_id uuid,opportunity_id uuid,expected_version integer,
  target_membership_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor_membership uuid; previous_result jsonb; target public.opportunities%rowtype;
  review_link public.mortgage_review_opportunities%rowtype; household public.mortgage_households%rowtype; result jsonb;
begin
  actor_membership:=private.require_operation_actor(organisation_id,'mortgage.household.assign');
  previous_result:=private.begin_operation_command_checked(organisation_id,command_id,
    'mortgage.review-opportunity-assign',actor_membership,
    jsonb_build_object('opportunityId',opportunity_id,'expectedVersion',expected_version,'targetMembershipId',target_membership_id));
  if previous_result is not null then return previous_result; end if;
  if not exists(select 1 from public.organisation_memberships m
    join public.mortgage_membership_profiles p on p.organisation_id=m.organisation_id and p.membership_id=m.id
    where m.organisation_id=organisation_id and m.id=target_membership_id and m.status='Active' and p.position='Broker') then
    raise exception 'ACTIVE_BROKER_ASSIGNEE_REQUIRED' using errcode='23503'; end if;
  select o.* into target from public.opportunities o
  join public.mortgage_review_opportunities r on r.organisation_id=o.organisation_id and r.opportunity_id=o.id
  where o.organisation_id=organisation_id and o.id=opportunity_id for update of o;
  if not found then raise exception 'REVIEW_OPPORTUNITY_NOT_FOUND' using errcode='P0002'; end if;
  select r.* into review_link from public.mortgage_review_opportunities r
  where r.organisation_id=organisation_id and r.opportunity_id=opportunity_id;
  select h.* into household from public.mortgage_households h
  where h.organisation_id=organisation_id and h.id=review_link.household_id for update;
  if not found or household.status<>'Active' then raise exception 'ACTIVE_HOUSEHOLD_REQUIRED' using errcode='55000'; end if;
  if target.version<>expected_version then raise exception 'STALE_OPPORTUNITY_VERSION' using errcode='40001'; end if;
  if target.lifecycle_status='Completed' then raise exception 'COMPLETED_OPPORTUNITY_TERMINAL' using errcode='55000'; end if;
  update public.opportunities o set owner_membership_id=target_membership_id,
    updated_at=transaction_timestamp(),version=o.version+1
  where o.organisation_id=organisation_id and o.id=opportunity_id;
  insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,actor_membership_id,occurred_at,details)
  values(organisation_id,'mortgage.household',review_link.household_id,'opportunity.assigned','Review opportunity assigned',actor_membership,transaction_timestamp(),
    jsonb_build_object('householdId',review_link.household_id,'opportunityId',opportunity_id,'previousOwnerMembershipId',target.owner_membership_id,'newOwnerMembershipId',target_membership_id,'previousVersion',target.version,'newVersion',target.version+1));
  result:=jsonb_build_object('opportunityId',opportunity_id,'householdId',review_link.household_id,'ownerMembershipId',target_membership_id,'version',target.version+1);
  return private.finish_operation_command(organisation_id,command_id,result);
end
$$;

create or replace function public.transition_mortgage_review_opportunity(
  organisation_id uuid,command_id uuid,opportunity_id uuid,expected_version integer,
  target_status text,dismissal_reason text default null
) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
  actor_membership uuid; previous_result jsonb; target public.opportunities%rowtype;
  review_link public.mortgage_review_opportunities%rowtype; household public.mortgage_households%rowtype;
  business_date date:=(transaction_timestamp() at time zone 'Australia/Sydney')::date;
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

revoke all on function private.create_manual_contact(uuid,uuid,text,text,text,text,text,boolean,text)
  from public,anon,authenticated;
revoke all on function public.preview_mortgage_manual_contact_duplicates(uuid,text,text,text,text)
  from public,anon;
grant execute on function public.preview_mortgage_manual_contact_duplicates(uuid,text,text,text,text)
  to authenticated;
revoke all on function public.search_mortgage_contact_options(uuid,text,uuid)
  from public,anon;
grant execute on function public.search_mortgage_contact_options(uuid,text,uuid)
  to authenticated;
revoke all on function public.create_mortgage_household_manual(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,text,boolean,text,uuid,text,text,text,text,text,text,boolean)
  from public,anon;
grant execute on function public.create_mortgage_household_manual(uuid,uuid,text,uuid,uuid,uuid,text,text,text,text,text,boolean,text,uuid,text,text,text,text,text,text,boolean)
  to authenticated;
revoke all on function public.add_mortgage_household_member(uuid,uuid,uuid,integer,text,uuid,text,text,text,text,text,text,boolean)
  from public,anon;
grant execute on function public.add_mortgage_household_member(uuid,uuid,uuid,integer,text,uuid,text,text,text,text,text,text,boolean)
  to authenticated;
revoke all on function public.claim_mortgage_review_opportunity(uuid,uuid,uuid,integer)
  from public,anon;
grant execute on function public.claim_mortgage_review_opportunity(uuid,uuid,uuid,integer)
  to authenticated;
revoke all on function public.assign_mortgage_review_opportunity(uuid,uuid,uuid,integer,uuid)
  from public,anon;
grant execute on function public.assign_mortgage_review_opportunity(uuid,uuid,uuid,integer,uuid)
  to authenticated;
revoke all on function public.transition_mortgage_review_opportunity(uuid,uuid,uuid,integer,text,text)
  from public,anon;
grant execute on function public.transition_mortgage_review_opportunity(uuid,uuid,uuid,integer,text,text)
  to authenticated;
