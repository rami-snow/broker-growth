import { TodayScreen } from "@/features/today/today-screen";
import { PersistentTodayScreen } from "@/features/today/persistent-today-screen";
import { SupabaseWorkspace } from "@/components/supabase-workspace";
import { getRuntimeMode } from "@/platform/runtime/config";
import { persistentOperationsContext } from "@/app/lead-actions";
import { createServerSupabaseClient } from "@/platform/auth/server-client";
import { needsFirstResponse } from "@/verticals/mortgage/leads/response";
import { SupabaseClientBookRepository } from "@/verticals/mortgage/persistence/supabase-client-book-repository";
export default async function Page() { if(getRuntimeMode()==="fixture") return <TodayScreen/>; const {user,activeMembership,context,repository}=await persistentOperationsContext(); const clientBook=new SupabaseClientBookRepository(await createServerSupabaseClient());const[snapshot,retention]=await Promise.all([repository.readSnapshot(context),clientBook.retentionToday(context)]); return <SupabaseWorkspace user={user} returnPath="/today" leadsBadge={snapshot.leads.filter(lead=>needsFirstResponse(lead,snapshot.activities,new Date())).length}><PersistentTodayScreen snapshot={snapshot} retention={retention} userName={activeMembership.displayName} capabilities={activeMembership.capabilities} timeZone={activeMembership.organisation.timeZone}/></SupabaseWorkspace>; }
