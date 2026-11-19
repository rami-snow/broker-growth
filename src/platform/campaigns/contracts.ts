import type { ContactId } from "@/platform/contacts/models";
import type { OrganisationId, VerticalKey } from "@/platform/core/models";

export type CampaignChannel="Email"|"SMS";
export type MergeFieldValue=string|number|boolean|null;
export type EligibilityDecision={eligible:true}|{eligible:false;reasonCode:string;displayReason:string};
export interface CampaignPurposeDefinition{key:string;verticalKey:VerticalKey;displayName:string;description:string;supportedChannels:readonly CampaignChannel[];audienceSourceKeys:readonly string[];permittedMergeFields:readonly string[];}
export interface AudienceSourceDefinition{key:string;verticalKey:VerticalKey;displayName:string;subjectType:string;}
export type MergeFieldValueType="text"|"date"|"number"|"boolean";
export interface MergeFieldDefinition{key:string;verticalKey:VerticalKey|"shared";displayName:string;valueType:MergeFieldValueType;}
export interface AudienceCandidate<TData>{candidateKey:string;subjectId:string;subjectDisplayName:string;contactId:ContactId;contextLabel:string;purposeDecision:EligibilityDecision;data:TData;}
export interface AudienceRequest{organisationId:OrganisationId;purposeKey:string;sourceKey:string;now:Date;}
export interface AudienceSourceProvider<TDependencies,TData>{sourceKey:string;getCandidates:(request:AudienceRequest,dependencies:TDependencies)=>readonly AudienceCandidate<TData>[];}
export interface MergeFieldResolver<TDependencies,TData>{mergeFieldKey:string;resolve:(candidate:AudienceCandidate<TData>,dependencies:TDependencies)=>MergeFieldValue;}
export interface CampaignExtensionRuntime<TDependencies,TData>{audienceProviders:readonly AudienceSourceProvider<TDependencies,TData>[];mergeFieldResolvers:readonly MergeFieldResolver<TDependencies,TData>[];}
