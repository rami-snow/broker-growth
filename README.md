# Broker Growth Desk — Milestone 4F

A dual-runtime application for Australian mortgage brokerages, verified through Milestone 4F. Fixture mode provides the complete in-memory UI walkthrough. Supabase mode provides invite-only authentication, server-verified organisation context and persistent Today, Leads, lead-to-client conversion, Client Book, retention/review and referral-partner workflows. Campaign planning remains fixture-only. The application cannot send, schedule, queue, export or track delivery of communications.

## Run locally

Requires Node.js 22+ and pnpm 11+.

```bash
pnpm install
pnpm dev
```

Open `http://localhost:3000`. The root route redirects to `/today`.

`APP_RUNTIME_MODE` defaults to `fixture`, which requires no environment variables. Copy `.env.example` to `.env.local` only when exercising the hosted development Supabase runtime. Supabase mode never falls back to or mixes in fixture business data.

## Hosted development Supabase

Milestone 4F continues to use the dedicated `AI Native Operations` project
(`fgqgcikmaccjamwocpat`) as development infrastructure only. Supabase labels a
main project branch `production`; that provider label does not authorize real
customer data or production use. Confirm the project name and reference before
every hosted command. Docker, Podman and local database resets are not part of
this workflow.

```bash
pnpm exec supabase projects list
pnpm exec supabase migration list --remote
pnpm exec supabase db push --dry-run --remote --skip-vault
SUPABASE_TEST_PASSWORD='<temporary fictional-user credential>' pnpm db:test:hosted-rest
pnpm db:test:hosted-client-book
pnpm db:test:hosted-maintenance
pnpm db:test:hosted-referrals
pnpm db:test:hosted-4f3
pnpm db:test:hosted-csv-import
SUPABASE_HOSTED_PROJECT_REF='fgqgcikmaccjamwocpat' \
SUPABASE_HOSTED_DATABASE_URL='<temporary TLS database connection string>' \
SUPABASE_HOSTED_CA_CERT_PATH='<temporary path to the project SSL root certificate>' \
  pnpm db:test:hosted-operations
SUPABASE_HOSTED_PROJECT_REF='fgqgcikmaccjamwocpat' \
SUPABASE_HOSTED_DATABASE_URL='<temporary TLS database connection string>' \
SUPABASE_HOSTED_CA_CERT_PATH='<temporary path to the project SSL root certificate>' \
  pnpm db:test:hosted-review
pnpm db:types
```

Checked-in migrations are authoritative. Hosted changes must be forward-only,
reviewed in a dry run and applied through `supabase db push`; never run a reset,
drop, truncate or database recreation against the hosted project. The seed is
deterministic fictional development data and assumes its four fictional Auth
users already exist. It contains no passwords. `db:types` is pinned to the
development project reference and generates
`src/platform/database/database.types.ts`; generated types must not be edited.

Copy only the hosted public API URL and publishable key into ignored
`.env.local`, set `APP_RUNTIME_MODE=supabase`, and run `pnpm dev`. Never add a
service-role or secret key to browser configuration, source or documentation.
Today and Leads then use persistent hosted records, including guarded lead
ownership, lifecycle, contact-attempt, task, appointment, referral-attribution
and conversion operations. Client Book supports tenant-scoped reads, atomic
conversion, guarded household/contact/member maintenance, minimal retention-only
loan records, annual-review and fixed-rate-expiry queues, review lifecycle work
and household follow-up tasks. Referral partners support tenant-scoped list and
detail reads, create/update, owner changes, inactivation/reactivation, normalized
duplicate review, lead attribution and explicit conversion attribution. Active
selectors exclude inactive partners while targeted linked-record reads preserve
historical attribution. Attribution is an operational record, not proof of
causation, commission or revenue. Campaign planning remains fixture-only and no
persistent campaign repository or operation boundary exists.

The deterministic development identities are `alex.morgan@example.test`,
`priya.shah@example.test`, `dana.ellis@example.test`, and
`inactive.user@example.test`. Create them only in the dedicated development
project and retain their credentials outside the repository.

The database suites have distinct purposes. `hosted-rest-rls.mjs` performs 40
live Auth/PostgREST assertions for public API grants and RLS. The Docker-free
lead-operation runners cover the original eight guarded lead operations, while
separate suites cover conversion, Client Book, retention and referrals rather
than implying that the original boundary authorizes those workflows. The
transaction-wrapped runners roll back and perform independent residue checks.
Project references, database connection strings, certificates and fictional-user
credentials are temporary process inputs only. Never store or print credentials.

`hosted-client-book-operations.sql` performs 61 assertions inside one hosted
transaction. It verifies conversion capability and ownership boundaries,
fresh duplicate matching, source-lead linkage, per-member consent evidence,
database pagination beyond 200 households, duplicate matching beyond the old
candidate boundary, referral-attribution audit history, rollback, tenancy,
stale-version handling and idempotency, then explicitly rolls back.
`hosted-lead-operations-cli.sql` provides the password-free CLI transport for
41 equivalent lead-operation assertions; its six independent residue queries
complete the existing 47-assertion regression without exposing a database URL.
`hosted-review-operations.mjs` and its password-free CLI counterpart cover 86
transaction-wrapped retention assertions across Sydney-date windows, generation,
reconciliation, ownership, concurrency, idempotency, lifecycle, tasks, audit,
conversion regression, rollback and independent zero-residue checks.

`hosted-client-maintenance-operations.sql` verifies 82 guarded household,
contact, member, loan, task and review maintenance assertions, including
archived-state boundaries. `hosted-referral-partner-operations.sql` verifies 43
persistent referral directory, normalization, duplicate review, lifecycle, lead
and conversion attribution, capability-combination, direct-write denial,
rollback and residue assertions.

The transaction-wrapped pgTAP suites remain checked in under
`supabase/tests/database`. Supabase CLI 3.1.0 delegates `supabase test db
--remote` to Docker/Podman, so they are not interchangeable with either hosted
suite and must not be reported as executed unless a PostgreSQL pgTAP runner was
actually available.

## Verify

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm exec playwright install chromium
pnpm test:e2e
pnpm build
SUPABASE_TEST_PASSWORD='<temporary fictional-user credential>' pnpm db:test:hosted-rest
pnpm db:test:hosted-client-book
pnpm db:test:hosted-maintenance
pnpm db:test:hosted-referrals
SUPABASE_HOSTED_PROJECT_REF='fgqgcikmaccjamwocpat' \
SUPABASE_HOSTED_DATABASE_URL='<temporary TLS database connection string>' \
SUPABASE_HOSTED_CA_CERT_PATH='<temporary path to the project SSL root certificate>' \
  pnpm db:test:hosted-operations
SUPABASE_HOSTED_PROJECT_REF='fgqgcikmaccjamwocpat' \
SUPABASE_HOSTED_DATABASE_URL='<temporary TLS database connection string>' \
SUPABASE_HOSTED_CA_CERT_PATH='<temporary path to the project SSL root certificate>' \
  pnpm db:test:hosted-review
```

## Prototype boundaries

All people, brokerages, contact details and activity are fictional. Fixture state is held in memory and resets on reload. Its development user and brokerage switchers remain simulations, not authentication. Supabase mode uses cookie-backed Auth sessions, database memberships and guarded persistent operations for lead-to-discovery work, conversion, Client Book maintenance, retention reviews and referral management. This remains development infrastructure rather than a production product. No email, SMS, calendar, CRM, file storage, document or messaging provider is connected.

The product does not perform serviceability, credit assessment, borrowing-capacity estimates, lender or product comparison, recommendations, responsible-lending decisions, financial advice or loan submission. It deliberately collects no income, expense, asset, liability or credit data.

Campaign eligibility and consent summaries are operational prototype controls, not complete legal determinations or legal advice.

## Architecture

- `src/platform` owns organisation tenancy, contacts, lead and opportunity foundations, tasks, appointments, consent, audit, shared permissions, campaign orchestration, versions, snapshots, suppression and approval.
- `src/verticals/mortgage` owns brokerage membership profiles, mortgage lead details, households, minimal loan records, referrals, conversion, mortgage review rules, campaign purposes, opportunity audience providers and mortgage merge fields.
- `src/features` composes platform and mortgage types while retaining the visible terms Brokerage, Broker, Client Book, Household, Loan record, Annual review and Fixed-rate expiry.
- `src/platform/auth`, `src/platform/runtime` and the server organisation-context module form the temporary Supabase trust boundary. Domain and mortgage business-rule modules do not import Supabase.
- `supabase/migrations` is the schema source of truth. `supabase/seed.sql` contains deterministic fictional development data and `supabase/tests` contains hosted database/RLS assertions.
- Platform modules may not import a vertical. ESLint and an architecture test enforce this direction.
- The typed registry currently resolves only the mortgage vertical. Construction and trades are recognised keys, not implemented products.

## Product rules

- A lead can be converted only through **Convert to client**, from Discovery booked, by a user with the required lead and client capabilities. Conversion creates or selects a household, preserves consent provenance, optionally adds a minimal loan record, appends audit activity and links the Converted lead atomically.
- Duplicate review compares normalised email and phone, with exact full name as a weaker signal. Matches are brokerage-scoped and never merged automatically.
- Minimal loan records contain lender, purpose and servicing dates only. They do not contain balances, rates or financial-assessment data.
- Annual-review opportunities are generated for dates within 30 days; fixed-rate-expiry opportunities are generated within 90 days. Generated opportunities begin unassigned and use the fixed fixture clock of 14 November 2026.
- Client Book and review actions are capability- and ownership-controlled. Activity is append-only through repository methods.

Campaign plans use current annual-review or fixed-rate-expiry opportunities, the household primary contact, channel-specific recorded consent, active suppression rules and masked destinations. Submission freezes an immutable version and re-evaluates eligibility. Approval references the exact snapshot reviewed and re-evaluates again; a material audience change preserves a new snapshot, pauses approval and requires a second explicit review and approval. A successful approval records both snapshot references, actor, counts and the explicit fact that no delivery occurred. Editing a reviewed plan creates a new draft version.

The conservative order is organisation/contact suppression, channel suppression, opt-out, missing or Not recorded consent, purpose eligibility, then contact-address validity. Suppression is append-only: the latest effective entry for each scope is resolved, and a Lifted entry neutralises the earlier Active entry. All useful reasons are retained while one primary reason is shown. The interface does not permit an override inside a campaign. Reinstating an opted-out channel requires externally supplied source, effective time, evidence note and explicit confirmation; the prototype does not request consent or contact anyone.

## When to extract packages

Keep this as a modular monolith while only one application consumes the platform. A second vertical can register its own typed purposes, providers and merge-field resolvers without changing platform campaign logic. Extract packages or introduce a monorepo only when a second deployable vertical exists, shared contracts have at least two proven consumers, independent release/versioning is needed, or build ownership and dependency enforcement can no longer be maintained clearly inside this repository.

## Milestone 4F boundary

Milestones 4E–4F add persistent household, member, contact, loan and task
maintenance plus a tenant-scoped referral-partner directory. Referral partners
support guarded create/update/owner/lifecycle operations, duplicate review,
lead attribution and explicit conversion attribution. Active partners are
selectable; inactive partners remain visible wherever they are historically
linked. Campaign planning remains fixture-only, and messaging, delivery,
calendar, CRM, document and construction/trades integrations remain unavailable.
Fixture mode remains isolated.

## Milestone 4F.2 — UI alignment

The nine desktop screens follow the Figma file "Broker Growth Desk – AI-native redesign" (page **Screens**). Both runtimes share one sidebar, top bar and Cmd+K command bar, and each screen renders through a shared presentational view fed by the runtime's existing repositories:

- Today: greeting, four metrics, Needs action with manual buttons, priorities sorted by response deadline then due date, recent activity from the audit log, next discovery call and fixed-rate expiries.
- Leads: tabs, stage/owner/source/purpose filters, search and response-due sorting. The response clock runs while a lead is New and stops at the first logged contact attempt (target 1 hour).
- Lead detail, Clients, Partners, Campaigns (review panel, "Not scheduled"), Settings (CSV-only data sources) and the command bar (record search, create actions, G-then-key shortcuts; no natural-language questions).

Phase 1 is desktop only. Nothing is sent, scheduled or exported. Supabase-mode Settings, Reports and Campaigns remain unavailable until their milestones.

## Milestone 4F.3 — data foundations

Five migrations add an audit actor (person, system, import), a brokerage time zone, partner next steps, household notes and loan rate type (Fixed, Variable, Split). Business dates, form date-times and displayed times all use the brokerage time zone. The recovered-lead period (30 days) is one setting in `src/verticals/mortgage/reporting/settings.ts`. To apply and verify them on the development project, follow `docs/4f3-hosted-runbook.md`.

### CSV import

`/import` brings in leads, clients and households, or referral partners from any CRM export (entry points on Leads, Clients, Partners and Settings → Data sources). The CSV file is read in the browser and is never uploaded or stored; only the parsed records the person confirms are sent to `public.import_mortgage_records`. Columns are matched automatically and can be changed; balance, rate, repayment and other financial columns are always ignored. Records are matched on normalised email or phone (partners with neither: name and organisation), so importing the same file again creates nothing new. Each record succeeds or fails on its own, consent is always recorded as Not recorded, loan records are marked Unverified with source CSV import, and every resulting audit entry — including review opportunities generated from imported loans — has the actor `import`. At most 1,000 rows per import. In fixture mode the import changes only in-memory state. Apply and verify the migration with the "CSV import" section of `docs/4f3-hosted-runbook.md`.
