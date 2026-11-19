import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "./server-client";

export async function getVerifiedCurrentUser() {
  const client = await createServerSupabaseClient();
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function requireVerifiedCurrentUser(returnPath = "/today") {
  const user = await getVerifiedCurrentUser();
  if (!user) redirect(`/sign-in?returnTo=${encodeURIComponent(returnPath)}`);
  return user;
}
