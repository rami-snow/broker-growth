import type { CampaignExtensionRuntime, CampaignPurposeDefinition, AudienceSourceDefinition, MergeFieldDefinition } from "@/platform/campaigns/contracts";
import type { VerticalKey } from "@/platform/core/models";

export interface VerticalDefinition<TCapability extends string,TDependencies=unknown,TData=unknown>{
  key:VerticalKey;
  organisationLabel:string;
  clientBookLabel:string;
  capabilityBundles:Readonly<Record<string,readonly TCapability[]>>;
  enabledFeatureKeys:readonly string[];
  campaignExtensions:{purposes:readonly CampaignPurposeDefinition[];audienceSources:readonly AudienceSourceDefinition[];mergeFields:readonly MergeFieldDefinition[];runtime:CampaignExtensionRuntime<TDependencies,TData>};
}
