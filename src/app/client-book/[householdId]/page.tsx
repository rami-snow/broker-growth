import { ClientDetail } from "@/features/clients/client-detail";
import { PersistentClientDetail } from "@/features/clients/persistent-client-detail";
import { SupabaseWorkspace } from "@/components/supabase-workspace";
import { getRuntimeMode } from "@/platform/runtime/config";
import { persistentClientBookContext } from "@/app/client-book-actions";
import Link from "next/link";
export default async function Page({params}:{params:Promise<{householdId:string}>}){const{householdId}=await params;if(getRuntimeMode()==="fixture")return <ClientDetail householdId={householdId}/>;const returnPath=`/client-book/${encodeURIComponent(householdId)}`;const{user,activeMembership,context,repository}=await persistentClientBookContext(returnPath);const snapshot=await repository.detail(context,householdId);return <SupabaseWorkspace user={user} returnPath={returnPath}>{snapshot?<PersistentClientDetail snapshot={snapshot} capabilities={activeMembership.capabilities} actorMembershipId={activeMembership.id}/>:<section className="surface inaccessible"><h1>Household unavailable</h1><p>This household is not available in the active brokerage.</p><Link className="ui-button ui-button--secondary" href="/client-book">Return to Client Book</Link></section>}</SupabaseWorkspace>;}
