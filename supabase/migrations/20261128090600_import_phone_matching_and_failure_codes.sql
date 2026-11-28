-- Milestone 4F.3 CSV import follow-up: phone matching and failure details.
-- 1. Phone numbers match across +61, 0061, +61 (0) and leading-0 forms, for contacts and referral partners.
--    Existing normalised phones are recomputed; the migration stops, changing nothing, if that would make
--    two contacts in one brokerage share a number (resolve those by hand, then re-run).
-- 2. A failed import record stores only an error code, never the database message, which can quote a value
--    from the record (for example an invalid date). The import request itself is never stored: the command
--    ledger keeps only an md5 fingerprint of it, and the result holds indexes, outcomes, ids and codes.

create or replace function private.normalise_phone_number(value text)
returns text language sql immutable set search_path = '' as $$
  select nullif(case when digits ~ '^610[0-9]{9}$' then substr(digits, 3)
    when digits ~ '^61[0-9]{9}$' then '0' || substr(digits, 3) else digits end, '')
  from (select regexp_replace(regexp_replace(coalesce(value, ''), '[^0-9]', '', 'g'), '^0061', '61') as digits) normalised
$$;
revoke all on function private.normalise_phone_number(text) from public, anon, authenticated;

create or replace function private.normalise_contact_phone(value text)
returns text language sql immutable set search_path = '' as $$ select private.normalise_phone_number(value) $$;
create or replace function private.normalise_referral_phone(value text)
returns text language sql immutable set search_path = '' as $$ select private.normalise_phone_number(value) $$;

do $$
begin
  if exists (
    select 1 from public.contacts where phone is not null
    group by organisation_id, private.normalise_phone_number(phone) having count(*) > 1
  ) then raise exception 'PHONE_RENORMALISATION_WOULD_DUPLICATE_CONTACTS' using
    hint = 'Two contacts in one brokerage share a number once +61 and 0 forms are treated as the same. Merge or correct them, then re-run.';
  end if;
end
$$;

update public.contacts set phone_normalized = private.normalise_phone_number(phone)
where phone is not null and phone_normalized is distinct from private.normalise_phone_number(phone);
-- The partner normalise trigger recomputes phone_normalized from phone.
update public.mortgage_referral_partners set phone = phone
where phone is not null and phone_normalized is distinct from private.normalise_phone_number(phone);

create or replace function private.import_failure_code(message text, state text)
returns text language sql immutable set search_path = '' as $$
  select case when message ~ '^[A-Z][A-Z_]+(:[a-z][a-z.-]*)?$' then message else 'IMPORT_RECORD_FAILED:' || coalesce(state, '') end
$$;
revoke all on function private.import_failure_code(text, text) from public, anon, authenticated;

create or replace function public.import_mortgage_records(p_organisation_id uuid, p_command_id uuid, p_kind text, p_records jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
#variable_conflict use_variable
declare actor uuid; previous_result jsonb; item record; match jsonb; outcomes jsonb := '[]'::jsonb;
  rec jsonb; member jsonb; loan jsonb; new_id uuid; contact_id uuid; primary_contact uuid; owner uuid;
  seen_emails text[] := '{}'; seen_phones text[] := '{}'; seen_names text[] := '{}';
  email text; phone text; name_key text; repeated boolean; member_index integer; relationship text; result jsonb;
begin
  if private.import_capability(p_kind) is null then raise exception 'VALID_IMPORT_KIND_REQUIRED' using errcode = '22023'; end if;
  actor := private.require_operation_actor(p_organisation_id, private.import_capability(p_kind));
  previous_result := private.begin_operation_command_checked(p_organisation_id, p_command_id, 'mortgage.csv-import', actor,
    jsonb_build_object('kind', p_kind, 'records', p_records));
  if previous_result is not null then return previous_result; end if;
  if jsonb_typeof(p_records) <> 'array' or jsonb_array_length(p_records) > 1000 then raise exception 'IMPORT_TOO_LARGE' using errcode = '22023'; end if;
  perform set_config('app.audit_actor_type', 'import', true);

  for item in select value, ordinality from jsonb_array_elements(p_records) with ordinality loop
    rec := item.value;
    begin
      -- Repeated within this file: same email or phone as an earlier record (or, for partners without either, same name and organisation).
      repeated := false;
      for member in select value from jsonb_array_elements(case when p_kind = 'clients' then coalesce(rec->'members','[]'::jsonb) else jsonb_build_array(rec) end) loop
        email := private.normalise_contact_email(member->>'email'); phone := private.normalise_contact_phone(member->>'phone');
        if (email is not null and email = any(seen_emails)) or (phone is not null and phone = any(seen_phones)) then repeated := true; end if;
      end loop;
      if p_kind = 'partners' and private.normalise_referral_email(rec->>'email') is null and private.normalise_referral_phone(rec->>'phone') is null then
        name_key := coalesce(private.normalise_referral_text(rec->>'name'),'') || '|' || coalesce(private.normalise_referral_text(rec->>'organisationName'),'');
        if name_key = any(seen_names) then repeated := true; end if;
        seen_names := seen_names || name_key;
      end if;
      for member in select value from jsonb_array_elements(case when p_kind = 'clients' then coalesce(rec->'members','[]'::jsonb) else jsonb_build_array(rec) end) loop
        email := private.normalise_contact_email(member->>'email'); phone := private.normalise_contact_phone(member->>'phone');
        if email is not null then seen_emails := seen_emails || email; end if;
        if phone is not null then seen_phones := seen_phones || phone; end if;
      end loop;
      if repeated then outcomes := outcomes || jsonb_build_array(jsonb_build_object('index', item.ordinality - 1, 'outcome', 'repeated')); continue; end if;

      match := private.import_match(p_organisation_id, p_kind, rec);
      if match->>'status' = 'exists' then
        outcomes := outcomes || jsonb_build_array(jsonb_build_object('index', item.ordinality - 1, 'outcome', 'exists', 'detail', 'Already exists (matched on ' || (match->>'matchedOn') || ')'));
        continue;
      end if;

      if p_kind = 'leads' then
        owner := nullif(rec->>'ownerMembershipId','')::uuid;
        if owner is not null then
          if not private.has_capability(p_organisation_id, 'lead.assign') then raise exception 'CAPABILITY_REQUIRED:lead.assign' using errcode = '42501'; end if;
          if not exists (select 1 from public.organisation_memberships m where m.organisation_id = p_organisation_id and m.id = owner and m.status = 'Active') then
            raise exception 'ACTIVE_ASSIGNEE_REQUIRED' using errcode = '23503'; end if;
        end if;
        if coalesce(rec->>'loanPurpose','Other') not in ('Purchase','Refinance','Investment purchase','Construction loan','Asset finance','Commercial finance','Other')
           or coalesce(rec->>'timeframe','Researching') not in ('Immediately','Within 1 month','1–3 months','3–6 months','Researching') then
          raise exception 'INVALID_MORTGAGE_LEAD_DETAILS' using errcode = '22023'; end if;
        contact_id := private.import_contact(p_organisation_id, actor, rec);
        new_id := gen_random_uuid();
        insert into public.leads(id, organisation_id, contact_id, owner_membership_id, source, lifecycle_status, created_at, updated_at, version)
          values (new_id, p_organisation_id, contact_id, owner, coalesce(nullif(btrim(rec->>'source'),''),'Other'), 'New', transaction_timestamp(), transaction_timestamp(), 1);
        insert into public.mortgage_lead_details(organisation_id, lead_id, loan_purpose, timeframe, preferred_contact_method)
          values (p_organisation_id, new_id, coalesce(rec->>'loanPurpose','Other'), coalesce(rec->>'timeframe','Researching'),
            (select c.preferred_contact_method from public.contacts c where c.organisation_id = p_organisation_id and c.id = contact_id));
        insert into public.activity_events(organisation_id, entity_type, entity_id, event_type, summary, actor_membership_id, actor_type, occurred_at, details)
          values (p_organisation_id, 'lead', new_id, 'lead.created', 'Lead imported from CSV', actor, 'import', transaction_timestamp(),
            jsonb_build_object('contactId', contact_id, 'importCommandId', p_command_id, 'version', 1));

      elsif p_kind = 'partners' then
        owner := (rec->>'ownerMembershipId')::uuid;
        perform private.require_active_broker(p_organisation_id, owner);
        if nullif(btrim(rec->>'name'),'') is null then raise exception 'REFERRAL_NAME_REQUIRED' using errcode = '22023'; end if;
        if coalesce(rec->>'type','Other') not in ('Accountant','Real estate agent','Buyer’s agent','Financial adviser','Conveyancer','Existing client','Other') then
          raise exception 'VALID_REFERRAL_PARTNER_TYPE_REQUIRED' using errcode = '22023'; end if;
        new_id := gen_random_uuid();
        insert into public.mortgage_referral_partners(id, organisation_id, name, organisation_name, partner_type, email, phone, owner_membership_id, status, next_step, created_at, updated_at, version)
          values (new_id, p_organisation_id, rec->>'name', rec->>'organisationName', coalesce(rec->>'type','Other'), rec->>'email', rec->>'phone', owner, 'Active',
            nullif(btrim(rec->>'nextStep'),''), transaction_timestamp(), transaction_timestamp(), 1);
        insert into public.activity_events(organisation_id, entity_type, entity_id, event_type, summary, actor_membership_id, actor_type, occurred_at, details)
          values (p_organisation_id, 'mortgage.referral_partner', new_id, 'referral_partner.created', 'Referral partner imported from CSV', actor, 'import', transaction_timestamp(),
            jsonb_build_object('referralPartnerId', new_id, 'importCommandId', p_command_id, 'version', 1));

      elsif p_kind = 'clients' then
        owner := (rec->>'ownerMembershipId')::uuid;
        perform private.require_active_broker(p_organisation_id, owner);
        if not private.has_capability(p_organisation_id, 'mortgage.household.assign') and owner <> actor then
          raise exception 'HOUSEHOLD_OWNER_SELF_ASSIGNMENT_REQUIRED' using errcode = '42501'; end if;
        if jsonb_array_length(coalesce(rec->'loans','[]'::jsonb)) > 0 and not private.has_capability(p_organisation_id, 'mortgage.loan-record.manage') then
          raise exception 'CAPABILITY_REQUIRED:mortgage.loan-record.manage' using errcode = '42501'; end if;
        if nullif(btrim(rec->>'displayName'),'') is null or jsonb_array_length(coalesce(rec->'members','[]'::jsonb)) = 0 then
          raise exception 'HOUSEHOLD_DISPLAY_NAME_REQUIRED' using errcode = '22023'; end if;
        new_id := gen_random_uuid(); member_index := 0;
        for member in select value from jsonb_array_elements(rec->'members') loop
          relationship := coalesce(member->>'relationship', case when member_index = 0 then 'Primary applicant' else 'Joint applicant' end);
          if relationship not in ('Primary applicant','Joint applicant','Guarantor','Other') or (member_index = 0) <> (relationship = 'Primary applicant') then
            raise exception 'VALID_HOUSEHOLD_RELATIONSHIP_REQUIRED' using errcode = '22023'; end if;
          contact_id := private.import_contact(p_organisation_id, actor, member);
          if member_index = 0 then
            primary_contact := contact_id;
            insert into public.mortgage_households(id, organisation_id, display_name, primary_contact_id, owner_membership_id, status, created_at, updated_at, version)
              values (new_id, p_organisation_id, btrim(rec->>'displayName'), contact_id, owner, 'Active', transaction_timestamp(), transaction_timestamp(), 1);
          end if;
          insert into public.mortgage_household_members(organisation_id, household_id, contact_id, relationship, is_primary)
            values (p_organisation_id, new_id, contact_id, relationship, member_index = 0);
          member_index := member_index + 1;
        end loop;
        insert into public.activity_events(organisation_id, entity_type, entity_id, event_type, summary, actor_membership_id, actor_type, occurred_at, details)
          values (p_organisation_id, 'mortgage.household', new_id, 'household.created', 'Client household imported from CSV', actor, 'import', transaction_timestamp(),
            jsonb_build_object('householdId', new_id, 'primaryContactId', primary_contact, 'importCommandId', p_command_id, 'version', 1));
        for loan in select value from jsonb_array_elements(coalesce(rec->'loans','[]'::jsonb)) loop
          if nullif(btrim(loan->>'lenderName'),'') is null then raise exception 'LENDER_REQUIRED' using errcode = '22023'; end if;
          if loan->>'rateType' is not null and loan->>'rateType' not in ('Fixed','Variable','Split') then raise exception 'VALID_RATE_TYPE_REQUIRED' using errcode = '22023'; end if;
          if loan->>'rateType' = 'Variable' and loan->>'fixedRateExpiryDate' is not null then raise exception 'VARIABLE_RATE_WITH_FIXED_EXPIRY' using errcode = '22023'; end if;
          insert into public.mortgage_minimal_loan_records(organisation_id, household_id, owner_membership_id, lender_name, loan_purpose, rate_type,
            fixed_rate_expiry_date, next_review_date, status, source, data_confidence)
          values (p_organisation_id, new_id, owner, btrim(loan->>'lenderName'), coalesce(loan->>'loanPurpose','Other'), loan->>'rateType',
            (loan->>'fixedRateExpiryDate')::date, (loan->>'nextReviewDate')::date, 'Active', 'CSV import', 'Unverified');
          insert into public.activity_events(organisation_id, entity_type, entity_id, event_type, summary, actor_membership_id, actor_type, occurred_at, details)
            values (p_organisation_id, 'mortgage.household', new_id, 'loan.created', 'Loan record imported from CSV', actor, 'import', transaction_timestamp(),
              jsonb_build_object('householdId', new_id, 'lenderName', btrim(loan->>'lenderName'), 'importCommandId', p_command_id));
        end loop;
      else
        raise exception 'VALID_IMPORT_KIND_REQUIRED' using errcode = '22023';
      end if;
      outcomes := outcomes || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('index', item.ordinality - 1, 'outcome', 'created', 'id', new_id, 'detail', match->>'note')));
    exception when others then
      -- The failed record's changes roll back to this point; the rest of the import continues.
      outcomes := outcomes || jsonb_build_array(jsonb_build_object('index', item.ordinality - 1, 'outcome', 'failed', 'detail', private.import_failure_code(sqlerrm, sqlstate)));
    end;
  end loop;

  perform set_config('app.audit_actor_type', '', true);
  result := jsonb_build_object('kind', p_kind, 'items', outcomes);
  return private.finish_operation_command(p_organisation_id, p_command_id, result);
end
$$;

revoke all on function public.import_mortgage_records(uuid,uuid,text,jsonb) from public, anon;
grant execute on function public.import_mortgage_records(uuid,uuid,text,jsonb) to authenticated;
