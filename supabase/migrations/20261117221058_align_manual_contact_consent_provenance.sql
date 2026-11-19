-- Use the canonical controlled consent-provenance value while preserving an
-- explicit source and note that no consent was inferred.
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
      'No consent inferred during manual contact creation',false,'Manual entry'
    from unnest(array['Email','SMS','Phone']) channel;
end
$$;

revoke all on function private.record_new_contact_no_consent(uuid,uuid,uuid,text)
  from public,anon,authenticated;
