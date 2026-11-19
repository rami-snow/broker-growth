"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/platform/auth/server-client";
import { requireVerifiedCurrentUser } from "@/platform/auth/current-user";
import { ACTIVE_ORGANISATION_COOKIE, listActiveMemberships } from "@/platform/organisations/server-context";
import { safeReturnPath } from "@/platform/runtime/return-url";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const returnTo = safeReturnPath(String(formData.get("returnTo") ?? ""));
  if (!email || !password) redirect(`/sign-in?error=${encodeURIComponent("Email and password are required.")}&returnTo=${encodeURIComponent(returnTo)}`);
  const client = await createServerSupabaseClient();
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) redirect(`/sign-in?error=${encodeURIComponent("Authentication failed. Check your invite-only credentials.")}&returnTo=${encodeURIComponent(returnTo)}`);
  redirect(returnTo);
}

export async function signOut() {
  const client = await createServerSupabaseClient();
  await client.auth.signOut();
  (await cookies()).delete(ACTIVE_ORGANISATION_COOKIE);
  redirect("/sign-in");
}

export async function selectOrganisation(formData: FormData) {
  const returnTo = safeReturnPath(String(formData.get("returnTo") ?? ""));
  const organisationId = String(formData.get("organisationId") ?? "");
  const user = await requireVerifiedCurrentUser(returnTo);
  const memberships = await listActiveMemberships(user);
  if (!memberships.some(item => item.organisationId === organisationId)) redirect("/no-access");
  (await cookies()).set(ACTIVE_ORGANISATION_COOKIE, organisationId, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 30 });
  redirect(returnTo);
}
