-- Milestone 4F.3 (c): a manual next step on each referral partner, set through a guarded, versioned operation.

alter table public.mortgage_referral_partners
  add column next_step text,
  add constraint mortgage_referral_partners_next_step_length check (next_step is null or length(btrim(next_step)) between 1 and 200);

create or replace function public.set_mortgage_referral_partner_next_step(
  organisation_id uuid, command_id uuid, referral_partner_id uuid, expected_version integer, next_step text
) returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare actor_membership uuid; previous_result jsonb; target public.mortgage_referral_partners%rowtype;
  cleaned text := nullif(btrim(next_step), ''); result jsonb;
begin
  actor_membership := private.require_referral_actor(organisation_id, 'mortgage.referral.manage');
  previous_result := private.begin_operation_command_checked(organisation_id, command_id,
    'mortgage.referral.next-step', actor_membership, jsonb_build_object(
      'referralPartnerId', referral_partner_id, 'expectedVersion', expected_version, 'nextStep', cleaned));
  if previous_result is not null then return previous_result; end if;
  select * into target from public.mortgage_referral_partners r
    where r.organisation_id = organisation_id and r.id = referral_partner_id for update;
  if not found then raise exception 'REFERRAL_PARTNER_NOT_FOUND' using errcode = 'P0002'; end if;
  if target.version <> expected_version then raise exception 'STALE_REFERRAL_PARTNER_VERSION' using errcode = '40001'; end if;
  if cleaned is not null and length(cleaned) > 200 then raise exception 'NEXT_STEP_TOO_LONG' using errcode = '22023'; end if;
  if target.next_step is not distinct from cleaned then raise exception 'NEXT_STEP_NO_OP' using errcode = '22023'; end if;
  update public.mortgage_referral_partners r set next_step = cleaned, updated_at = transaction_timestamp(), version = version + 1
    where r.organisation_id = organisation_id and r.id = referral_partner_id;
  insert into public.activity_events(organisation_id, entity_type, entity_id, event_type, summary,
    actor_membership_id, actor_type, occurred_at, details)
  values (organisation_id, 'mortgage.referral_partner', referral_partner_id, 'referral_partner.next_step_set',
    case when cleaned is null then 'Partner next step cleared' else 'Partner next step set' end,
    actor_membership, 'person', transaction_timestamp(), jsonb_build_object('referralPartnerId', referral_partner_id,
      'previousNextStep', target.next_step, 'nextStep', cleaned, 'version', expected_version + 1));
  result := jsonb_build_object('referralPartnerId', referral_partner_id, 'version', expected_version + 1, 'nextStep', cleaned);
  return private.finish_operation_command(organisation_id, command_id, result);
end
$$;
revoke all on function public.set_mortgage_referral_partner_next_step(uuid,uuid,uuid,integer,text) from public, anon;
grant execute on function public.set_mortgage_referral_partner_next_step(uuid,uuid,uuid,integer,text) to authenticated;
