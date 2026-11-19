import { LeadsScreen } from "@/features/leads/leads-screen";
import { PersistentLeadsScreen } from "@/features/leads/persistent-leads-screen";
import { SupabaseWorkspace } from "@/components/supabase-workspace";
import { getRuntimeMode } from "@/platform/runtime/config";
import { persistentOperationsContext } from "@/app/lead-actions";
export default async function Page() { if(getRuntimeMode()==="fixture") return <LeadsScreen/>; const {user,activeMembership,context,repository}=await persistentOperationsContext(); const snapshot=await repository.readSnapshot(context); return <SupabaseWorkspace user={user} returnPath="/leads"><PersistentLeadsScreen snapshot={snapshot} capabilities={activeMembership.capabilities}/></SupabaseWorkspace>; }
