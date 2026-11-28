-- Milestone 4F.3 (a): explicit audit actor (person, system, import).
-- Existing entries are backfilled: an entry with a member is 'person', one without is 'system'.
-- Phase 2 can add an AI actor by extending the allowed values without changing existing rows.

alter table public.activity_events add column actor_type text;
alter table public.campaign_activity_events add column actor_type text;

-- Backfill once. The append-only triggers are paused only for this statement inside the migration transaction.
alter table public.activity_events disable trigger reject_activity_events_mutation;
update public.activity_events
  set actor_type = case when actor_membership_id is null then 'system' else 'person' end
  where actor_type is null;
alter table public.activity_events enable trigger reject_activity_events_mutation;

alter table public.campaign_activity_events disable trigger reject_campaign_activity_events_mutation;
update public.campaign_activity_events set actor_type = 'person' where actor_type is null;
alter table public.campaign_activity_events enable trigger reject_campaign_activity_events_mutation;

-- Existing operations do not pass an actor type; derive it on insert so they keep working unchanged.
create or replace function private.default_audit_actor_type() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.actor_type is null then
    new.actor_type := case when new.actor_membership_id is null then 'system' else 'person' end;
  end if;
  return new;
end
$$;
revoke all on function private.default_audit_actor_type() from public, anon, authenticated;

create trigger default_activity_events_actor_type before insert on public.activity_events
  for each row execute function private.default_audit_actor_type();
create trigger default_campaign_activity_events_actor_type before insert on public.campaign_activity_events
  for each row execute function private.default_audit_actor_type();

alter table public.activity_events
  alter column actor_type set not null,
  add constraint activity_events_actor_type_allowed check (actor_type in ('person','system','import')),
  add constraint activity_events_person_actor_has_member check (actor_type <> 'person' or actor_membership_id is not null);

alter table public.campaign_activity_events
  alter column actor_type set not null,
  add constraint campaign_activity_events_actor_type_allowed check (actor_type in ('person','system','import'));
