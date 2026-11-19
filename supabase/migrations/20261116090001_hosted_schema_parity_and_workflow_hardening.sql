-- Broker Growth Desk Milestone 4A.1 hosted schema parity and workflow hardening.
-- Ordinary authenticated clients remain read-only until Milestone 4B adds
-- narrow, transactional operations for each workflow.

-- Preserve existing task targets while moving to the typed subject contract.
alter table public.tasks
  add column subject_type text,
  add column subject_id uuid;

update public.tasks
set subject_type = 'mortgage.review-opportunity',
    subject_id = opportunity_id
where opportunity_id is not null;

alter table public.tasks
  add column mortgage_household_id uuid generated always as (
    case when subject_type = 'mortgage.household' then subject_id end
  ) stored,
  add column mortgage_review_opportunity_id uuid generated always as (
    case when subject_type = 'mortgage.review-opportunity' then subject_id end
  ) stored;

alter table public.tasks
  drop constraint tasks_check,
  drop constraint tasks_priority_check,
  add constraint tasks_target_shape check (
    (
      lead_id is not null
      and opportunity_id is null
      and subject_type is null
      and subject_id is null
    )
    or
    (
      lead_id is null
      and subject_type is not null
      and subject_id is not null
      and (
        (subject_type = 'mortgage.household' and opportunity_id is null)
        or
        (subject_type = 'mortgage.review-opportunity' and opportunity_id = subject_id)
      )
    )
  ),
  add constraint tasks_priority_allowed check (priority in ('Low','Normal','High')),
  add constraint tasks_mortgage_household_fkey
    foreign key (organisation_id, mortgage_household_id)
    references public.mortgage_households(organisation_id, id),
  add constraint tasks_mortgage_review_opportunity_fkey
    foreign key (organisation_id, mortgage_review_opportunity_id)
    references public.opportunities(organisation_id, id);

create index tasks_mortgage_household_idx
  on public.tasks (organisation_id, mortgage_household_id)
  where mortgage_household_id is not null;
create index tasks_mortgage_review_opportunity_idx
  on public.tasks (organisation_id, mortgage_review_opportunity_id)
  where mortgage_review_opportunity_id is not null;

-- Align controlled values with the TypeScript domain.
update public.opportunities
set lifecycle_status = 'Review booked'
where lifecycle_status = 'In progress';

alter table public.opportunities
  drop constraint opportunities_lifecycle_status_check,
  add constraint opportunities_lifecycle_status_allowed
    check (lifecycle_status in ('Upcoming','Due','Overdue','Review booked','Completed','Dismissed')),
  add constraint opportunities_type_allowed
    check (opportunity_type in ('Annual review','Fixed-rate expiry')),
  add constraint opportunities_subject_type_allowed
    check (subject_type = 'mortgage.household');

alter table public.tasks
  drop constraint tasks_status_check,
  add constraint tasks_status_allowed
    check (status in ('Open','Completed','Cancelled'));

alter table public.mortgage_households
  drop constraint mortgage_households_status_check,
  add column source_lead_id uuid,
  add constraint mortgage_households_status_allowed
    check (status in ('Active','Inactive','Archived')),
  add constraint mortgage_households_source_lead_fkey
    foreign key (organisation_id, source_lead_id)
    references public.leads(organisation_id, id);

create index mortgage_households_source_lead_idx
  on public.mortgage_households (organisation_id, source_lead_id)
  where source_lead_id is not null;

alter table public.mortgage_referral_partners
  add column phone text,
  add constraint mortgage_referral_partner_type_allowed check (
    partner_type in ('Accountant','Real estate agent','Buyer’s agent','Financial adviser','Conveyancer','Existing client','Other')
  );

alter table public.mortgage_lead_details
  add constraint mortgage_lead_details_loan_purpose_allowed check (
    loan_purpose in ('Purchase','Refinance','Investment purchase','Construction loan','Asset finance','Commercial finance','Other')
  ),
  add constraint mortgage_lead_details_timeframe_allowed check (
    timeframe in ('Immediately','Within 1 month','1–3 months','3–6 months','Researching')
  );

alter table public.mortgage_household_members
  add constraint mortgage_household_members_relationship_allowed check (
    relationship in ('Primary applicant','Joint applicant','Guarantor','Other')
  );

alter table public.mortgage_minimal_loan_records
  add constraint mortgage_loan_record_source_allowed check (
    source in ('Lead conversion','Manual entry','Imported fixture')
  );

update public.appointments set notes = '' where notes is null;
alter table public.appointments
  alter column notes set default '',
  alter column notes set not null;

-- Campaign registry keys are deliberately mortgage-specific and exact.
update public.campaign_versions
set purpose_key = case purpose_key
      when 'mortgage.annual-review' then 'mortgage.annual-review-reminder'
      when 'mortgage.fixed-rate-expiry' then 'mortgage.fixed-rate-expiry-reminder'
      else purpose_key
    end,
    audience_source_key = case audience_source_key
      when 'mortgage.review-opportunities' then 'mortgage.annual-review-opportunities'
      when 'mortgage.fixed-expiry-opportunities' then 'mortgage.fixed-rate-expiry-opportunities'
      else audience_source_key
    end;

alter table public.campaign_versions
  add constraint campaign_versions_purpose_key_allowed check (
    purpose_key in ('mortgage.annual-review-reminder','mortgage.fixed-rate-expiry-reminder')
  ),
  add constraint campaign_versions_audience_source_key_allowed check (
    audience_source_key in ('mortgage.annual-review-opportunities','mortgage.fixed-rate-expiry-opportunities')
  ),
  add constraint campaign_versions_registry_pair check (
    (purpose_key = 'mortgage.annual-review-reminder' and audience_source_key = 'mortgage.annual-review-opportunities')
    or
    (purpose_key = 'mortgage.fixed-rate-expiry-reminder' and audience_source_key = 'mortgage.fixed-rate-expiry-opportunities')
  );

alter table public.audience_recipients
  add constraint audience_recipients_consent_status_allowed check (
    consent_status in ('Recorded','Not recorded','Opted out','Missing')
  ),
  add constraint audience_recipients_suppression_status_allowed check (
    suppression_status in ('None','Organisation','Contact','Channel')
  );

alter table public.consent_evidence
  add constraint consent_evidence_provenance_allowed check (
    provenance in ('Lead conversion','Manual entry','Imported fixture','External change')
  );

alter table public.campaign_activity_events
  add constraint campaign_activity_event_type_allowed check (
    event_type in (
      'campaign.created','campaign.edited','campaign.previewed','campaign.submitted',
      'campaign.audience_changed','campaign.approved','campaign.rejected',
      'campaign.cancelled','campaign.draft_created','consent.external_change_recorded'
    )
  );

-- Close every direct browser workflow bypass. Read policies remain in place;
-- future mutations must arrive through separately reviewed operations.
revoke insert, update, delete, truncate, references, trigger
  on all tables in schema public from authenticated;
revoke usage, update on all sequences in schema public from authenticated;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select schemaname, tablename, policyname
    from pg_policies
    where schemaname = 'public'
      and cmd <> 'SELECT'
  loop
    execute format(
      'drop policy %I on %I.%I',
      policy_record.policyname,
      policy_record.schemaname,
      policy_record.tablename
    );
  end loop;
end
$$;
