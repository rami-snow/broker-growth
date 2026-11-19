import type { CampaignStatus } from "@/platform/campaigns/models";
const transitions={Draft:["Ready for review","Cancelled"],"Ready for review":["Draft","Approved","Rejected"],Rejected:["Draft"],Approved:["Draft"],Cancelled:[]}as const satisfies Record<CampaignStatus,readonly CampaignStatus[]>;
export function assertCampaignTransition(from:CampaignStatus,to:CampaignStatus){if(!(transitions[from] as readonly CampaignStatus[]).includes(to))throw new Error(`Invalid campaign transition from ${from} to ${to}`);}
