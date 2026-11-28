# Product scope

Broker Growth Desk is a growth and retention workspace for established Australian mortgage brokerages. Milestones 4A–4F progressively move the fixture workflows behind a hosted development trust boundary. Today, Leads, Client Book, retention reviews and referral-partner management are persistent in Supabase mode; campaigns remain fixture-only.

## Milestone 4A

- Explicit fixture and Supabase runtime modes
- Invite-only sign-in/sign-out and server-verified cookie sessions
- Database-backed active Brokerage membership and capability context
- Versioned PostgreSQL platform and mortgage schemas
- Row-level tenant isolation and append-only controls
- Deterministic fictional local seed and SQL/RLS tests
- A clear Supabase-mode migration state with no fixture business records

At Milestone 4A this was infrastructure, not a claim of production readiness: fixture mode supplied the complete clickable workflow while Supabase mode intentionally supplied only identity, Brokerage context and an honest migration state. Later milestones migrated the workflow slices listed below behind separately reviewed repository and operation boundaries.

## Persistent workflow milestones

- **4B–4B.1:** guarded persistent lead-to-discovery operations, bounded reads and reproducible hosted verification.
- **4C–4D.1:** atomic conversion, persistent Client Book reads, retention queues, review lifecycle and household follow-up work.
- **4E–4E.1:** guarded household/contact/member/loan/task maintenance with tightened owner, contact-visibility and archived-state boundaries.
- **4F:** mortgage-owned referral-partner directory, duplicate review, guarded lifecycle and owner changes, lead attribution, explicit conversion attribution and correct inactive historical display.

Persistent does not mean production-ready. The hosted project contains fictional development data and fixture mode remains available. Supabase mode now persists lead operations and conversion; Client Book reads and guarded household/contact/member, minimal-loan, task and review maintenance; retention generation and lifecycle work; and referral-partner reads, maintenance, owner/lifecycle changes, duplicate review and lead/conversion attribution. Referral partners and attribution semantics remain mortgage-owned, and attribution is an operational record rather than proof of causation, commission or revenue. Campaign planning remains fixture-only with no persistent campaign repository or operation boundary. No email, SMS, calendar, CRM, file, document or messaging integration is connected.

The shared platform describes organisations, contacts and operational work. The mortgage vertical supplies the product meaning: Brokerage, Broker, Household, Loan record, Annual review and Fixed-rate expiry. Those terms remain visible because they make the workflow clearer for mortgage users; internal generic names are not exposed in the interface.

## Milestone 1

- Exception-first Today view
- Brokerage-scoped lead list and detail
- Ownership assignment and broker claim
- Contact-attempt records
- Controlled lead lifecycle
- Follow-up tasks
- Discovery appointments
- Consent summary display
- Append-only activity history

## Milestone 2

- Explicit, atomic conversion from a Discovery booked lead
- Duplicate review without automatic merging
- Single and joint client households with a clear primary contact
- Channel-specific consent provenance copied without changing opt-outs or Not recorded values
- Minimal retention-only loan records
- Referral-partner attribution without commission or fee tracking
- Annual-review and fixed-rate-expiry opportunities
- Opportunity assignment, follow-up tasks and controlled lifecycle actions
- Searchable, filterable Client Book and Today queues

`Converted` means that the lead is linked to a client household. It does not mean approved, conditionally approved, unconditionally approved, settled, recommended to refinance or suitable for any lender or product.

Annual-review opportunities enter the 30-day window as Upcoming (8–30 days), Due (0–7 days) or Overdue. Fixed-rate-expiry opportunities enter the 90-day window as Upcoming (31–90 days), Due (0–30 days) or Overdue. Completed or dismissed opportunities for the same trigger are not regenerated.

## Milestone 3

- Searchable campaign plans for annual-review and fixed-rate-expiry opportunities
- Email subject and body planning with fictional starter copy (phase 1 campaigns are email only; SMS consent is still recorded on leads and clients)
- Explicitly permitted merge fields and resolved fictional sample previews
- Primary-contact-only, opportunity-backed audience previews
- Explainable eligible/excluded decisions with masked destinations
- Conservative consent, suppression, address, tenant and duplicate checks
- Immutable submitted versions, rejection reasons, fresh approval checks and append-only history
- Approval records that explicitly confirm no delivery occurred

Approved means only that a particular campaign plan and current audience snapshot were approved. It never means sent, scheduled, queued, exported, delivered, opened or clicked.

## Exclusions

No serviceability, credit assessment, borrowing-capacity estimate, income/expense/asset/liability capture, lender/product comparison, recommendation, responsible-lending decision, financial advice, refinance recommendation, loan submission, document collection, production messaging, campaign delivery or delivery tracking, scheduling, queues, exports, CRM, calendar, file or document integration is provided.

The shared-platform refactor deliberately does not generalise Household, HouseholdMember relationships, MinimalLoanRecord, lender and settlement details, referral-partner types, lead conversion, duplicate review or mortgage opportunity generation. Similar names in a future vertical are not enough reason to share a domain abstraction.
