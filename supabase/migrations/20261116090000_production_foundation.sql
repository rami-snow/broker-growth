-- Broker Growth Desk Milestone 4A production foundation.
-- Migrations are the schema source of truth; no hosted project is linked.

create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create table public.user_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  short_name text not null check (length(trim(short_name)) between 1 and 12),
  vertical_key text not null check (vertical_key = 'mortgage'),
  status text not null check (status in ('Active','Inactive')),
  region text,
  created_at timestamptz not null default now(),
  unique (id, vertical_key)
);

create table public.organisation_memberships (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) > 0),
  status text not null check (status in ('Active','Inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, user_id),
  unique (organisation_id, id)
);

create table public.membership_capabilities (
  organisation_id uuid not null,
  membership_id uuid not null,
  capability text not null check (capability ~ '^[a-z][a-z.-]+$'),
  granted_at timestamptz not null default now(),
  primary key (organisation_id, membership_id, capability),
  foreign key (organisation_id, membership_id) references public.organisation_memberships(organisation_id, id) on delete cascade
);

create table public.contacts (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
  given_name text not null, family_name text not null, email text, email_normalized text, phone text, phone_normalized text,
  preferred_contact_method text check (preferred_contact_method in ('Phone','Email','SMS')),
  status text not null default 'Active' check (status in ('Active','Inactive')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organisation_id, id)
);

create table public.mortgage_referral_partners (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
  name text not null, organisation_name text, partner_type text not null, email text, status text not null check (status in ('Active','Inactive')),
  owner_membership_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organisation_id,id),
  foreign key (organisation_id,owner_membership_id) references public.organisation_memberships(organisation_id,id)
);

create table public.leads (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id), contact_id uuid,
  owner_membership_id uuid, source text not null, lifecycle_status text not null check (lifecycle_status in ('New','Contact attempted','Contacted','Discovery booked','Nurture','Closed','Converted')),
  next_action_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1 check (version > 0),
  unique (organisation_id,id),
  foreign key (organisation_id,contact_id) references public.contacts(organisation_id,id),
  foreign key (organisation_id,owner_membership_id) references public.organisation_memberships(organisation_id,id)
);

create table public.opportunities (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
  opportunity_type text not null, lifecycle_status text not null check (lifecycle_status in ('Upcoming','Due','Overdue','In progress','Completed','Dismissed')),
  trigger_date date not null, subject_type text not null, subject_id uuid not null, owner_membership_id uuid,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), completed_at timestamptz, dismissal_reason text,
  unique (organisation_id,id),
  foreign key (organisation_id,owner_membership_id) references public.organisation_memberships(organisation_id,id)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
  lead_id uuid, opportunity_id uuid, assigned_membership_id uuid not null, created_by_membership_id uuid not null,
  title text not null, due_at timestamptz not null, priority text not null check (priority in ('Normal','High')), status text not null check (status in ('Open','Completed','Cancelled')), created_at timestamptz not null default now(),
  unique (organisation_id,id), check (num_nonnulls(lead_id,opportunity_id) = 1),
  foreign key (organisation_id,lead_id) references public.leads(organisation_id,id),
  foreign key (organisation_id,opportunity_id) references public.opportunities(organisation_id,id),
  foreign key (organisation_id,assigned_membership_id) references public.organisation_memberships(organisation_id,id),
  foreign key (organisation_id,created_by_membership_id) references public.organisation_memberships(organisation_id,id)
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id), lead_id uuid not null,
  assigned_membership_id uuid not null, starts_at timestamptz not null, duration_minutes integer not null check (duration_minutes between 15 and 240),
  meeting_method text not null check (meeting_method in ('Phone','Video','In person')), location_or_link text, notes text,
  status text not null check (status in ('Booked','Completed','Cancelled')), created_at timestamptz not null default now(),
  unique (organisation_id,id),
  foreign key (organisation_id,lead_id) references public.leads(organisation_id,id),
  foreign key (organisation_id,assigned_membership_id) references public.organisation_memberships(organisation_id,id)
);

create table public.consent_evidence (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id), contact_id uuid not null,
  channel text not null check (channel in ('Email','SMS','Phone')), status text not null check (status in ('Recorded','Not recorded','Opted out')),
  source text not null, effective_at timestamptz not null, recorded_at timestamptz not null default now(), actor_membership_id uuid,
  evidence_note text, external_action_confirmed boolean not null default false, provenance text not null,
  unique (organisation_id,id),
  foreign key (organisation_id,contact_id) references public.contacts(organisation_id,id),
  foreign key (organisation_id,actor_membership_id) references public.organisation_memberships(organisation_id,id),
  check (status <> 'Recorded' or provenance <> 'External change' or (external_action_confirmed and evidence_note is not null and length(trim(evidence_note)) > 0))
);

create table public.suppression_history (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id), contact_id uuid,
  scope text not null check (scope in ('Organisation','Contact','Channel')), channel text check (channel in ('Email','SMS','Phone')),
  status text not null check (status in ('Active','Lifted')), source text not null, reason text,
  effective_at timestamptz not null, recorded_at timestamptz not null default now(), actor_membership_id uuid,
  unique (organisation_id,id),
  foreign key (organisation_id,contact_id) references public.contacts(organisation_id,id),
  foreign key (organisation_id,actor_membership_id) references public.organisation_memberships(organisation_id,id),
  check ((scope='Organisation' and contact_id is null and channel is null) or (scope='Contact' and contact_id is not null and channel is null) or (scope='Channel' and contact_id is not null and channel is not null))
);

create table public.activity_events (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id),
  entity_type text not null, entity_id uuid not null, event_type text not null, summary text not null,
  actor_membership_id uuid, occurred_at timestamptz not null default now(), details jsonb not null default '{}'::jsonb check (jsonb_typeof(details)='object'),
  unique (organisation_id,id), foreign key (organisation_id,actor_membership_id) references public.organisation_memberships(organisation_id,id)
);

create table public.campaigns (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id), name text not null,
  owner_membership_id uuid not null, status text not null check (status in ('Draft','Ready for review','Approved','Rejected','Cancelled')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (organisation_id,id), foreign key (organisation_id,owner_membership_id) references public.organisation_memberships(organisation_id,id)
);

create table public.campaign_versions (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, campaign_id uuid not null, version_number integer not null check (version_number > 0),
  state text not null check (state in ('Draft','Frozen')), purpose_key text not null, audience_source_key text not null,
  channel text not null check (channel in ('Email','SMS')), subject text, body text not null, merge_field_keys text[] not null default '{}',
  created_by_membership_id uuid not null, created_at timestamptz not null default now(), frozen_at timestamptz,
  unique (organisation_id,id), unique (organisation_id,campaign_id,version_number), unique (organisation_id,campaign_id,id),
  foreign key (organisation_id,campaign_id) references public.campaigns(organisation_id,id),
  foreign key (organisation_id,created_by_membership_id) references public.organisation_memberships(organisation_id,id),
  check ((state='Draft' and frozen_at is null) or (state='Frozen' and frozen_at is not null)), check ((channel='Email' and subject is not null) or channel='SMS')
);

alter table public.campaigns add column current_version_id uuid, add column submitted_version_id uuid;
alter table public.campaigns add foreign key (organisation_id,id,current_version_id) references public.campaign_versions(organisation_id,campaign_id,id);
alter table public.campaigns add foreign key (organisation_id,id,submitted_version_id) references public.campaign_versions(organisation_id,campaign_id,id);

create table public.audience_snapshots (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, campaign_id uuid not null, campaign_version_id uuid not null,
  stage text not null check (stage in ('Preview','Submission','Approval')), evaluated_at timestamptz not null,
  eligible_count integer not null check (eligible_count >= 0), excluded_count integer not null check (excluded_count >= 0),
  previous_snapshot_id uuid, created_at timestamptz not null default now(),
  unique (organisation_id,id), unique (organisation_id,campaign_id,id), unique (organisation_id,campaign_id,campaign_version_id,id),
  foreign key (organisation_id,campaign_id,campaign_version_id) references public.campaign_versions(organisation_id,campaign_id,id),
  foreign key (organisation_id,previous_snapshot_id) references public.audience_snapshots(organisation_id,id)
);

create table public.audience_recipients (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, audience_snapshot_id uuid not null, candidate_key text not null,
  contact_id uuid not null, subject_id uuid not null, subject_display_name text not null, context_label text not null,
  eligible boolean not null, masked_destination text not null, consent_status text not null, suppression_status text not null,
  resolved_merge_values jsonb not null default '{}'::jsonb check (jsonb_typeof(resolved_merge_values)='object'),
  unique (organisation_id,id), unique (organisation_id,audience_snapshot_id,candidate_key),
  foreign key (organisation_id,audience_snapshot_id) references public.audience_snapshots(organisation_id,id),
  foreign key (organisation_id,contact_id) references public.contacts(organisation_id,id)
);

create table public.recipient_eligibility_reasons (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, audience_recipient_id uuid not null,
  reason_order smallint not null check (reason_order > 0), reason_code text not null, display_reason text not null, is_primary boolean not null default false,
  unique (organisation_id,id), unique (organisation_id,audience_recipient_id,reason_order),
  foreign key (organisation_id,audience_recipient_id) references public.audience_recipients(organisation_id,id)
);

create table public.campaign_approvals (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, campaign_id uuid not null, campaign_version_id uuid not null,
  reviewed_snapshot_id uuid not null, final_snapshot_id uuid not null, approving_membership_id uuid not null, approved_at timestamptz not null default now(),
  eligible_recipient_count integer not null check (eligible_recipient_count >= 0), excluded_recipient_count integer not null check (excluded_recipient_count >= 0),
  no_delivery_occurred boolean not null check (no_delivery_occurred), unique (organisation_id,id),
  foreign key (organisation_id,campaign_id,campaign_version_id) references public.campaign_versions(organisation_id,campaign_id,id),
  foreign key (organisation_id,campaign_id,campaign_version_id,reviewed_snapshot_id) references public.audience_snapshots(organisation_id,campaign_id,campaign_version_id,id),
  foreign key (organisation_id,campaign_id,campaign_version_id,final_snapshot_id) references public.audience_snapshots(organisation_id,campaign_id,campaign_version_id,id),
  foreign key (organisation_id,approving_membership_id) references public.organisation_memberships(organisation_id,id)
);

create table public.campaign_activity_events (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, campaign_id uuid not null, campaign_version_id uuid,
  event_type text not null, summary text not null, note text, actor_membership_id uuid not null, occurred_at timestamptz not null default now(),
  unique (organisation_id,id), foreign key (organisation_id,campaign_id) references public.campaigns(organisation_id,id),
  foreign key (organisation_id,campaign_version_id) references public.campaign_versions(organisation_id,id),
  foreign key (organisation_id,actor_membership_id) references public.organisation_memberships(organisation_id,id)
);

-- Mortgage vertical tables remain explicit and do not leak mortgage meaning into platform tables.
create table public.mortgage_membership_profiles (
  organisation_id uuid not null, membership_id uuid not null, position text not null check (position in ('Brokerage administrator','Broker','Support person')),
  primary key (organisation_id,membership_id), foreign key (organisation_id,membership_id) references public.organisation_memberships(organisation_id,id) on delete cascade
);

create table public.mortgage_lead_details (
  organisation_id uuid not null, lead_id uuid not null, loan_purpose text not null, timeframe text not null, preferred_contact_method text not null check (preferred_contact_method in ('Phone','Email','SMS')),
  referral_partner_id uuid, primary key (organisation_id,lead_id), foreign key (organisation_id,lead_id) references public.leads(organisation_id,id) on delete cascade,
  foreign key (organisation_id,referral_partner_id) references public.mortgage_referral_partners(organisation_id,id)
);

create table public.mortgage_households (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id), display_name text not null,
  primary_contact_id uuid not null, owner_membership_id uuid not null, referral_partner_id uuid, status text not null check (status in ('Active','Inactive')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1 check (version > 0),
  unique (organisation_id,id), foreign key (organisation_id,primary_contact_id) references public.contacts(organisation_id,id),
  foreign key (organisation_id,owner_membership_id) references public.organisation_memberships(organisation_id,id),
  foreign key (organisation_id,referral_partner_id) references public.mortgage_referral_partners(organisation_id,id)
);

create table public.mortgage_household_members (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, household_id uuid not null, contact_id uuid not null,
  relationship text not null, is_primary boolean not null default false, unique (organisation_id,id), unique (organisation_id,household_id,contact_id),
  foreign key (organisation_id,household_id) references public.mortgage_households(organisation_id,id) on delete cascade,
  foreign key (organisation_id,contact_id) references public.contacts(organisation_id,id)
);
create unique index household_one_primary_idx on public.mortgage_household_members(organisation_id,household_id) where is_primary;

create table public.mortgage_minimal_loan_records (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, household_id uuid not null, owner_membership_id uuid not null,
  external_reference text, lender_name text not null, loan_purpose text not null, settlement_date date, fixed_rate_expiry_date date, last_review_date date, next_review_date date,
  status text not null check (status in ('Active','Discharged','Unknown')), source text not null, data_confidence text not null check (data_confidence in ('Confirmed','Unverified')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), version integer not null default 1 check(version > 0),
  unique (organisation_id,id), foreign key (organisation_id,household_id) references public.mortgage_households(organisation_id,id),
  foreign key (organisation_id,owner_membership_id) references public.organisation_memberships(organisation_id,id)
);

create table public.mortgage_review_opportunities (
  organisation_id uuid not null, opportunity_id uuid not null, household_id uuid not null, loan_record_id uuid not null,
  trigger_type text not null check (trigger_type in ('Annual review','Fixed-rate expiry')), trigger_date date not null,
  primary key (organisation_id,opportunity_id), unique (organisation_id,loan_record_id,trigger_type,trigger_date),
  foreign key (organisation_id,opportunity_id) references public.opportunities(organisation_id,id) on delete cascade,
  foreign key (organisation_id,household_id) references public.mortgage_households(organisation_id,id),
  foreign key (organisation_id,loan_record_id) references public.mortgage_minimal_loan_records(organisation_id,id)
);

create table public.mortgage_lead_household_conversions (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, lead_id uuid not null, household_id uuid not null,
  converted_by_membership_id uuid not null, converted_at timestamptz not null default now(), unique (organisation_id,id), unique (organisation_id,lead_id),
  foreign key (organisation_id,lead_id) references public.leads(organisation_id,id), foreign key (organisation_id,household_id) references public.mortgage_households(organisation_id,id),
  foreign key (organisation_id,converted_by_membership_id) references public.organisation_memberships(organisation_id,id)
);

-- Tenant-aware indexes follow current product query paths and RLS filters.
create index organisation_memberships_user_idx on public.organisation_memberships(user_id,status,organisation_id);
create index membership_capabilities_membership_idx on public.membership_capabilities(membership_id,organisation_id);
create index contacts_email_idx on public.contacts(organisation_id,email_normalized); create index contacts_phone_idx on public.contacts(organisation_id,phone_normalized);
create index leads_status_idx on public.leads(organisation_id,lifecycle_status,next_action_at); create index leads_owner_idx on public.leads(organisation_id,owner_membership_id,lifecycle_status);
create index tasks_due_idx on public.tasks(organisation_id,status,due_at); create index appointments_start_idx on public.appointments(organisation_id,status,starts_at);
create index opportunities_trigger_idx on public.opportunities(organisation_id,opportunity_type,lifecycle_status,trigger_date); create index opportunities_owner_idx on public.opportunities(organisation_id,owner_membership_id);
create index consent_effective_idx on public.consent_evidence(organisation_id,contact_id,channel,effective_at desc,recorded_at desc);
create index suppression_effective_idx on public.suppression_history(organisation_id,scope,contact_id,channel,effective_at desc,recorded_at desc);
create index activity_entity_idx on public.activity_events(organisation_id,entity_type,entity_id,occurred_at desc);
create index campaigns_status_idx on public.campaigns(organisation_id,status,owner_membership_id); create index campaign_versions_campaign_idx on public.campaign_versions(organisation_id,campaign_id,version_number desc);
create index snapshots_campaign_idx on public.audience_snapshots(organisation_id,campaign_id,campaign_version_id,created_at desc); create index campaign_activity_idx on public.campaign_activity_events(organisation_id,campaign_id,occurred_at desc);
create index households_owner_idx on public.mortgage_households(organisation_id,owner_membership_id,status); create index loans_household_idx on public.mortgage_minimal_loan_records(organisation_id,household_id,status);

-- Narrow security-definer helpers avoid recursive membership RLS and never trust JWT metadata.
create or replace function private.has_active_membership(target_organisation_id uuid) returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (select 1 from public.organisation_memberships m join public.organisations o on o.id=m.organisation_id where m.organisation_id=target_organisation_id and m.user_id=(select auth.uid()) and m.status='Active' and o.status='Active')
$$;
create or replace function private.current_membership_id(target_organisation_id uuid) returns uuid language sql stable security definer set search_path = '' as $$
  select m.id from public.organisation_memberships m join public.organisations o on o.id=m.organisation_id where m.organisation_id=target_organisation_id and m.user_id=(select auth.uid()) and m.status='Active' and o.status='Active' limit 1
$$;
create or replace function private.has_capability(target_organisation_id uuid, required_capability text) returns boolean language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and exists (select 1 from public.organisation_memberships m join public.membership_capabilities c on c.organisation_id=m.organisation_id and c.membership_id=m.id join public.organisations o on o.id=m.organisation_id where m.organisation_id=target_organisation_id and m.user_id=(select auth.uid()) and m.status='Active' and o.status='Active' and c.capability=required_capability)
$$;
revoke all on function private.has_active_membership(uuid), private.current_membership_id(uuid), private.has_capability(uuid,text) from public, anon;
grant execute on function private.has_active_membership(uuid), private.current_membership_id(uuid), private.has_capability(uuid,text) to authenticated;

-- Append-only and frozen-record protection supplements RLS. Administrators can still alter the database.
create or replace function private.reject_mutation() returns trigger language plpgsql set search_path = '' as $$ begin raise exception '% is append-only', tg_table_name using errcode='42501'; end $$;
create or replace function private.protect_frozen_campaign_version() returns trigger language plpgsql set search_path = '' as $$ begin if old.state='Frozen' then raise exception 'Frozen campaign versions are immutable' using errcode='42501'; end if; return new; end $$;
create trigger protect_frozen_version_update before update on public.campaign_versions for each row execute function private.protect_frozen_campaign_version();
create trigger protect_campaign_version_delete before delete on public.campaign_versions for each row execute function private.reject_mutation();
do $$ declare table_name text; begin foreach table_name in array array['activity_events','consent_evidence','suppression_history','audience_snapshots','audience_recipients','recipient_eligibility_reasons','campaign_approvals','campaign_activity_events'] loop execute format('create trigger reject_%I_mutation before update or delete on public.%I for each row execute function private.reject_mutation()',table_name,table_name); end loop; end $$;

-- Deny by default. Authenticated access combines grants with explicit policies.
do $$ declare table_name text; begin foreach table_name in array array['user_profiles','organisations','organisation_memberships','membership_capabilities','contacts','mortgage_referral_partners','leads','opportunities','tasks','appointments','consent_evidence','suppression_history','activity_events','campaigns','campaign_versions','audience_snapshots','audience_recipients','recipient_eligibility_reasons','campaign_approvals','campaign_activity_events','mortgage_membership_profiles','mortgage_lead_details','mortgage_households','mortgage_household_members','mortgage_minimal_loan_records','mortgage_review_opportunities','mortgage_lead_household_conversions'] loop execute format('alter table public.%I enable row level security',table_name); execute format('revoke all on public.%I from anon, authenticated',table_name); execute format('grant select on public.%I to authenticated',table_name); end loop; end $$;

create policy profiles_read_self on public.user_profiles for select to authenticated using ((select auth.uid())=user_id);
create policy organisations_read_membership on public.organisations for select to authenticated using ((select private.has_active_membership(id)));
create policy memberships_read_organisation on public.organisation_memberships for select to authenticated using ((select private.has_active_membership(organisation_id)));
create policy capabilities_read_organisation on public.membership_capabilities for select to authenticated using ((select private.has_active_membership(organisation_id)));

do $$ declare table_name text; begin foreach table_name in array array['tasks','appointments','activity_events','mortgage_membership_profiles'] loop execute format('create policy tenant_read on public.%I for select to authenticated using ((select private.has_active_membership(organisation_id)))',table_name); end loop; end $$;
do $$ declare table_name text; begin foreach table_name in array array['contacts'] loop execute format('create policy capability_read on public.%I for select to authenticated using ((select private.has_capability(organisation_id,''contact.view'')))',table_name); end loop; end $$;
do $$ declare table_name text; begin foreach table_name in array array['leads','mortgage_lead_details'] loop execute format('create policy capability_read on public.%I for select to authenticated using ((select private.has_capability(organisation_id,''lead.view'')))',table_name); end loop; end $$;
do $$ declare table_name text; begin foreach table_name in array array['opportunities'] loop execute format('create policy capability_read on public.%I for select to authenticated using ((select private.has_capability(organisation_id,''opportunity.view'')))',table_name); end loop; end $$;
do $$ declare table_name text; begin foreach table_name in array array['consent_evidence'] loop execute format('create policy capability_read on public.%I for select to authenticated using ((select private.has_capability(organisation_id,''consent.view'')))',table_name); end loop; end $$;
do $$ declare table_name text; begin foreach table_name in array array['campaigns','campaign_versions','audience_snapshots','audience_recipients','recipient_eligibility_reasons','campaign_approvals','campaign_activity_events','suppression_history'] loop execute format('create policy capability_read on public.%I for select to authenticated using ((select private.has_capability(organisation_id,''campaign.view'')))',table_name); end loop; end $$;
do $$ declare table_name text; begin foreach table_name in array array['mortgage_referral_partners'] loop execute format('create policy capability_read on public.%I for select to authenticated using ((select private.has_capability(organisation_id,''mortgage.referral.view'')))',table_name); end loop; end $$;
do $$ declare table_name text; begin foreach table_name in array array['mortgage_households','mortgage_household_members','mortgage_minimal_loan_records','mortgage_lead_household_conversions'] loop execute format('create policy capability_read on public.%I for select to authenticated using ((select private.has_capability(organisation_id,''mortgage.household.view'')))',table_name); end loop; end $$;
create policy capability_read on public.mortgage_review_opportunities for select to authenticated using ((select private.has_capability(organisation_id,'mortgage.review-opportunity.view')));

grant insert,update on public.contacts,public.mortgage_referral_partners,public.leads,public.opportunities,public.tasks,public.appointments,public.campaigns,public.campaign_versions,public.mortgage_lead_details,public.mortgage_households,public.mortgage_household_members,public.mortgage_minimal_loan_records,public.mortgage_review_opportunities,public.mortgage_lead_household_conversions to authenticated;
grant insert on public.consent_evidence,public.suppression_history,public.activity_events,public.audience_snapshots,public.audience_recipients,public.recipient_eligibility_reasons,public.campaign_approvals,public.campaign_activity_events to authenticated;

create policy contacts_write on public.contacts for all to authenticated using ((select private.has_capability(organisation_id,'contact.update'))) with check ((select private.has_capability(organisation_id,'contact.update')));
create policy referrals_write on public.mortgage_referral_partners for all to authenticated using ((select private.has_capability(organisation_id,'mortgage.referral.manage'))) with check ((select private.has_capability(organisation_id,'mortgage.referral.manage')));
create policy leads_write on public.leads for all to authenticated using ((select private.has_capability(organisation_id,'lead.update'))) with check ((select private.has_capability(organisation_id,'lead.update')));
create policy opportunities_write on public.opportunities for all to authenticated using ((select private.has_capability(organisation_id,'opportunity.manage'))) with check ((select private.has_capability(organisation_id,'opportunity.manage')));
create policy tasks_write on public.tasks for all to authenticated using ((select private.has_capability(organisation_id,'task.create'))) with check ((select private.has_capability(organisation_id,'task.create')));
create policy appointments_write on public.appointments for all to authenticated using ((select private.has_capability(organisation_id,'appointment.create'))) with check ((select private.has_capability(organisation_id,'appointment.create')));
create policy consent_append on public.consent_evidence for insert to authenticated with check ((select private.has_capability(organisation_id,'consent.record-external-change')) and actor_membership_id=(select private.current_membership_id(organisation_id)));
create policy suppression_append on public.suppression_history for insert to authenticated with check ((select private.has_capability(organisation_id,'campaign.edit')) and actor_membership_id=(select private.current_membership_id(organisation_id)));
create policy activity_append on public.activity_events for insert to authenticated with check ((select private.has_active_membership(organisation_id)) and actor_membership_id=(select private.current_membership_id(organisation_id)));
create policy campaigns_write on public.campaigns for all to authenticated using ((select private.has_capability(organisation_id,'campaign.edit'))) with check ((select private.has_capability(organisation_id,'campaign.edit')));
create policy versions_insert on public.campaign_versions for insert to authenticated with check ((select private.has_capability(organisation_id,'campaign.edit')) and created_by_membership_id=(select private.current_membership_id(organisation_id)));
create policy versions_update_draft on public.campaign_versions for update to authenticated using (state='Draft' and (select private.has_capability(organisation_id,'campaign.edit'))) with check (state in ('Draft','Frozen') and (select private.has_capability(organisation_id,'campaign.edit')));
create policy snapshots_append on public.audience_snapshots for insert to authenticated with check ((select private.has_capability(organisation_id,'campaign.submit')) or (select private.has_capability(organisation_id,'campaign.approve')));
create policy recipients_append on public.audience_recipients for insert to authenticated with check ((select private.has_capability(organisation_id,'campaign.submit')) or (select private.has_capability(organisation_id,'campaign.approve')));
create policy reasons_append on public.recipient_eligibility_reasons for insert to authenticated with check ((select private.has_capability(organisation_id,'campaign.submit')) or (select private.has_capability(organisation_id,'campaign.approve')));
create policy approvals_append on public.campaign_approvals for insert to authenticated with check ((select private.has_capability(organisation_id,'campaign.approve')) and approving_membership_id=(select private.current_membership_id(organisation_id)) and no_delivery_occurred);
create policy campaign_activity_append on public.campaign_activity_events for insert to authenticated with check ((select private.has_active_membership(organisation_id)) and actor_membership_id=(select private.current_membership_id(organisation_id)));
create policy mortgage_leads_write on public.mortgage_lead_details for all to authenticated using ((select private.has_capability(organisation_id,'lead.update'))) with check ((select private.has_capability(organisation_id,'lead.update')));
create policy households_write on public.mortgage_households for all to authenticated using ((select private.has_capability(organisation_id,'mortgage.household.update'))) with check ((select private.has_capability(organisation_id,'mortgage.household.update')));
create policy household_members_write on public.mortgage_household_members for all to authenticated using ((select private.has_capability(organisation_id,'mortgage.household.update'))) with check ((select private.has_capability(organisation_id,'mortgage.household.update')));
create policy loans_write on public.mortgage_minimal_loan_records for all to authenticated using ((select private.has_capability(organisation_id,'mortgage.loan-record.manage'))) with check ((select private.has_capability(organisation_id,'mortgage.loan-record.manage')));
create policy mortgage_opportunities_write on public.mortgage_review_opportunities for all to authenticated using ((select private.has_capability(organisation_id,'mortgage.review-opportunity.manage'))) with check ((select private.has_capability(organisation_id,'mortgage.review-opportunity.manage')));
create policy conversions_write on public.mortgage_lead_household_conversions for all to authenticated using ((select private.has_capability(organisation_id,'mortgage.household.create'))) with check ((select private.has_capability(organisation_id,'mortgage.household.create')));

-- Membership profiles/capabilities/memberships intentionally have no ordinary write policy.
-- Controlled administrator provisioning remains a future server-only workflow.
