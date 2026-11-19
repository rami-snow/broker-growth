-- Preserve the required row lock/ownership/version check without retaining an
-- unused composite result. This clears the hosted PL/pgSQL linter warning.
create or replace function public.add_lead_note(
  organisation_id uuid, command_id uuid, lead_id uuid, expected_version integer, note text
) returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare actor_membership uuid; previous_result jsonb; result jsonb; recorded_at timestamptz:=clock_timestamp(); event_id uuid:=gen_random_uuid();
begin
  actor_membership:=private.require_operation_actor(organisation_id,'lead.update');
  previous_result:=private.begin_operation_command(organisation_id,command_id,'lead.note',actor_membership);
  if previous_result is not null then return previous_result; end if;
  perform private.require_lead_access(organisation_id,lead_id,expected_version,actor_membership,true);
  if nullif(btrim(note),'') is null then raise exception 'NOTE_REQUIRED' using errcode='22023'; end if;
  insert into public.activity_events(id,organisation_id,entity_type,entity_id,event_type,summary,actor_membership_id,occurred_at,details)
    values(event_id,organisation_id,'lead',lead_id,'note.added','Note added',actor_membership,recorded_at,jsonb_build_object('note',btrim(note),'version',expected_version));
  result:=jsonb_build_object('leadId',lead_id,'activityEventId',event_id,'version',expected_version);
  return private.finish_operation_command(organisation_id,command_id,result);
end $$;

revoke all on function public.add_lead_note(uuid,uuid,uuid,integer,text) from public, anon;
grant execute on function public.add_lead_note(uuid,uuid,uuid,integer,text) to authenticated;
