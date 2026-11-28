# Milestone 4F.3 — applying and verifying the migrations on the development project

These steps apply the five 4F.3 migrations to the dedicated **development** Supabase project
(`AI Native Operations`, `fgqgcikmaccjamwocpat`) and verify them. Never run them against a
production project. Never paste credentials into chat or commit them; enter them only in your own
terminal session.

## Migrations, in order

| File | What it does |
|---|---|
| `20261128090000_audit_actor_type.sql` | Adds `actor_type` (`person`, `system`, `import`) to `activity_events` and `campaign_activity_events`, backfills existing rows, defaults it on insert |
| `20261128090100_brokerage_time_zone.sql` | Adds validated `organisations.time_zone` (default `Australia/Sydney`), `private.organisation_business_date`, `public.organisation_time_zone`, and recreates four retention functions to use the brokerage zone |
| `20261128090200_referral_partner_next_step.sql` | Adds `next_step` and `set_mortgage_referral_partner_next_step` |
| `20261128090300_household_notes.sql` | Adds the append-only `mortgage_household_notes` table with RLS and `add_mortgage_household_note` |
| `20261128090400_loan_rate_type.sql` | Adds `rate_type` (`Fixed`, `Variable`, `Split`) and `set_mortgage_loan_rate_type` |

## 1. Confirm the target

```bash
pnpm exec supabase projects list
pnpm exec supabase migration list --remote
```

Check: the linked project is **AI Native Operations** with reference **fgqgcikmaccjamwocpat**, and
the remote list ends at `20261119090500` with the five `20261128…` migrations shown as local only.
Stop if the name or reference differs.

## 2. Dry run, then apply

```bash
pnpm exec supabase db push --dry-run --remote --skip-vault
```

Check: exactly the five `20261128…` files are listed, in the order above, and nothing else.

```bash
pnpm exec supabase db push --remote --skip-vault
```

Migration (a) briefly disables the append-only triggers on the two audit tables to backfill
`actor_type`, then re-enables them in the same transaction. If the push fails part-way, the failed
migration rolls back; do not edit rows by hand — report the error.

## 3. Regenerate the database types

```bash
pnpm db:types
```

Then commit `src/platform/database/database.types.ts`. The app reads the new columns through these
generated types.

## 4. Run the verification suites

New 4F.3 suite (30 assertions, one transaction, rolled back):

```bash
pnpm db:test:hosted-4f3
```

Check:
- Every line is `ok - …`; the summary row shows `passed = 30`, `failed = 0`.
- The residue query after the rollback shows `0` for `notes`, `commands` and `non_default_zones`.
  `activities` and `loans_with_rate_type` are `0` only if nobody has used the new features on the
  development project yet.

Regression suites, which must still pass unchanged (the retention suites exercise the four
recreated functions):

```bash
pnpm db:test:hosted-client-book
pnpm db:test:hosted-maintenance
pnpm db:test:hosted-referrals
pnpm db:test:hosted-review-cli
pnpm db:test:hosted-operations-cli
SUPABASE_TEST_PASSWORD='<temporary fictional-user credential>' pnpm db:test:hosted-rest
```

## 5. Check the app in Supabase mode

With `APP_RUNTIME_MODE=supabase` in your ignored `.env.local`:

- Today, Clients, Partners and Settings load without an error about the brokerage time zone.
- Settings → Audit log shows `Person` or `System` for every entry.
- A household: add a note, and set a loan's rate type (Variable is refused while a fixed-rate expiry date exists).
- A referral partner: set and clear the next step; the Partners table shows it.
- Enter a next action of 9:30 am on a lead; it is shown back as 9:30 am.

## Rollback

Migrations are forward-only. If something is wrong, stop and report it; a corrective migration is
written rather than reverting the database.

## CSV import (`20261128090500_csv_import.sql`)

This later migration adds the CSV import. Apply it only after the five migrations above are on the
development project. It:

- allows `CSV import` as a loan-record source and a consent provenance;
- lets `private.default_audit_actor_type` honour a transaction-local `app.audit_actor_type` flag, set
  only inside the import, so review opportunities generated from imported loans are attributed to `import`;
- adds `public.preview_mortgage_import` (read-only) and `public.import_mortgage_records` (security
  definer, capability per kind, command ledger, at most 1,000 records, each record in its own
  subtransaction, matched on email or phone).

### 1. Confirm the target and dry run

```bash
pnpm exec supabase projects list
pnpm exec supabase db push --dry-run --remote --skip-vault
```

Check: the linked project is **AI Native Operations** (`fgqgcikmaccjamwocpat`), and the dry run lists
exactly one file, `20261128090500_csv_import.sql`. Stop if the name, reference or file list differs.

### 2. Apply and regenerate types

```bash
pnpm exec supabase db push --remote --skip-vault
pnpm db:types
```

Commit `src/platform/database/database.types.ts` if it changed (it gains the two new functions).

### 3. Verify

```bash
pnpm db:test:hosted-csv-import
```

Check:
- Every line is `ok - …`; the summary row shows `passed = 32`, `failed = 0`.
- The residue query after the rollback shows `0` in all five columns. `import_activities` stays `0`
  only until someone runs a real import on the development project.

Then re-run the 4F.3 suite, which exercises the changed audit-actor default:

```bash
pnpm db:test:hosted-4f3
```

Check: `passed = 30`, `failed = 0`, as before.

### 4. Check the app in Supabase mode

- Clients → **Import clients** opens the import with "Clients and households" selected.
- Choose a small CSV of clearly fictional people (for example two rows sharing a Household value and
  one with a `Loan balance` column). The balance column is listed under "Columns not imported".
- Preview, then import. The results table shows each record as Created, Already existed, Repeated in
  file or Not imported, with a reason.
- Import the same file again: the preview shows every record as "Already exists" and the Import
  button is disabled.
- Settings → Audit log shows `Import` as the actor for the created records and generated reviews.
