-- PostgreSQL resolves PL/pgSQL variables first in the original function. Make
-- the existing tenant/contact uniqueness target explicit without rewriting the
-- already-applied 4C migration.
do $migration$
declare
  original_definition text;
  corrected_definition text;
begin
  select pg_get_functiondef(p.oid)
  into original_definition
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname = 'convert_mortgage_lead_to_household'
    and pg_get_function_identity_arguments(p.oid) =
      'organisation_id uuid, command_id uuid, lead_id uuid, expected_version integer, duplicate_decision text, display_name text, owner_membership_id uuid, referral_partner_id uuid, existing_household_id uuid, joint_contact_id uuid, joint_first_name text, joint_last_name text, joint_email text, joint_phone text, joint_preferred_contact_method text, joint_relationship text, loan_external_reference text, loan_lender_name text, loan_purpose text, loan_settlement_date date, loan_fixed_rate_expiry_date date, loan_last_review_date date, loan_next_review_date date, loan_status text, loan_data_confidence text';

  if original_definition is null then
    raise exception 'CONVERSION_FUNCTION_NOT_FOUND';
  end if;
  corrected_definition := replace(
    original_definition,
    'on conflict (organisation_id, household_id, contact_id) do nothing',
    'on conflict on constraint mortgage_household_members_organisation_id_household_id_con_key do nothing'
  );
  if corrected_definition = original_definition then
    raise exception 'CONVERSION_CONFLICT_TARGET_NOT_FOUND';
  end if;
  execute corrected_definition;
end
$migration$;
