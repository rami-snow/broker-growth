import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Read access to columns and tables added by the 4F.3 migrations (20261128*), which are not yet in the
 * generated `database.types.ts`. AGENTS.md forbids hand-editing those types. After applying the migrations,
 * run `pnpm db:types`, switch these reads to the typed client and delete this file.
 */
export const untyped = (client: unknown) => client as SupabaseClient;
