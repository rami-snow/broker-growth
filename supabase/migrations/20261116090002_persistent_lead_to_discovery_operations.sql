-- Broker Growth Desk Milestone 4B: persistent lead-to-discovery operations.
-- Ordinary authenticated table access remains read-only. Every mutation below
-- derives its actor from auth.uid(), locks affected rows, checks capabilities,
-- validates tenant relationships, and records an append-only activity event.

create table public.operation_commands (
  organisation_id uuid not null references public.organisations(id),
  command_id uuid not null,
  operation_type text not null,
  actor_user_id uuid not null references auth.users(id),
  actor_membership_id uuid not null,
  result jsonb,
  created_at timestamptz not null default now(),
  primary key (organisation_id, command_id),
  foreign key (organisation_id, actor_membership_id)
    references public.organisation_memberships(organisation_id, id),
  check (jsonb_typeof(result) = 'object' or result is null)
);

alter table public.operation_commands enable row level security;
revoke all on public.operation_commands from anon, authenticated;

comment on table public.operation_commands is
  'Tenant-scoped idempotency ledger for guarded application operations; not directly readable or writable by clients.';

create or replace function private.require_operation_actor(
  target_organisation_id uuid,
  required_capability text
) returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_user uuid := auth.uid();
  actor_membership uuid;
begin
  if actor_user is null then
    raise exception 'AUTHENTICATION_REQUIRED' using errcode = '42501';
  end if;

  actor_membership := private.current_membership_id(target_organisation_id);
  if actor_membership is null then
    raise exception 'ACTIVE_ORGANISATION_MEMBERSHIP_REQUIRED' using errcode = '42501';
  end if;
  if not private.has_capability(target_organisation_id, required_capability) then
    raise exception 'CAPABILITY_REQUIRED:%', required_capability using errcode = '42501';
  end if;
  return actor_membership;
end
$$;

create or replace function private.begin_operation_command(
  target_organisation_id uuid,
  target_command_id uuid,
  target_operation_type text,
  target_actor_membership_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  existing public.operation_commands%rowtype;
begin
  if target_command_id is null then
    raise exception 'COMMAND_ID_REQUIRED' using errcode = '22023';
  end if;

  insert into public.operation_commands (
    organisation_id, command_id, operation_type, actor_user_id, actor_membership_id
  ) values (
    target_organisation_id, target_command_id, target_operation_type,
    auth.uid(), target_actor_membership_id
  )
  on conflict (organisation_id, command_id) do nothing;

  if found then
    return null;
  end if;

  select * into existing
  from public.operation_commands
  where organisation_id = target_organisation_id
    and command_id = target_command_id;

  if existing.actor_user_id <> auth.uid()
     or existing.operation_type <> target_operation_type then
    raise exception 'COMMAND_ID_REUSE_CONFLICT' using errcode = '23505';
  end if;
  if existing.result is null then
    raise exception 'COMMAND_INCOMPLETE' using errcode = '40001';
  end if;
  return existing.result;
end
$$;

create or replace function private.finish_operation_command(
  target_organisation_id uuid,
  target_command_id uuid,
  target_result jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
begin
  update public.operation_commands
  set result = target_result
  where organisation_id = target_organisation_id
    and command_id = target_command_id
    and actor_user_id = auth.uid()
    and result is null;
  if not found then
    raise exception 'COMMAND_COMPLETION_FAILED' using errcode = '40001';
  end if;
  return target_result;
end
$$;

create or replace function private.require_lead_access(
  target_organisation_id uuid,
  target_lead_id uuid,
  target_expected_version integer,
  target_actor_membership_id uuid,
  require_owner boolean default true
) returns public.leads
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  target_lead public.leads%rowtype;
begin
  select * into target_lead
  from public.leads
  where organisation_id = target_organisation_id and id = target_lead_id
  for update;
  if not found then
    raise exception 'LEAD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if target_expected_version is null or target_lead.version <> target_expected_version then
    raise exception 'STALE_LEAD_VERSION' using errcode = '40001';
  end if;
  if require_owner
     and not private.has_capability(target_organisation_id, 'lead.assign')
     and target_lead.owner_membership_id is distinct from target_actor_membership_id then
    raise exception 'LEAD_OWNERSHIP_REQUIRED' using errcode = '42501';
  end if;
  return target_lead;
end
$$;

create or replace function private.lead_transition_allowed(current_status text, next_status text)
returns boolean language sql immutable set search_path = '' as $$
  select case current_status
    when 'New' then next_status in ('Contact attempted','Contacted','Nurture','Closed')
    when 'Contact attempted' then next_status in ('Contacted','Nurture','Closed')
    when 'Contacted' then next_status in ('Discovery booked','Nurture','Closed')
    when 'Discovery booked' then next_status in ('Nurture','Closed')
    when 'Nurture' then next_status in ('Contact attempted','Contacted','Discovery booked','Closed')
    when 'Closed' then next_status = 'Nurture'
    else false
  end
$$;

create or replace function public.create_mortgage_lead(
  organisation_id uuid,
  command_id uuid,
  first_name text,
  last_name text,
  email text,
  phone text,
  source text,
  loan_purpose text,
  timeframe text,
  preferred_contact_method text,
  owner_membership_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  actor_membership uuid;
  previous_result jsonb;
  contact_id uuid := gen_random_uuid();
  lead_id uuid := gen_random_uuid();
  result jsonb;
  recorded_at timestamptz := clock_timestamp();
begin
  actor_membership := private.require_operation_actor(organisation_id, 'lead.create');
  previous_result := private.begin_operation_command(organisation_id, command_id, 'lead.create', actor_membership);
  if previous_result is not null then return previous_result; end if;

  if nullif(btrim(first_name), '') is null or nullif(btrim(last_name), '') is null
     or email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
     or length(regexp_replace(phone, '[^0-9]', '', 'g')) < 8 then
    raise exception 'VALID_NAME_EMAIL_AND_PHONE_REQUIRED' using errcode = '22023';
  end if;
  if loan_purpose not in ('Purchase','Refinance','Investment purchase','Construction loan','Asset finance','Commercial finance','Other')
     or timeframe not in ('Immediately','Within 1 month','1–3 months','3–6 months','Researching')
     or preferred_contact_method not in ('Phone','Email','SMS') then
    raise exception 'INVALID_MORTGAGE_LEAD_DETAILS' using errcode = '22023';
  end if;

  if owner_membership_id is not null then
    if not private.has_capability(organisation_id, 'lead.assign') then
      raise exception 'CAPABILITY_REQUIRED:lead.assign' using errcode = '42501';
    end if;
    perform 1 from public.organisation_memberships m
      where m.organisation_id=organisation_id and m.id=owner_membership_id
        and m.status='Active';
    if not found then raise exception 'ACTIVE_ASSIGNEE_REQUIRED' using errcode='23503'; end if;
  end if;

  insert into public.contacts(id, organisation_id, given_name, family_name, email,
    email_normalized, phone, phone_normalized, preferred_contact_method, status,
    created_at, updated_at)
  values(contact_id, organisation_id, btrim(first_name), btrim(last_name), lower(btrim(email)),
    lower(btrim(email)), btrim(phone), regexp_replace(phone, '[^0-9]', '', 'g'),
    preferred_contact_method, 'Active', recorded_at, recorded_at);

  insert into public.leads(id, organisation_id, contact_id, owner_membership_id,
    source, lifecycle_status, created_at, updated_at, version)
  values(lead_id, organisation_id, contact_id, owner_membership_id,
    btrim(source), 'New', recorded_at, recorded_at, 1);

  insert into public.mortgage_lead_details(organisation_id, lead_id, loan_purpose,
    timeframe, preferred_contact_method)
  values(organisation_id, lead_id, loan_purpose, timeframe, preferred_contact_method);

  insert into public.consent_evidence(organisation_id, contact_id, channel, status,
    source, effective_at, recorded_at, actor_membership_id, external_action_confirmed, provenance)
  select organisation_id, contact_id, channel, 'Not recorded', 'Manual entry', recorded_at,
    recorded_at, actor_membership, false, 'Manual entry'
  from unnest(array['Email','SMS','Phone']) channel;

  insert into public.activity_events(organisation_id, entity_type, entity_id,
    event_type, summary, actor_membership_id, occurred_at, details)
  values(organisation_id, 'lead', lead_id, 'lead.created', 'Lead created manually',
    actor_membership, recorded_at, jsonb_build_object('contactId', contact_id, 'version', 1));

  result := jsonb_build_object('leadId', lead_id, 'contactId', contact_id, 'version', 1);
  return private.finish_operation_command(organisation_id, command_id, result);
end
$$;

create or replace function public.claim_lead(
  organisation_id uuid, command_id uuid, lead_id uuid, expected_version integer
) returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  actor_membership uuid; previous_result jsonb; target_lead public.leads%rowtype;
  result jsonb; changed_at timestamptz := clock_timestamp();
begin
  actor_membership := private.require_operation_actor(organisation_id, 'lead.claim');
  previous_result := private.begin_operation_command(organisation_id, command_id, 'lead.claim', actor_membership);
  if previous_result is not null then return previous_result; end if;
  target_lead := private.require_lead_access(organisation_id, lead_id, expected_version, actor_membership, false);
  if target_lead.lifecycle_status in ('Closed','Converted') then raise exception 'ACTIVE_LEAD_REQUIRED' using errcode='22023'; end if;
  if target_lead.owner_membership_id is not null then raise exception 'LEAD_ALREADY_OWNED' using errcode='23505'; end if;
  update public.leads as l set owner_membership_id=actor_membership, updated_at=changed_at, version=l.version+1
    where l.organisation_id=organisation_id and l.id=lead_id;
  insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,actor_membership_id,occurred_at,details)
    values(organisation_id,'lead',lead_id,'lead.claimed','Lead claimed',actor_membership,changed_at,
      jsonb_build_object('ownerMembershipId',actor_membership,'version',expected_version+1));
  result := jsonb_build_object('leadId',lead_id,'version',expected_version+1,'ownerMembershipId',actor_membership);
  return private.finish_operation_command(organisation_id,command_id,result);
end $$;

create or replace function public.assign_lead(
  organisation_id uuid, command_id uuid, lead_id uuid, expected_version integer,
  target_membership_id uuid
) returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  actor_membership uuid; previous_result jsonb; target_lead public.leads%rowtype;
  result jsonb; changed_at timestamptz := clock_timestamp(); target_name text;
begin
  actor_membership := private.require_operation_actor(organisation_id, 'lead.assign');
  previous_result := private.begin_operation_command(organisation_id, command_id, 'lead.assign', actor_membership);
  if previous_result is not null then return previous_result; end if;
  target_lead := private.require_lead_access(organisation_id, lead_id, expected_version, actor_membership, false);
  if target_lead.lifecycle_status in ('Closed','Converted') then raise exception 'ACTIVE_LEAD_REQUIRED' using errcode='22023'; end if;
  select m.display_name into target_name from public.organisation_memberships m
    where m.organisation_id=organisation_id and m.id=target_membership_id and m.status='Active';
  if not found then raise exception 'ACTIVE_ASSIGNEE_REQUIRED' using errcode='23503'; end if;
  update public.leads as l set owner_membership_id=target_membership_id,updated_at=changed_at,version=l.version+1
    where l.organisation_id=organisation_id and l.id=lead_id;
  insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,actor_membership_id,occurred_at,details)
    values(organisation_id,'lead',lead_id,'lead.assigned','Lead assigned to '||target_name,actor_membership,changed_at,
      jsonb_build_object('previousOwnerMembershipId',target_lead.owner_membership_id,'ownerMembershipId',target_membership_id,'version',expected_version+1));
  result:=jsonb_build_object('leadId',lead_id,'version',expected_version+1,'ownerMembershipId',target_membership_id);
  return private.finish_operation_command(organisation_id,command_id,result);
end $$;

create or replace function public.transition_lead(
  organisation_id uuid, command_id uuid, lead_id uuid, expected_version integer,
  next_status text, note text default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  actor_membership uuid; previous_result jsonb; target_lead public.leads%rowtype;
  result jsonb; changed_at timestamptz := clock_timestamp();
begin
  actor_membership := private.require_operation_actor(organisation_id, 'lead.update');
  previous_result := private.begin_operation_command(organisation_id, command_id, 'lead.transition', actor_membership);
  if previous_result is not null then return previous_result; end if;
  target_lead := private.require_lead_access(organisation_id,lead_id,expected_version,actor_membership,true);
  if not private.lead_transition_allowed(target_lead.lifecycle_status,next_status) then
    raise exception 'INVALID_LEAD_TRANSITION:%->%',target_lead.lifecycle_status,next_status using errcode='22023';
  end if;
  update public.leads as l set lifecycle_status=next_status,updated_at=changed_at,version=l.version+1
    where l.organisation_id=organisation_id and l.id=lead_id;
  insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,actor_membership_id,occurred_at,details)
    values(organisation_id,'lead',lead_id,'lead.status_changed','Status changed from '||target_lead.lifecycle_status||' to '||next_status,
      actor_membership,changed_at,jsonb_strip_nulls(jsonb_build_object('oldStatus',target_lead.lifecycle_status,'newStatus',next_status,'note',nullif(btrim(note),''),'version',expected_version+1)));
  result:=jsonb_build_object('leadId',lead_id,'status',next_status,'version',expected_version+1);
  return private.finish_operation_command(organisation_id,command_id,result);
end $$;

create or replace function public.record_contact_attempt(
  organisation_id uuid, command_id uuid, lead_id uuid, expected_version integer,
  channel text, outcome text, note text default null, next_action_at timestamptz default null
) returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare
  actor_membership uuid; previous_result jsonb; target_lead public.leads%rowtype;
  result jsonb; changed_at timestamptz := clock_timestamp(); new_status text; new_version integer;
begin
  actor_membership:=private.require_operation_actor(organisation_id,'lead.update');
  previous_result:=private.begin_operation_command(organisation_id,command_id,'lead.contact-attempt',actor_membership);
  if previous_result is not null then return previous_result; end if;
  target_lead:=private.require_lead_access(organisation_id,lead_id,expected_version,actor_membership,true);
  if target_lead.lifecycle_status in ('Closed','Converted') then raise exception 'ACTIVE_LEAD_REQUIRED' using errcode='22023'; end if;
  if channel not in ('Phone','Email','SMS','Other') or outcome not in ('No answer','Left message','Spoke with lead','Email sent','SMS sent','Incorrect details','Lead requested later follow-up','Other') then
    raise exception 'VALID_CONTACT_CHANNEL_AND_OUTCOME_REQUIRED' using errcode='22023';
  end if;
  new_status:=case when target_lead.lifecycle_status in ('New','Nurture') then 'Contact attempted' else target_lead.lifecycle_status end;
  new_version:=expected_version+1;
  update public.leads as l set lifecycle_status=new_status,next_action_at=coalesce(next_action_at,target_lead.next_action_at),updated_at=changed_at,version=new_version
    where l.organisation_id=organisation_id and l.id=lead_id;
  if new_status<>target_lead.lifecycle_status then
    insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,actor_membership_id,occurred_at,details)
      values(organisation_id,'lead',lead_id,'lead.status_changed','Status changed from '||target_lead.lifecycle_status||' to '||new_status,actor_membership,changed_at,
        jsonb_build_object('oldStatus',target_lead.lifecycle_status,'newStatus',new_status,'version',new_version));
  end if;
  insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,actor_membership_id,occurred_at,details)
    values(organisation_id,'lead',lead_id,'contact.attempted','Contact attempt recorded',actor_membership,changed_at,
      jsonb_strip_nulls(jsonb_build_object('channel',channel,'outcome',outcome,'note',nullif(btrim(note),''),'nextActionAt',next_action_at,'contactId',target_lead.contact_id,'version',new_version)));
  if next_action_at is not null then
    insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,actor_membership_id,occurred_at,details)
      values(organisation_id,'lead',lead_id,'lead.next_action_changed','Next action updated',actor_membership,changed_at,
        jsonb_build_object('previousNextActionAt',target_lead.next_action_at,'nextActionAt',next_action_at,'version',new_version));
  end if;
  result:=jsonb_build_object('leadId',lead_id,'status',new_status,'version',new_version,'nextActionAt',coalesce(next_action_at,target_lead.next_action_at));
  return private.finish_operation_command(organisation_id,command_id,result);
end $$;

create or replace function public.add_lead_note(
  organisation_id uuid, command_id uuid, lead_id uuid, expected_version integer, note text
) returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare actor_membership uuid; previous_result jsonb; target_lead public.leads%rowtype; result jsonb; recorded_at timestamptz:=clock_timestamp(); event_id uuid:=gen_random_uuid();
begin
  actor_membership:=private.require_operation_actor(organisation_id,'lead.update');
  previous_result:=private.begin_operation_command(organisation_id,command_id,'lead.note',actor_membership);
  if previous_result is not null then return previous_result; end if;
  target_lead:=private.require_lead_access(organisation_id,lead_id,expected_version,actor_membership,true);
  if nullif(btrim(note),'') is null then raise exception 'NOTE_REQUIRED' using errcode='22023'; end if;
  insert into public.activity_events(id,organisation_id,entity_type,entity_id,event_type,summary,actor_membership_id,occurred_at,details)
    values(event_id,organisation_id,'lead',lead_id,'note.added','Note added',actor_membership,recorded_at,jsonb_build_object('note',btrim(note),'version',expected_version));
  result:=jsonb_build_object('leadId',lead_id,'activityEventId',event_id,'version',expected_version);
  return private.finish_operation_command(organisation_id,command_id,result);
end $$;

create or replace function public.create_lead_task(
  organisation_id uuid, command_id uuid, lead_id uuid, expected_version integer,
  assigned_membership_id uuid, title text, due_at timestamptz, priority text
) returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare actor_membership uuid; previous_result jsonb; target_lead public.leads%rowtype; result jsonb; task_id uuid:=gen_random_uuid(); recorded_at timestamptz:=clock_timestamp();
begin
  actor_membership:=private.require_operation_actor(organisation_id,'task.create');
  if not private.has_capability(organisation_id,'lead.update') then raise exception 'CAPABILITY_REQUIRED:lead.update' using errcode='42501'; end if;
  previous_result:=private.begin_operation_command(organisation_id,command_id,'lead.task-create',actor_membership);
  if previous_result is not null then return previous_result; end if;
  target_lead:=private.require_lead_access(organisation_id,lead_id,expected_version,actor_membership,true);
  if target_lead.lifecycle_status='Converted' then raise exception 'CONVERTED_LEAD_IS_TERMINAL' using errcode='22023'; end if;
  if nullif(btrim(title),'') is null or due_at is null or priority not in ('Low','Normal','High') then raise exception 'VALID_TASK_DETAILS_REQUIRED' using errcode='22023'; end if;
  perform 1 from public.organisation_memberships m where m.organisation_id=organisation_id and m.id=assigned_membership_id and m.status='Active';
  if not found then raise exception 'ACTIVE_ASSIGNEE_REQUIRED' using errcode='23503'; end if;
  insert into public.tasks(id,organisation_id,lead_id,assigned_membership_id,created_by_membership_id,title,due_at,priority,status,created_at)
    values(task_id,organisation_id,lead_id,assigned_membership_id,actor_membership,btrim(title),due_at,priority,'Open',recorded_at);
  insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,actor_membership_id,occurred_at,details)
    values(organisation_id,'lead',lead_id,'task.created','Follow-up task created: '||btrim(title),actor_membership,recorded_at,
      jsonb_build_object('taskId',task_id,'assignedMembershipId',assigned_membership_id,'dueAt',due_at,'priority',priority,'version',expected_version));
  result:=jsonb_build_object('leadId',lead_id,'taskId',task_id,'version',expected_version);
  return private.finish_operation_command(organisation_id,command_id,result);
end $$;

create or replace function public.book_discovery_appointment(
  organisation_id uuid, command_id uuid, lead_id uuid, expected_version integer,
  assigned_membership_id uuid, starts_at timestamptz, duration_minutes integer,
  meeting_method text, location_or_link text default null, notes text default ''
) returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare actor_membership uuid; previous_result jsonb; target_lead public.leads%rowtype; result jsonb; appointment_id uuid:=gen_random_uuid(); booked_at timestamptz:=clock_timestamp(); new_version integer;
begin
  actor_membership:=private.require_operation_actor(organisation_id,'appointment.create');
  if not private.has_capability(organisation_id,'lead.update') then raise exception 'CAPABILITY_REQUIRED:lead.update' using errcode='42501'; end if;
  previous_result:=private.begin_operation_command(organisation_id,command_id,'lead.discovery-book',actor_membership);
  if previous_result is not null then return previous_result; end if;
  target_lead:=private.require_lead_access(organisation_id,lead_id,expected_version,actor_membership,true);
  if not private.lead_transition_allowed(target_lead.lifecycle_status,'Discovery booked') then raise exception 'INVALID_LEAD_TRANSITION:%->Discovery booked',target_lead.lifecycle_status using errcode='22023'; end if;
  if starts_at is null or duration_minutes not between 15 and 240 or meeting_method not in ('Phone','Video','In person') then raise exception 'VALID_APPOINTMENT_DETAILS_REQUIRED' using errcode='22023'; end if;
  perform 1 from public.organisation_memberships m where m.organisation_id=organisation_id and m.id=assigned_membership_id and m.status='Active';
  if not found then raise exception 'ACTIVE_ASSIGNEE_REQUIRED' using errcode='23503'; end if;
  insert into public.appointments(id,organisation_id,lead_id,assigned_membership_id,starts_at,duration_minutes,meeting_method,location_or_link,notes,status,created_at)
    values(appointment_id,organisation_id,lead_id,assigned_membership_id,starts_at,duration_minutes,meeting_method,nullif(btrim(location_or_link),''),coalesce(notes,''),'Booked',booked_at);
  new_version:=expected_version+1;
  update public.leads as l set lifecycle_status='Discovery booked',updated_at=booked_at,version=new_version where l.organisation_id=organisation_id and l.id=lead_id;
  insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,actor_membership_id,occurred_at,details)
    values(organisation_id,'lead',lead_id,'lead.status_changed','Status changed from '||target_lead.lifecycle_status||' to Discovery booked',actor_membership,booked_at,
      jsonb_build_object('oldStatus',target_lead.lifecycle_status,'newStatus','Discovery booked','note','Discovery appointment booked','version',new_version));
  insert into public.activity_events(organisation_id,entity_type,entity_id,event_type,summary,actor_membership_id,occurred_at,details)
    values(organisation_id,'lead',lead_id,'appointment.created','Discovery appointment booked',actor_membership,booked_at,
      jsonb_build_object('appointmentId',appointment_id,'assignedMembershipId',assigned_membership_id,'startsAt',starts_at,'durationMinutes',duration_minutes,'meetingMethod',meeting_method,'version',new_version));
  result:=jsonb_build_object('leadId',lead_id,'appointmentId',appointment_id,'status','Discovery booked','version',new_version);
  return private.finish_operation_command(organisation_id,command_id,result);
end $$;

-- Only the narrow operation boundary is callable by signed-in users.
revoke all on function private.require_operation_actor(uuid,text), private.begin_operation_command(uuid,uuid,text,uuid),
  private.finish_operation_command(uuid,uuid,jsonb), private.require_lead_access(uuid,uuid,integer,uuid,boolean),
  private.lead_transition_allowed(text,text) from public, anon, authenticated;

revoke all on function public.create_mortgage_lead(uuid,uuid,text,text,text,text,text,text,text,text,uuid),
  public.claim_lead(uuid,uuid,uuid,integer), public.assign_lead(uuid,uuid,uuid,integer,uuid),
  public.transition_lead(uuid,uuid,uuid,integer,text,text), public.record_contact_attempt(uuid,uuid,uuid,integer,text,text,text,timestamptz),
  public.add_lead_note(uuid,uuid,uuid,integer,text), public.create_lead_task(uuid,uuid,uuid,integer,uuid,text,timestamptz,text),
  public.book_discovery_appointment(uuid,uuid,uuid,integer,uuid,timestamptz,integer,text,text,text)
  from public, anon;

grant execute on function public.create_mortgage_lead(uuid,uuid,text,text,text,text,text,text,text,text,uuid),
  public.claim_lead(uuid,uuid,uuid,integer), public.assign_lead(uuid,uuid,uuid,integer,uuid),
  public.transition_lead(uuid,uuid,uuid,integer,text,text), public.record_contact_attempt(uuid,uuid,uuid,integer,text,text,text,timestamptz),
  public.add_lead_note(uuid,uuid,uuid,integer,text), public.create_lead_task(uuid,uuid,uuid,integer,uuid,text,timestamptz,text),
  public.book_discovery_appointment(uuid,uuid,uuid,integer,uuid,timestamptz,integer,text,text,text)
  to authenticated;

comment on function public.record_contact_attempt(uuid,uuid,uuid,integer,text,text,text,timestamptz) is
  'Records a broker-entered external contact action. It does not send email, SMS, or any other communication.';
comment on function public.book_discovery_appointment(uuid,uuid,uuid,integer,uuid,timestamptz,integer,text,text,text) is
  'Records a discovery appointment in Broker Growth Desk. It does not create an external calendar event.';
