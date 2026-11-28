import { FixtureNeedsActionScreen } from "@/features/today/today-screen";
import { buildPersistentTodayModel } from "@/features/today/persistent-today-screen";
import { NeedsActionView } from "@/features/today/needs-action-view";
import { SupabaseWorkspace } from "@/components/supabase-workspace";
import { getRuntimeMode } from "@/platform/runtime/config";
import { persistentOperationsContext } from "@/app/lead-actions";
import { createServerSupabaseClient } from "@/platform/auth/server-client";
import { SupabaseClientBookRepository } from "@/verticals/mortgage/persistence/supabase-client-book-repository";

export default async function Page() {
  if (getRuntimeMode() === "fixture") return <FixtureNeedsActionScreen/>;
  const { user, activeMembership, context, repository } = await persistentOperationsContext();
  const clientBook = new SupabaseClientBookRepository(await createServerSupabaseClient());
  const [snapshot, retention] = await Promise.all([repository.readSnapshot(context), clientBook.retentionToday(context)]);
  const model = buildPersistentTodayModel(snapshot, retention, activeMembership.displayName, new Date(), activeMembership.organisation.timeZone);
  return <SupabaseWorkspace user={user} returnPath="/today/needs-action"><NeedsActionView items={model.needsAction}/></SupabaseWorkspace>;
}
