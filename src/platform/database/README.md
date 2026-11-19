# Generated database types

Run `pnpm exec supabase projects list` first and confirm that project reference
`fgqgcikmaccjamwocpat` is named `AI Native Operations` and is still the dedicated,
fictional-data-only development environment. Then run `pnpm db:types`. The script
pins that exact project reference and writes `database.types.ts` from its hosted
`public` schema. Do not create or edit the generated file by hand.

Database types are used only at Supabase client and future server repository
boundaries. Domain models remain independent of Supabase.
