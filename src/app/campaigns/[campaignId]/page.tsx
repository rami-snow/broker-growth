import { CampaignDetail } from "@/features/campaigns/campaign-detail";
import { RuntimePage } from "@/components/runtime-page";
export default async function Page({params}:{params:Promise<{campaignId:string}>}){const {campaignId}=await params;return <RuntimePage returnPath={`/campaigns/${encodeURIComponent(campaignId)}`} fixture={<CampaignDetail campaignId={campaignId}/>}/>;}
