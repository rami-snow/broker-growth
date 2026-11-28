import { SupabaseWorkspace } from "@/components/supabase-workspace";
import { FixtureImportScreen, PersistentImportScreen } from "@/features/imports/import-screens";
import { persistentImportContext } from "@/app/import-actions";
import { getRuntimeMode } from "@/platform/runtime/config";
import { importKinds, type ImportKind } from "@/verticals/mortgage/imports/model";

export default async function Page({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const requested = (await searchParams).type, type = Array.isArray(requested) ? requested[0] : requested;
  const initialKind = importKinds.find(item => item.value === type)?.value as ImportKind | undefined;
  if (getRuntimeMode() === "fixture") return <FixtureImportScreen initialKind={initialKind}/>;
  const { user, activeMembership, context, repository } = await persistentImportContext("/import");
  const setup = { owners: await repository.owners(context), allowedKinds: importKinds.filter(item => activeMembership.capabilities.includes(item.capability)).map(item => item.value), currentMembershipId: activeMembership.id };
  return <SupabaseWorkspace user={user} returnPath="/import"><PersistentImportScreen setup={setup} initialKind={initialKind}/></SupabaseWorkspace>;
}
