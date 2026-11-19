import { ClientBookScreen } from "@/features/clients/client-book-screen";
import { PersistentClientBookScreen } from "@/features/clients/persistent-client-book-screen";
import { SupabaseWorkspace } from "@/components/supabase-workspace";
import { getRuntimeMode } from "@/platform/runtime/config";
import { persistentClientBookContext } from "@/app/client-book-actions";
import type { ClientBookListQuery } from "@/verticals/mortgage/repositories/client-book-port";
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){if(getRuntimeMode()==="fixture")return <ClientBookScreen/>;const params=await searchParams;const {user,activeMembership,context,repository}=await persistentClientBookContext("/client-book");const query:ClientBookListQuery={search:text(params.search),status:text(params.status),ownerMembershipId:text(params.owner),sort:text(params.sort)==="recent"?"recent":"name",page:Number(text(params.page)??1)};const snapshot=await repository.list(context,query);return <SupabaseWorkspace user={user} returnPath="/client-book"><PersistentClientBookScreen snapshot={snapshot} query={query} capabilities={activeMembership.capabilities} actorMembershipId={activeMembership.id}/></SupabaseWorkspace>;}function text(value:string|string[]|undefined){return Array.isArray(value)?value[0]:value;}
