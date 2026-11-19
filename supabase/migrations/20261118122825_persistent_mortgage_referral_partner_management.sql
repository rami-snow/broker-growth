-- Broker Growth Desk Milestone 4F: persistent mortgage referral-partner
-- management and attribution. Mortgage relationship semantics remain vertical-owned.

alter table public.mortgage_referral_partners
  add column name_normalized text,
  add column organisation_name_normalized text,
  add column email_normalized text,
  add column phone_normalized text,
  add column version integer not null default 1 check (version > 0);

create or replace function private.normalise_referral_text(value text)
returns text language sql immutable set search_path='' as $$
  select nullif(regexp_replace(lower(btrim(coalesce(value,''))),'[[:space:]]+',' ','g'),'')
$$;
create or replace function private.normalise_referral_email(value text)
returns text language sql immutable set search_path='' as $$
  select nullif(lower(btrim(coalesce(value,''))),'')
$$;
create or replace function private.normalise_referral_phone(value text)
returns text language sql immutable set search_path='' as $$
  select nullif(regexp_replace(coalesce(value,''),'[^0-9]','','g'),'')
$$;
revoke all on function private.normalise_referral_text(text),
  private.normalise_referral_email(text),private.normalise_referral_phone(text)
  from public,anon,authenticated;

create or replace function private.normalise_mortgage_referral_partner()
returns trigger language plpgsql set search_path='' as $$
begin
  new.name:=btrim(new.name);
  new.organisation_name:=nullif(btrim(new.organisation_name),'');
  new.email:=nullif(lower(btrim(new.email)),'');
  new.phone:=nullif(btrim(new.phone),'');
  new.name_normalized:=private.normalise_referral_text(new.name);
  new.organisation_name_normalized:=private.normalise_referral_text(new.organisation_name);
  new.email_normalized:=private.normalise_referral_email(new.email);
  new.phone_normalized:=private.normalise_referral_phone(new.phone);
  return new;
end
$$;
revoke all on function private.normalise_mortgage_referral_partner()
  from public,anon,authenticated;

create trigger normalise_mortgage_referral_partner
before insert or update of name,organisation_name,email,phone
on public.mortgage_referral_partners for each row
execute function private.normalise_mortgage_referral_partner();

update public.mortgage_referral_partners set
  name=name,organisation_name=organisation_name,email=email,phone=phone;

alter table public.mortgage_referral_partners
  alter column name_normalized set not null,
  alter column owner_membership_id set not null,
  add constraint mortgage_referral_partner_name_present
    check (name_normalized <> ''),
  add constraint mortgage_referral_partner_email_valid
    check (email is null or email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  add constraint mortgage_referral_partner_phone_valid
    check (phone is null or length(phone_normalized) >= 8);

create index mortgage_referral_partner_directory_idx
  on public.mortgage_referral_partners(organisation_id,status,partner_type,name_normalized,id);
create unique index mortgage_referral_partner_email_unique
  on public.mortgage_referral_partners(organisation_id,email_normalized)
  where email_normalized is not null;
create index mortgage_referral_partner_owner_idx
  on public.mortgage_referral_partners(organisation_id,owner_membership_id);
create index mortgage_lead_details_referral_idx
  on public.mortgage_lead_details(organisation_id,referral_partner_id)
  where referral_partner_id is not null;
create index mortgage_households_referral_idx
  on public.mortgage_households(organisation_id,referral_partner_id)
  where referral_partner_id is not null;

-- Client Book list rows carry only their targeted linked referral display.
-- This preserves inactive history without broad inactive-directory downloads.
create or replace function public.list_mortgage_households(
  p_organisation_id uuid,p_search text default null,p_status text default null,
  p_owner_membership_id uuid default null,p_sort text default 'name',
  p_page integer default 1,p_page_size integer default 25
) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare v_search text:=nullif(lower(btrim(p_search)),'');
  v_page integer:=least(greatest(coalesce(p_page,1),1),1000000);
  v_page_size integer:=least(greatest(coalesce(p_page_size,25),1),50);
  v_total bigint;v_rows jsonb;
begin
  if p_sort not in ('name','recent') then raise exception 'INVALID_CLIENT_BOOK_SORT' using errcode='22023'; end if;
  if p_status is not null and p_status not in ('Active','Inactive','Archived') then raise exception 'INVALID_HOUSEHOLD_STATUS' using errcode='22023'; end if;
  select count(*) into v_total from public.mortgage_households h
  where h.organisation_id=p_organisation_id
    and (p_status is null or h.status=p_status)
    and (p_owner_membership_id is null or h.owner_membership_id=p_owner_membership_id)
    and (v_search is null or position(v_search in lower(h.display_name))>0 or exists(
      select 1 from public.mortgage_household_members hm join public.contacts c
        on c.organisation_id=hm.organisation_id and c.id=hm.contact_id
      where hm.organisation_id=h.organisation_id and hm.household_id=h.id and (
        position(v_search in lower(btrim(c.given_name)||' '||btrim(c.family_name)))>0
        or position(v_search in lower(coalesce(c.email,'')))>0
        or position(v_search in lower(coalesce(c.phone,'')))>0)));
  select coalesce(jsonb_agg(to_jsonb(page_rows)-'ordinal' order by page_rows.ordinal),'[]'::jsonb)
  into v_rows from(
    select row_number() over(order by
      case when p_sort='name' then lower(h.display_name) end,
      case when p_sort='recent' then h.created_at end desc,h.id) ordinal,
      h.id "id",h.display_name "displayName",h.status "status",
      h.owner_membership_id "ownerMembershipId",owner.display_name "ownerName",
      h.primary_contact_id "primaryContactId",
      btrim(primary_contact.given_name||' '||primary_contact.family_name) "primaryContactName",
      primary_contact.email "primaryContactEmail",primary_contact.phone "primaryContactPhone",
      h.referral_partner_id "referralPartnerId",referral.name "referralPartnerName",
      referral.status "referralPartnerStatus",h.created_at "createdAt",h.version "version"
    from public.mortgage_households h
    join public.contacts primary_contact on primary_contact.organisation_id=h.organisation_id and primary_contact.id=h.primary_contact_id
    join public.organisation_memberships owner on owner.organisation_id=h.organisation_id and owner.id=h.owner_membership_id
    left join public.mortgage_referral_partners referral on referral.organisation_id=h.organisation_id and referral.id=h.referral_partner_id
    where h.organisation_id=p_organisation_id
      and (p_status is null or h.status=p_status)
      and (p_owner_membership_id is null or h.owner_membership_id=p_owner_membership_id)
      and (v_search is null or position(v_search in lower(h.display_name))>0 or exists(
        select 1 from public.mortgage_household_members hm join public.contacts c
          on c.organisation_id=hm.organisation_id and c.id=hm.contact_id
        where hm.organisation_id=h.organisation_id and hm.household_id=h.id and (
          position(v_search in lower(btrim(c.given_name)||' '||btrim(c.family_name)))>0
          or position(v_search in lower(coalesce(c.email,'')))>0
          or position(v_search in lower(coalesce(c.phone,'')))>0)))
    order by case when p_sort='name' then lower(h.display_name) end,
      case when p_sort='recent' then h.created_at end desc,h.id
    limit v_page_size offset(v_page-1)*v_page_size
  )page_rows;
  return jsonb_build_object('rows',v_rows,'total',v_total,'page',v_page,'pageSize',v_page_size);
end
$$;

-- Referral records are read-only to browser roles. RLS remains the tenant and
-- mortgage.referral.view boundary for ordinary reads.
revoke insert,update,delete on public.mortgage_referral_partners from authenticated;

create or replace function private.require_referral_actor(
  target_organisation_id uuid,target_capability text
) returns uuid language plpgsql security definer set search_path='' as $$
declare actor_membership uuid;
begin
  actor_membership:=private.require_operation_actor(target_organisation_id,target_capability);
  if not private.has_capability(target_organisation_id,'mortgage.referral.view') then
    raise exception 'CAPABILITY_REQUIRED:mortgage.referral.view' using errcode='42501';
  end if;
  return actor_membership;
end
$$;
revoke all on function private.require_referral_actor(uuid,text) from public,anon,authenticated;

create or replace function public.preview_mortgage_referral_partner_duplicates(
  p_organisation_id uuid,p_name text,p_organisation_name text,p_email text
) returns table(
  referral_partner_id uuid,partner_name text,organisation_name text,
  email text,status text,reasons text[]
) language plpgsql stable security invoker set search_path='' as $$
declare n_name text:=private.normalise_referral_text(p_name);
  n_org text:=private.normalise_referral_text(p_organisation_name);
  n_email text:=private.normalise_referral_email(p_email);
begin
  perform private.require_referral_actor(p_organisation_id,'mortgage.referral.manage');
  if n_name is null then raise exception 'REFERRAL_NAME_REQUIRED' using errcode='22023'; end if;
  return query
  select r.id,r.name,r.organisation_name,r.email,r.status,
    array_remove(array[
      case when n_email is not null and r.email_normalized=n_email then 'exact_email' end,
      case when n_org is not null and r.name_normalized=n_name
        and r.organisation_name_normalized=n_org then 'normalized_name_and_organisation' end,
      case when n_org is null and r.name_normalized=n_name
        and r.organisation_name_normalized is null then 'exact_normalized_name_without_organisation' end
    ],null)::text[]
  from public.mortgage_referral_partners r
  where r.organisation_id=p_organisation_id and (
    (n_email is not null and r.email_normalized=n_email)
    or (n_org is not null and r.name_normalized=n_name and r.organisation_name_normalized=n_org)
    or (n_org is null and r.name_normalized=n_name and r.organisation_name_normalized is null)
  ) order by r.name_normalized,r.id;
end
$$;
revoke all on function public.preview_mortgage_referral_partner_duplicates(uuid,text,text,text)
  from public,anon;
grant execute on function public.preview_mortgage_referral_partner_duplicates(uuid,text,text,text)
  to authenticated;

create or replace function public.create_mortgage_referral_partner(
  organisation_id uuid,command_id uuid,name text,organisation_name text,
  partner_type text,email text,phone text,owner_membership_id uuid,
  duplicate_name_acknowledged boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor_membership uuid;previous_result jsonb;partner_id uuid:=gen_random_uuid();
  n_name text:=private.normalise_referral_text(name);
  n_org text:=private.normalise_referral_text(organisation_name);
  n_email text:=private.normalise_referral_email(email);result jsonb;
begin
  actor_membership:=private.require_referral_actor(organisation_id,'mortgage.referral.manage');
  previous_result:=private.begin_operation_command_checked(organisation_id,command_id,
    'mortgage.referral.create',actor_membership,jsonb_build_object(
      'name',n_name,'organisationName',n_org,'partnerType',partner_type,'email',n_email,
      'phone',private.normalise_referral_phone(phone),'ownerMembershipId',owner_membership_id,
      'duplicateNameAcknowledged',duplicate_name_acknowledged));
  if previous_result is not null then return previous_result; end if;
  if n_name is null then raise exception 'REFERRAL_NAME_REQUIRED' using errcode='22023'; end if;
  if partner_type not in ('Accountant','Real estate agent','Buyer’s agent','Financial adviser','Conveyancer','Existing client','Other') then
    raise exception 'VALID_REFERRAL_PARTNER_TYPE_REQUIRED' using errcode='22023'; end if;
  perform private.require_active_broker(organisation_id,owner_membership_id);
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    organisation_id::text||':mortgage-referral-duplicate',0));
  if n_email is not null and exists(select 1 from public.mortgage_referral_partners r
    where r.organisation_id=organisation_id and r.email_normalized=n_email) then
    raise exception 'REFERRAL_EXACT_EMAIL_DUPLICATE' using errcode='23505'; end if;
  if not duplicate_name_acknowledged and exists(
    select 1 from public.mortgage_referral_partners r where r.organisation_id=organisation_id
      and r.name_normalized=n_name and (
        (n_org is not null and r.organisation_name_normalized=n_org)
        or (n_org is null and r.organisation_name_normalized is null))) then
    raise exception 'REFERRAL_NAME_DUPLICATE_ACKNOWLEDGEMENT_REQUIRED' using errcode='23505'; end if;
  insert into public.mortgage_referral_partners(
    id,organisation_id,name,organisation_name,partner_type,email,phone,
    owner_membership_id,status,created_at,updated_at,version)
  values(partner_id,organisation_id,name,organisation_name,partner_type,email,phone,
    owner_membership_id,'Active',transaction_timestamp(),transaction_timestamp(),1);
  insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,
    actor_membership_id,occurred_at,details)
  values(organisation_id,'mortgage.referral_partner',partner_id,'referral_partner.created',
    'Referral partner created',actor_membership,transaction_timestamp(),jsonb_build_object(
      'referralPartnerId',partner_id,'ownerMembershipId',owner_membership_id,
      'partnerType',partner_type,'status','Active'));
  result:=jsonb_build_object('referralPartnerId',partner_id,'version',1,'status','Active');
  return private.finish_operation_command(organisation_id,command_id,result);
end
$$;

create or replace function public.update_mortgage_referral_partner(
  organisation_id uuid,command_id uuid,referral_partner_id uuid,expected_version integer,
  name text,organisation_name text,partner_type text,email text,phone text
) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor_membership uuid;previous_result jsonb;target public.mortgage_referral_partners%rowtype;
  n_email text:=private.normalise_referral_email(email);result jsonb;
begin
  actor_membership:=private.require_referral_actor(organisation_id,'mortgage.referral.manage');
  previous_result:=private.begin_operation_command_checked(organisation_id,command_id,
    'mortgage.referral.update',actor_membership,jsonb_build_object(
      'referralPartnerId',referral_partner_id,'expectedVersion',expected_version,
      'name',private.normalise_referral_text(name),'organisationName',private.normalise_referral_text(organisation_name),
      'partnerType',partner_type,'email',n_email,'phone',private.normalise_referral_phone(phone)));
  if previous_result is not null then return previous_result; end if;
  select * into target from public.mortgage_referral_partners r
    where r.organisation_id=organisation_id and r.id=referral_partner_id for update;
  if not found then raise exception 'REFERRAL_PARTNER_NOT_FOUND' using errcode='P0002'; end if;
  if target.version<>expected_version then raise exception 'STALE_REFERRAL_PARTNER_VERSION' using errcode='40001'; end if;
  if private.normalise_referral_text(name) is null then raise exception 'REFERRAL_NAME_REQUIRED' using errcode='22023'; end if;
  if partner_type not in ('Accountant','Real estate agent','Buyer’s agent','Financial adviser','Conveyancer','Existing client','Other') then
    raise exception 'VALID_REFERRAL_PARTNER_TYPE_REQUIRED' using errcode='22023'; end if;
  if n_email is not null and exists(select 1 from public.mortgage_referral_partners r
    where r.organisation_id=organisation_id and r.email_normalized=n_email and r.id<>referral_partner_id) then
    raise exception 'REFERRAL_EXACT_EMAIL_DUPLICATE' using errcode='23505'; end if;
  update public.mortgage_referral_partners r set name=update_mortgage_referral_partner.name,
    organisation_name=update_mortgage_referral_partner.organisation_name,
    partner_type=update_mortgage_referral_partner.partner_type,email=update_mortgage_referral_partner.email,
    phone=update_mortgage_referral_partner.phone,updated_at=transaction_timestamp(),version=version+1
    where r.organisation_id=organisation_id and r.id=referral_partner_id;
  insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,
    actor_membership_id,occurred_at,details)
  values(organisation_id,'mortgage.referral_partner',referral_partner_id,'referral_partner.updated',
    'Referral partner details updated',actor_membership,transaction_timestamp(),jsonb_build_object(
      'referralPartnerId',referral_partner_id,'previousVersion',expected_version,'version',expected_version+1));
  result:=jsonb_build_object('referralPartnerId',referral_partner_id,'version',expected_version+1,'status',target.status);
  return private.finish_operation_command(organisation_id,command_id,result);
end
$$;

create or replace function public.assign_mortgage_referral_partner_owner(
  organisation_id uuid,command_id uuid,referral_partner_id uuid,expected_version integer,
  target_membership_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor_membership uuid;previous_result jsonb;target public.mortgage_referral_partners%rowtype;result jsonb;
begin
  actor_membership:=private.require_referral_actor(organisation_id,'mortgage.referral.manage');
  previous_result:=private.begin_operation_command_checked(organisation_id,command_id,
    'mortgage.referral.assign',actor_membership,jsonb_build_object('referralPartnerId',referral_partner_id,
      'expectedVersion',expected_version,'targetMembershipId',target_membership_id));
  if previous_result is not null then return previous_result; end if;
  select * into target from public.mortgage_referral_partners r
    where r.organisation_id=organisation_id and r.id=referral_partner_id for update;
  if not found then raise exception 'REFERRAL_PARTNER_NOT_FOUND' using errcode='P0002'; end if;
  if target.version<>expected_version then raise exception 'STALE_REFERRAL_PARTNER_VERSION' using errcode='40001'; end if;
  perform private.require_active_broker(organisation_id,target_membership_id);
  if target.owner_membership_id=target_membership_id then raise exception 'REFERRAL_OWNER_NO_OP' using errcode='22023'; end if;
  update public.mortgage_referral_partners r set owner_membership_id=target_membership_id,
    updated_at=transaction_timestamp(),version=version+1
    where r.organisation_id=organisation_id and r.id=referral_partner_id;
  insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,
    actor_membership_id,occurred_at,details)
  values(organisation_id,'mortgage.referral_partner',referral_partner_id,'referral_partner.owner_assigned',
    'Referral partner owner assigned',actor_membership,transaction_timestamp(),jsonb_build_object(
      'referralPartnerId',referral_partner_id,'previousOwnerMembershipId',target.owner_membership_id,
      'newOwnerMembershipId',target_membership_id,'version',expected_version+1));
  result:=jsonb_build_object('referralPartnerId',referral_partner_id,'version',expected_version+1,'status',target.status);
  return private.finish_operation_command(organisation_id,command_id,result);
end
$$;

create or replace function public.transition_mortgage_referral_partner(
  organisation_id uuid,command_id uuid,referral_partner_id uuid,expected_version integer,
  target_status text
) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor_membership uuid;previous_result jsonb;target public.mortgage_referral_partners%rowtype;result jsonb;
begin
  actor_membership:=private.require_referral_actor(organisation_id,'mortgage.referral.manage');
  previous_result:=private.begin_operation_command_checked(organisation_id,command_id,
    'mortgage.referral.transition',actor_membership,jsonb_build_object('referralPartnerId',referral_partner_id,
      'expectedVersion',expected_version,'targetStatus',target_status));
  if previous_result is not null then return previous_result; end if;
  select * into target from public.mortgage_referral_partners r
    where r.organisation_id=organisation_id and r.id=referral_partner_id for update;
  if not found then raise exception 'REFERRAL_PARTNER_NOT_FOUND' using errcode='P0002'; end if;
  if target.version<>expected_version then raise exception 'STALE_REFERRAL_PARTNER_VERSION' using errcode='40001'; end if;
  if target_status not in ('Active','Inactive') then raise exception 'INVALID_REFERRAL_STATUS_TRANSITION' using errcode='22023'; end if;
  if target.status=target_status then raise exception 'REFERRAL_STATUS_NO_OP' using errcode='22023'; end if;
  update public.mortgage_referral_partners r set status=target_status,
    updated_at=transaction_timestamp(),version=version+1
    where r.organisation_id=organisation_id and r.id=referral_partner_id;
  insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,
    actor_membership_id,occurred_at,details)
  values(organisation_id,'mortgage.referral_partner',referral_partner_id,
    case target_status when 'Inactive' then 'referral_partner.inactivated' else 'referral_partner.reactivated' end,
    case target_status when 'Inactive' then 'Referral partner inactivated' else 'Referral partner reactivated' end,
    actor_membership,transaction_timestamp(),jsonb_build_object('referralPartnerId',referral_partner_id,
      'previousStatus',target.status,'newStatus',target_status,'version',expected_version+1));
  result:=jsonb_build_object('referralPartnerId',referral_partner_id,'version',expected_version+1,'status',target_status);
  return private.finish_operation_command(organisation_id,command_id,result);
end
$$;

create or replace function public.set_mortgage_lead_referral_partner(
  organisation_id uuid,command_id uuid,lead_id uuid,expected_version integer,
  referral_partner_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor_membership uuid;previous_result jsonb;target_lead public.leads%rowtype;
  previous_partner_id uuid;result jsonb;
begin
  actor_membership:=private.require_operation_actor(organisation_id,'lead.update');
  if not private.has_capability(organisation_id,'mortgage.referral.view') then
    raise exception 'CAPABILITY_REQUIRED:mortgage.referral.view' using errcode='42501'; end if;
  previous_result:=private.begin_operation_command_checked(organisation_id,command_id,
    'mortgage.lead-referral.set',actor_membership,jsonb_build_object('leadId',lead_id,
      'expectedVersion',expected_version,'referralPartnerId',referral_partner_id));
  if previous_result is not null then return previous_result; end if;
  target_lead:=private.require_lead_access(organisation_id,lead_id,expected_version,actor_membership,true);
  select d.referral_partner_id into previous_partner_id from public.mortgage_lead_details d
    where d.organisation_id=organisation_id and d.lead_id=lead_id for update;
  if not found then raise exception 'MORTGAGE_LEAD_DETAILS_NOT_FOUND' using errcode='P0002'; end if;
  perform private.require_active_referral_partner(organisation_id,referral_partner_id);
  if previous_partner_id is not distinct from referral_partner_id then
    raise exception 'LEAD_REFERRAL_NO_OP' using errcode='22023'; end if;
  update public.mortgage_lead_details d set referral_partner_id=set_mortgage_lead_referral_partner.referral_partner_id
    where d.organisation_id=organisation_id and d.lead_id=lead_id;
  update public.leads l set updated_at=transaction_timestamp(),version=version+1
    where l.organisation_id=organisation_id and l.id=lead_id;
  insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,
    actor_membership_id,occurred_at,details)
  values(organisation_id,'lead',lead_id,'lead.referral_attribution_changed',
    case when referral_partner_id is null then 'Lead referral attribution cleared' else 'Lead referral attribution updated' end,
    actor_membership,transaction_timestamp(),jsonb_build_object('leadId',lead_id,
      'previousReferralPartnerId',previous_partner_id,'newReferralPartnerId',referral_partner_id,
      'version',expected_version+1));
  result:=jsonb_build_object('leadId',lead_id,'version',expected_version+1,
    'referralPartnerId',referral_partner_id);
  return private.finish_operation_command(organisation_id,command_id,result);
end
$$;

-- New household attribution must always point to a currently active partner.
-- Existing historical links are retained when a partner later becomes inactive.
create or replace function private.enforce_active_new_household_referral()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.referral_partner_id is not null and
     (tg_op='INSERT' or new.referral_partner_id is distinct from old.referral_partner_id) then
    perform private.require_active_referral_partner(new.organisation_id,new.referral_partner_id);
  end if;
  return new;
end
$$;
revoke all on function private.enforce_active_new_household_referral() from public,anon,authenticated;
create trigger enforce_active_new_household_referral
before insert or update of referral_partner_id on public.mortgage_households
for each row execute function private.enforce_active_new_household_referral();

-- Conversion attribution is recorded after both the source lead details and
-- final household selection are fixed, while still inside the atomic conversion.
create or replace function private.audit_mortgage_conversion_referral_attribution()
returns trigger language plpgsql security definer set search_path='' as $$
declare lead_partner_id uuid;household_partner_id uuid;
begin
  select d.referral_partner_id into lead_partner_id from public.mortgage_lead_details d
    where d.organisation_id=new.organisation_id and d.lead_id=new.lead_id;
  select h.referral_partner_id into household_partner_id from public.mortgage_households h
    where h.organisation_id=new.organisation_id and h.id=new.household_id;
  insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,
    actor_membership_id,occurred_at,details)
  values(new.organisation_id,'mortgage.household',new.household_id,
    'household.referral_attribution_recorded','Referral attribution recorded during lead conversion',
    new.converted_by_membership_id,new.converted_at,jsonb_build_object('leadId',new.lead_id,
      'householdId',new.household_id,'leadReferralPartnerId',lead_partner_id,
      'householdReferralPartnerId',household_partner_id));
  return new;
end
$$;
revoke all on function private.audit_mortgage_conversion_referral_attribution()
  from public,anon,authenticated;
create trigger audit_mortgage_conversion_referral_attribution
after insert on public.mortgage_lead_household_conversions
for each row execute function private.audit_mortgage_conversion_referral_attribution();

do $$
declare signature regprocedure;
begin
  foreach signature in array array[
    'public.create_mortgage_referral_partner(uuid,uuid,text,text,text,text,text,uuid,boolean)'::regprocedure,
    'public.update_mortgage_referral_partner(uuid,uuid,uuid,integer,text,text,text,text,text)'::regprocedure,
    'public.assign_mortgage_referral_partner_owner(uuid,uuid,uuid,integer,uuid)'::regprocedure,
    'public.transition_mortgage_referral_partner(uuid,uuid,uuid,integer,text)'::regprocedure,
    'public.set_mortgage_lead_referral_partner(uuid,uuid,uuid,integer,uuid)'::regprocedure
  ] loop
    execute format('revoke all on function %s from public,anon',signature);
    execute format('grant execute on function %s to authenticated',signature);
  end loop;
end
$$;
