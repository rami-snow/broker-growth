import { redirect } from "next/navigation";
import { signIn } from "@/app/auth-actions";
import { Button, TextField } from "@/components/ui";
import { getRuntimeMode } from "@/platform/runtime/config";
import { safeReturnPath } from "@/platform/runtime/return-url";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string; returnTo?: string }> }) {
  if (getRuntimeMode() === "fixture") redirect("/today");
  const query = await searchParams;
  const returnTo = safeReturnPath(query.returnTo);
  return <main className="auth-shell"><section className="auth-card" aria-labelledby="sign-in-title"><span className="auth-mark">BG</span><p className="eyebrow">Invite-only access</p><h1 id="sign-in-title">Sign in to Broker Growth Desk</h1><p>Use the credentials supplied by your brokerage administrator. Public registration is not available.</p>{query.error && <div className="form-error" role="alert">{query.error}</div>}<form action={signIn} className="auth-form"><input type="hidden" name="returnTo" value={returnTo}/><TextField label="Email" name="email" type="email" autoComplete="email" required/><TextField label="Password" name="password" type="password" autoComplete="current-password" required/><Button type="submit" fullWidth>Sign in</Button></form><small>Authentication verifies identity only. Persistent product workflows remain under migration in Milestone 4A.</small></section></main>;
}
