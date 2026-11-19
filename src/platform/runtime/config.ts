export type AppRuntimeMode = "fixture" | "supabase";

export interface SupabasePublicConfig {
  url: string;
  publishableKey: string;
}

type RuntimeEnvironment = Record<string, string | undefined>;

export function getRuntimeMode(environment: RuntimeEnvironment = process.env): AppRuntimeMode {
  const value = environment.APP_RUNTIME_MODE?.trim() || "fixture";
  if (value !== "fixture" && value !== "supabase") throw new Error(`Unsupported APP_RUNTIME_MODE: ${value}`);
  return value;
}

export function getSupabasePublicConfig(environment: RuntimeEnvironment = process.env): SupabasePublicConfig {
  if (getRuntimeMode(environment) !== "supabase") throw new Error("Supabase configuration was requested while APP_RUNTIME_MODE is not supabase");
  const url = environment.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  const missing = [!url && "NEXT_PUBLIC_SUPABASE_URL", !publishableKey && "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"].filter(Boolean);
  if (missing.length) throw new Error(`Supabase mode is missing required configuration: ${missing.join(", ")}`);
  try { new URL(url!); } catch { throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid URL"); }
  return { url: url!, publishableKey: publishableKey! };
}
