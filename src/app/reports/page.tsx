import { FutureScreen } from "@/features/future/future-screen";
import { SupabaseWorkspace } from "@/components/supabase-workspace";
import { requireVerifiedCurrentUser } from "@/platform/auth/current-user";
import { getRuntimeMode } from "@/platform/runtime/config";

const reports = <FutureScreen title="Reports" heading="Reports are coming" body="They will show response times, conversion and lead sources."/>;
export default async function Page() {
  if (getRuntimeMode() === "fixture") return reports;
  const user = await requireVerifiedCurrentUser("/reports");
  return <SupabaseWorkspace user={user} returnPath="/reports">{reports}</SupabaseWorkspace>;
}
