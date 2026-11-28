-- Milestone 4F.3 (d): household notes. Append-only, tenant-consistent, readable under household RLS,
-- and written only through a guarded operation that also records an audit entry.

create table public.mortgage_household_notes (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  household_id uuid not null,
  body text not null check (length(btrim(body)) between 1 and 2000),
  author_membership_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organisation_id, id),
  foreign key (organisation_id, household_id) references public.mortgage_households(organisation_id, id),
  foreign key (organisation_id, author_membership_id) references public.organisation_memberships(organisation_id, id)
);
create index mortgage_household_notes_household_idx on public.mortgage_household_notes(organisation_id, household_id, created_at desc);

alter table public.mortgage_household_notes enable row level security;
revoke all on public.mortgage_household_notes from anon;
revoke insert, update, delete on public.mortgage_household_notes from authenticated;
grant select on public.mortgage_household_notes to authenticated;
create policy household_notes_read on public.mortgage_household_notes for select to authenticated
  using ((select private.has_capability(organisation_id, 'mortgage.household.view')));
create trigger reject_mortgage_household_notes_mutation before update or delete on public.mortgage_household_notes
  for each row execute function private.reject_mutation();

create or replace function public.add_mortgage_household_note(
  organisation_id uuid, command_id uuid, household_id uuid, body text
) returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare actor_membership uuid; previous_result jsonb; note_id uuid := gen_random_uuid(); cleaned text := btrim(body); result jsonb;
begin
  actor_membership := private.require_operation_actor(organisation_id, 'mortgage.household.update');
  previous_result := private.begin_operation_command_checked(organisation_id, command_id,
    'mortgage.household-note-add', actor_membership, jsonb_build_object('householdId', household_id, 'body', cleaned));
  if previous_result is not null then return previous_result; end if;
  perform private.require_household_maintenance_access(organisation_id, household_id, actor_membership, true);
  if nullif(cleaned, '') is null or length(cleaned) > 2000 then raise exception 'VALID_NOTE_REQUIRED' using errcode = '22023'; end if;
  insert into public.mortgage_household_notes(id, organisation_id, household_id, body, author_membership_id, created_at)
    values (note_id, organisation_id, household_id, cleaned, actor_membership, transaction_timestamp());
  insert into public.activity_events(organisation_id, entity_type, entity_id, event_type, summary,
    actor_membership_id, actor_type, occurred_at, details)
  values (organisation_id, 'mortgage.household', household_id, 'household.note_added', 'Household note added',
    actor_membership, 'person', transaction_timestamp(), jsonb_build_object('householdId', household_id, 'noteId', note_id));
  result := jsonb_build_object('householdId', household_id, 'noteId', note_id);
  return private.finish_operation_command(organisation_id, command_id, result);
end
$$;
revoke all on function public.add_mortgage_household_note(uuid,uuid,uuid,text) from public, anon;
grant execute on function public.add_mortgage_household_note(uuid,uuid,uuid,text) to authenticated;
