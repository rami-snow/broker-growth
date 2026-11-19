-- Milestone 4B.1 current-slice indexes. Each index supports a checked-in lead
-- read or an unindexed tenant foreign-key path; broad advisor suggestions are
-- deliberately excluded until a corresponding application query exists.

-- Lead list and Today begin with the active organisation ordered newest first.
create index leads_organisation_created_at_idx
  on public.leads (organisation_id, created_at desc, id);

-- Active assignees are loaded per organisation for lead operation controls.
create index organisation_memberships_active_lookup_idx
  on public.organisation_memberships (organisation_id, status, id);

-- Lead detail/list projections retrieve only tasks for the selected lead IDs;
-- this also indexes the tenant-scoped tasks -> leads foreign-key direction.
create index tasks_lead_due_at_idx
  on public.tasks (organisation_id, lead_id, due_at)
  where lead_id is not null;

-- Lead detail/list projections retrieve appointments by exact lead IDs; this
-- also indexes the tenant-scoped appointments -> leads foreign-key direction.
create index appointments_lead_starts_at_idx
  on public.appointments (organisation_id, lead_id, starts_at);
