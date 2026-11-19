import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicConfig } from "@/platform/runtime/config";
import type { Database } from "@/platform/database/database.types";

export async function createServerSupabaseClient() {
  const config = getSupabasePublicConfig();
  const cookieStore = await cookies();
  return createServerClient<Database>(config.url, config.publishableKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: values => {
        try { values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); }
        catch { /* Server Components cannot write; src/proxy.ts performs refresh writes. */ }
      },
    },
  });
}
