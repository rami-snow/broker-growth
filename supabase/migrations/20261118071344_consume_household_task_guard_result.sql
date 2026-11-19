-- Keep the locking authorization guard explicit without retaining an unused
-- composite result, so hosted schema lint remains clean.
create or replace function public.create_mortgage_household_task(
  organisation_id uuid,command_id uuid,household_id uuid,title text,due_at timestamptz,
  priority text,assigned_membership_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor_membership uuid; previous_result jsonb;
  task_id uuid:=gen_random_uuid(); result jsonb;
begin
  actor_membership:=private.require_operation_actor(organisation_id,'task.create');
  if not private.has_capability(organisation_id,'mortgage.household.update') then
    raise exception 'CAPABILITY_REQUIRED:mortgage.household.update' using errcode='42501'; end if;
  previous_result:=private.begin_operation_command_checked(organisation_id,command_id,
    'mortgage.household-task-create',actor_membership,jsonb_build_object('householdId',household_id,
      'title',btrim(title),'dueAt',due_at,'priority',priority,'assignedMembershipId',assigned_membership_id));
  if previous_result is not null then return previous_result; end if;
  perform private.require_household_maintenance_access(organisation_id,household_id,actor_membership,true);
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

revoke all on function public.create_mortgage_household_task(uuid,uuid,uuid,text,timestamptz,text,uuid)
  from public,anon;
grant execute on function public.create_mortgage_household_task(uuid,uuid,uuid,text,timestamptz,text,uuid)
  to authenticated;
