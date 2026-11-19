# Architecture

Broker Growth Desk remains a strict-TypeScript Next.js modular monolith with App Router routes. Fixture mode retains the root client provider and its in-memory repositories. Supabase mode uses server-verified Auth and database-backed organisation context, renders no fixture business records, and persists Today, Leads, Client Book, retention review and referral-partner workflows through server repository adapters. Campaigns remain fixture-only.

## Dependency direction

```text
platform → imports no vertical code
verticals/mortgage → may import platform
features → may compose platform and mortgage
app routes → compose features
data/vertical-registry → composition root
platform/auth + server organisation context → Supabase boundary
server repositories → generated database types + guarded database operations
```

ESLint restricts imports from `src/platform` into `src/verticals`. An architecture test recursively checks the same invariant. The composition registry is intentionally outside the platform because it imports the mortgage definition.

## Shared platform ownership

- `platform/core`: OrganisationId, UserId, MembershipId, VerticalKey, TenantContext and shared capabilities.
- `platform/organisations`: industry-neutral Organisation and OrganisationMembership.
- `platform/contacts`: Contact and ContactMethod.
- `platform/leads`: typed LeadFoundation with contact fields, source, ownership, lifecycle state and versioning.
- `platform/tasks` and `platform/appointments`: organisation-scoped operational work.
- `platform/opportunities`: subject references, OpportunityFoundation and reusable lifecycle transition mechanics.
- `platform/consent` and `platform/audit`: channel evidence and append-only event contracts.
- `platform/permissions`: tenant/capability primitives without mortgage positions.
- `platform/campaigns`: industry-neutral campaign records, immutable versions, snapshots, explainable eligibility, suppression, approval, lifecycle orchestration and typed extension contracts.
- `platform/verticals`: the typed VerticalDefinition contract.

Platform code knows no Household, loan, lender, Broker position, annual-review rule or fixed-rate-expiry rule.

## Mortgage vertical ownership

- Brokerage-facing membership profiles and mortgage capability bundles.
- MortgageLead details and lifecycle.
- Household and HouseholdMember relationships to shared Contact records.
- MinimalLoanRecord, lender, purpose, settlement and review dates.
- Referral-partner directory records, relationship types, normalization, duplicate review, lifecycle and attribution semantics.
- Explicit lead-to-household conversion, duplicate review and rollback.
- Annual-review and fixed-rate-expiry generation and lifecycle rules.
- Annual-review and fixed-rate-expiry campaign definitions, opportunity-backed audience providers and mortgage merge-field resolvers.
- Fictional fixtures and the in-memory repositories that orchestrate this mortgage workflow.

Household remains mortgage-specific because it is the client aggregate used for joint applicants, retention ownership and loan-linked reviews. MinimalLoanRecord remains mortgage-specific because its fields and compliance boundary have mortgage meaning; it is not a generic asset or record.

## Tenancy and identity

Organisation is the internal tenant primitive. Every tenant-owned record carries `organisationId`, and every repository call takes `TenantContext { organisationId, userId }`. OrganisationMembership contains shared identity, status and capabilities. The mortgage-only `mortgageProfile.position` contains Brokerage administrator, Broker or Support person.

The interface still says Brokerage and Broker. Those are accurate vertical terms, while Organisation and membership extension are internal architecture terms.

In Supabase mode, `auth.users` is linked to `user_profiles`; organisation memberships and capabilities are relational records. The active-organisation cookie is only a preference. Every server resolution re-queries active memberships and every database operation remains constrained by RLS. Capability names come from the typed application capability bundles, never Auth user metadata. Only the mortgage vertical is accepted by the registry.

## Runtime and authentication boundary

`src/proxy.ts` refreshes cookie-backed Supabase sessions and performs only an optimistic authenticated-route redirect. Server Components and actions call the platform authentication boundary and verify the user through Supabase Auth. Sign-in is password-based and invite-only; there is no public registration, recovery, social login or MFA in this milestone. Return destinations are accepted only as application-relative paths.

Supabase mode configuration is validated and fails closed. It never falls back to fixture mode. Today, Leads, lead conversion, Client Book maintenance and retention work, and Referral partners use server components for initial reads, authenticated server repositories, server actions for commands, generated database types and path revalidation. Referral selectors expose active partners while targeted linked-record reads preserve inactive historical attribution. Campaign routes remain outside the persistent runtime. Development verification uses the dedicated hosted `AI Native Operations` project (`fgqgcikmaccjamwocpat`), not local containers. Supabase's `production` label for a main project branch is not an application environment decision; this project remains development-only and fictional-data-only.

## Repository boundaries

`InMemoryOperationsRepository` owns mortgage lead operations. `InMemoryClientBookRepository` owns household, loan and review operations. `InMemoryCampaignRepository` owns generic campaign operations and consumes an explicitly injected vertical runtime. All validate organisation membership and share fixture state. Screens never read fixture arrays directly. Supabase mode uses separate authenticated server repositories and guarded operation functions for lead work, conversion, Client Book/retention and referral management. It has no persistent campaign repository or campaign mutation boundary.

Conversion snapshots all fixture state, creates or selects a household, copies consent provenance, optionally creates a minimal loan record, appends activity, and only then marks the lead Converted. Failure restores the snapshot. A production implementation requires a database transaction.

Review generation remains a pure mortgage service with an injected clock. Shared opportunity code owns only the lifecycle mechanism.

## Campaign orchestration and vertical registration

The registry currently contains only `mortgageVerticalDefinition`. Campaign contract metadata (purposes, audience sources and permitted merge fields) is separate from runtime adapters. Audience providers and merge resolvers receive explicit typed fixture dependencies and an injected evaluation clock; they do not obtain repositories through imports or globals.

Platform orchestration validates registered combinations, evaluates shared consent/suppression/address/duplicate rules, freezes reviewed versions, preserves snapshots and records approvals. Every campaign record read requires `campaign.view`; approval and rejection additionally require `campaign.approve`. Repository projections are defensive copies so consumers cannot mutate frozen versions, snapshots or approvals through returned references.

Approval is a two-step review handshake. The caller supplies the reviewed snapshot ID, the repository freshly evaluates the audience and compares a canonical material projection covering candidate identity, decision, reasons, masked destination, consent, suppression, merge values and display context. Snapshot IDs and evaluation timestamps do not make an audience materially different. If the audience changed, the repository preserves the new snapshot and structured changes but does not approve; the caller must present and explicitly approve that new snapshot. Mortgage adapters select existing review opportunities, enforce household/opportunity eligibility and resolve only permitted mortgage data. The platform imports no mortgage code.

A future trades maintenance-reminder vertical can provide its own definition, candidate data, provider and merge resolvers at the composition root without changing campaign platform code. New channels or materially different consent semantics would require deliberate platform contract changes.

There is no delivery adapter in Milestone 3. A future adapter boundary would consume an approved immutable version and approved audience snapshot only after a separately designed authorization, final eligibility, unsubscribe, idempotency, queueing, provider and delivery-audit model.

## Persistence schema and transaction preparation

The migration defines normalized shared platform tables and explicit mortgage tables. Every tenant-owned row contains `organisation_id`; composite foreign keys prevent tenant-crossing relationships. Typed task subjects use generated mortgage household and review-opportunity keys so PostgreSQL can enforce tenant-consistent foreign keys without introducing generic industry metadata. JSONB is limited to activity detail and snapshot-shaped resolved merge values. No assessment, balance, rate, income, expense, asset, liability, credit, document or recommendation fields exist.

Persistent lead reads resolve the tenant-scoped lead set first, request explicit columns, then constrain contact, mortgage detail, consent, task, appointment and activity reads to the exact identifiers in that set. A single-lead page therefore cannot load unrelated organisation records. Membership profiles and capabilities are similarly constrained to active membership identifiers. The current-slice indexes cover organisation/newest-lead reads, active membership lookup and tenant-scoped task/appointment foreign-key reads; no speculative advisor index set is added.

Consent display and fixture campaign eligibility share one current-effective evidence selector. It ignores future-effective rows and orders eligible evidence by effective timestamp, recorded timestamp and immutable identifier. Missing evidence stays absent, `Not recorded` remains explicit, and neither is affirmative permission.

Checked-in migrations are authoritative and hosted changes are forward-only. The schema and generated `public` types cover the verified Milestone 4F lead, conversion, Client Book, retention and referral slices. The generation command pins the development project reference and must be preceded by a project-name/reference check. Generated types are imported only at Supabase and persistent repository boundaries. Verification is split across Auth/PostgREST, transactional operation, residue and pgTAP suites; the Docker-free hosted runners do not imply that pgTAP executed when the CLI delegates that path to Docker/Podman.

The database currently exposes authenticated reads through membership- and capability-scoped RLS. Ordinary authenticated roles have no direct insert, update or delete privileges or non-read policies on workflow tables. This deliberately prevents browser clients from assembling partial conversions, approving campaigns, freezing versions, changing lifecycle/ownership or bypassing append-only audit requirements.

Milestone 4B lead operations use eight narrow authenticated functions plus a tenant-scoped command ledger. Milestones 4C–4F apply the same operation boundary to conversion, Client Book maintenance, retention reviews and referral management. Each security-definer operation derives its actor from `auth.uid()`, validates active organisation membership, exact capabilities, ownership where applicable, lifecycle, expected version and related tenant identifiers, locks target rows, and writes mutations plus audit events atomically. Direct authenticated table writes remain closed. Checked command UUIDs return the original result only for identical inputs and reject changed-input reuse. Feature components never receive a Supabase client.

Hosted verification is split deliberately: the 40-assertion REST suite verifies the Auth/PostgREST surface and RLS; the Node PostgreSQL operation suite verifies transactional RPC behaviour and rollback residue over TLS; pgTAP retains schema-level transaction tests but remains unexecuted where the CLI requires Docker/Podman. Temporary database credentials enter only through the operation runner environment and are neither logged nor checked in.

Lead conversion, Client Book/review maintenance and referral management now have separately reviewed transactional operations. Referral reads remain tenant-scoped under RLS; ordinary reads use explicit columns, active selectors are bounded to active partners, and historical inactive display uses targeted linked-record reads. Referral semantics remain mortgage-owned. Campaign submission and approval still require their own separately reviewed persistent boundary and must not inherit authority from the existing operation endpoints.

## Package extraction criteria

Keep these boundaries inside one application until a second deployable product proves reuse. Consider packages or a monorepo when there are at least two real consumers, independent releases are required, ownership/build pipelines diverge, or repository-level dependency enforcement is no longer sufficient. Do not extract packages merely to mirror folders.
