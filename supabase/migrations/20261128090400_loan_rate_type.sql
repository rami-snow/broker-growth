-- Milestone 4F.3 (e): rate type on minimal loan records (Fixed, Variable, Split).
-- Retention-only: no rate value, balance or amount is stored. Existing records stay unknown (null) until set.

alter table public.mortgage_minimal_loan_records
  add column rate_type text,
  add constraint mortgage_loan_rate_type_allowed check (rate_type is null or rate_type in ('Fixed','Variable','Split'));

create or replace function public.set_mortgage_loan_rate_type(
  organisation_id uuid, command_id uuid, loan_record_id uuid, expected_version integer, rate_type text
) returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare actor_membership uuid; previous_result jsonb; target_loan public.mortgage_minimal_loan_records%rowtype; result jsonb;
begin
  actor_membership := private.require_operation_actor(organisation_id, 'mortgage.loan-record.manage');
  previous_result := private.begin_operation_command_checked(organisation_id, command_id,
    'mortgage.loan-rate-type-set', actor_membership, jsonb_build_object(
      'loanRecordId', loan_record_id, 'expectedVersion', expected_version, 'rateType', rate_type));
  if previous_result is not null then return previous_result; end if;
  if rate_type not in ('Fixed','Variable','Split') then raise exception 'VALID_RATE_TYPE_REQUIRED' using errcode = '22023'; end if;
  select * into target_loan from public.mortgage_minimal_loan_records l
    where l.organisation_id = organisation_id and l.id = loan_record_id for update;
  if not found then raise exception 'LOAN_RECORD_NOT_FOUND' using errcode = 'P0002'; end if;
  if target_loan.version <> expected_version then raise exception 'STALE_LOAN_VERSION' using errcode = '40001'; end if;
  perform private.require_household_maintenance_access(organisation_id, target_loan.household_id, actor_membership, true);
  if rate_type = 'Variable' and target_loan.fixed_rate_expiry_date is not null then
    raise exception 'VARIABLE_RATE_WITH_FIXED_EXPIRY' using errcode = '22023'; end if;
  if target_loan.rate_type is not distinct from rate_type then raise exception 'RATE_TYPE_NO_OP' using errcode = '22023'; end if;
  update public.mortgage_minimal_loan_records l set rate_type = set_mortgage_loan_rate_type.rate_type,
    updated_at = transaction_timestamp(), version = version + 1
    where l.organisation_id = organisation_id and l.id = loan_record_id;
  insert into public.activity_events(organisation_id, entity_type, entity_id, event_type, summary,
    actor_membership_id, actor_type, occurred_at, details)
  values (organisation_id, 'mortgage.household', target_loan.household_id, 'loan.rate_type_set', 'Loan rate type set',
    actor_membership, 'person', transaction_timestamp(), jsonb_build_object('loanRecordId', loan_record_id,
      'previousRateType', target_loan.rate_type, 'rateType', rate_type, 'version', expected_version + 1));
  result := jsonb_build_object('loanRecordId', loan_record_id, 'version', expected_version + 1, 'rateType', rate_type);
  return private.finish_operation_command(organisation_id, command_id, result);
end
$$;
revoke all on function public.set_mortgage_loan_rate_type(uuid,uuid,uuid,integer,text) from public, anon;
grant execute on function public.set_mortgage_loan_rate_type(uuid,uuid,uuid,integer,text) to authenticated;
