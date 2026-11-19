import Link from "next/link";
import { getRuntimeMode } from "@/platform/runtime/config";
import { SupabaseWorkspace } from "@/components/supabase-workspace";
import { PersistentReferralPartnerDetail } from "@/features/referrals/persistent-referral-partner-detail";
import { ReferralPartnerFixtureDetail } from "@/features/referrals/referral-partner-fixture-detail";
import { persistentReferralContext } from "@/app/referral-partner-actions";
export default async function Page({params}:{params:Promise<{referralPartnerId:string}>}){const{referralPartnerId}=await params;if(getRuntimeMode()==="fixture")return <ReferralPartnerFixtureDetail referralPartnerId={referralPartnerId}/>;const returnPath=`/referral-partners/${encodeURIComponent(referralPartnerId)}`,{user,activeMembership,context,repository}=await persistentReferralContext(returnPath),snapshot=await repository.detail(context,referralPartnerId);return <SupabaseWorkspace user={user} returnPath={returnPath}>{snapshot?<PersistentReferralPartnerDetail snapshot={snapshot} canManage={activeMembership.capabilities.includes("mortgage.referral.manage")}/>:<section className="surface inaccessible"><h1>Referral partner unavailable</h1><p>This partner is not available in the active brokerage.</p><Link className="ui-button ui-button--secondary" href="/referral-partners">Return to referral partners</Link></section>}</SupabaseWorkspace>;}
