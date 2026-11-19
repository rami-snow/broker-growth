-- Preserve lead authorization and row locking while avoiding an unused row variable.
create or replace function public.set_mortgage_lead_referral_partner(
  organisation_id uuid,command_id uuid,lead_id uuid,expected_version integer,
  referral_partner_id uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare actor_membership uuid;previous_result jsonb;
  previous_partner_id uuid;result jsonb;
begin
  actor_membership:=private.require_operation_actor(organisation_id,'lead.update');
  if not private.has_capability(organisation_id,'mortgage.referral.view') then
    raise exception 'CAPABILITY_REQUIRED:mortgage.referral.view' using errcode='42501'; end if;
  previous_result:=private.begin_operation_command_checked(organisation_id,command_id,
    'mortgage.lead-referral.set',actor_membership,jsonb_build_object('leadId',lead_id,
      'expectedVersion',expected_version,'referralPartnerId',referral_partner_id));
  if previous_result is not null then return previous_result; end if;
  perform private.require_lead_access(organisation_id,lead_id,expected_version,actor_membership,true);
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

revoke all on function public.set_mortgage_lead_referral_partner(uuid,uuid,uuid,integer,uuid) from public,anon;
grant execute on function public.set_mortgage_lead_referral_partner(uuid,uuid,uuid,integer,uuid) to authenticated;
