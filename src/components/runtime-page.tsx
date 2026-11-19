import type { ReactNode } from "react";
import { requireVerifiedCurrentUser } from "@/platform/auth/current-user";
import { getRuntimeMode } from "@/platform/runtime/config";
import { SupabaseWorkspace } from "./supabase-workspace";

export async function RuntimePage({ fixture, returnPath }: { fixture: ReactNode; returnPath: string }) {
  if (getRuntimeMode() === "fixture") return fixture;
  const user = await requireVerifiedCurrentUser(returnPath);
  return <SupabaseWorkspace user={user} returnPath={returnPath}/>;
}
