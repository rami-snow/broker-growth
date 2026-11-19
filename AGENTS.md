# Repository guidance

- Keep TypeScript strict and business rules outside React components.
- Organisation is the platform tenant boundary. Every tenant-owned record carries `organisationId`; repositories require `TenantContext`. The mortgage UI may call an organisation a Brokerage.
- `src/platform` must remain industry-neutral and must never import `src/verticals`. Mortgage code may import platform contracts; features may compose both.
- Screens use repositories, never fixture arrays directly.
- Use capability checks rather than membership-name checks for permissions. Membership names are fixture bundles only.
- Activity events are append-only through repository APIs.
- Lead conversion is an explicit atomic domain operation; never restore Converted to the generic lead-status workflow.
- Household is the mortgage client-book aggregate. Review opportunities must be generated with an injected clock and remain organisation-scoped.
- Keep Household, MinimalLoanRecord, mortgage lead details, referrals, conversion and mortgage trigger rules inside `src/verticals/mortgage`.
- Shared campaign code owns orchestration, immutable versions, audience snapshots, conservative consent/suppression evaluation and recorded approval. Mortgage campaign purposes, audience providers and merge fields stay in `src/verticals/mortgage` and are registered through the vertical definition.
- Campaign approval means approval of a plan and snapshot only. Never add or imply send, schedule, queue, export or delivery behaviour without a separately authorised milestone.
- Campaign runtime extensions receive explicit typed dependencies. Do not let callbacks import repositories, fixtures, globals or hidden singletons.
- Minimal loan records are for retention scheduling only. Do not add balances, rates or assessment fields.
- Never imply that development switchers, consent summaries, fixture state or contact actions are production secure or persistent.
- Do not introduce financial assessment data, lender comparisons, recommendations, financial advice, production messaging, file uploads or construction terminology.
- Build controls from `src/components/ui.tsx` and semantic values from `src/styles/tokens.css`.
- Add tests for lifecycle, tenancy, permission and metric changes.
- Use only clearly fictional information.
- `APP_RUNTIME_MODE=fixture` is the default. Supabase mode must fail closed, must not render fixture business data and must validate identity and active organisation membership on the server.
- Supabase clients belong only in `src/platform/auth` and future server repository adapters. Domain models and mortgage business rules must not import Supabase.
- `supabase/migrations` is the database source of truth. Every application table requires RLS; tenant children require database-enforced organisation consistency.
- Do not hand-edit generated database types. Regenerate them from a successfully reset local schema with `pnpm db:types`.
- Never expose a service-role/secret key to browser code or store capabilities in user-editable Auth metadata.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
